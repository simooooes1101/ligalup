// ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// SERVIDOR HTTP & CORE API (index.js) - MVP v2.0
// ============================================================================

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const db = require('./config/db');
const { protect, restrictTo } = require('./middlewares/auth');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Inicialização do provedor de e-mail (Resend API)
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Remetente padrão das notificações
const SYSTEM_SENDER = process.env.SYSTEM_EMAIL_SENDER || 'notificacoes@atleticalup.com.br';

// ----------------------------------------------------------------------------
// HELPER: ENVIO DE NOTIFICAÇÕES COM RETENTATIVA & AUDITORIA (Fase 2)
// ----------------------------------------------------------------------------
async function enviarNotificacaoEmail(userId, gatilho, destinatario, titulo, conteudo, maxRetries = 3) {
  let attempt = 1;
  let success = false;
  let lastError = null;

  console.log(`✉️ Notificação [${gatilho}]: Iniciando envio de e-mail para ${destinatario}...`);

  while (attempt <= maxRetries && !success) {
    try {
      // Simulação ou chamada real da API Resend
      if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123456789_placeholder_api_key') {
        await resend.emails.send({
          from: SYSTEM_SENDER,
          to: destinatario,
          subject: titulo,
          html: conteudo,
        });
      } else {
        // Modo Sandbox: Simula uma falha em 30% das vezes para demonstrar o circuito de falhas (TC-07)
        if (gatilho === 'ATLETA_BARRADO' && Math.random() < 0.4) {
          throw new Error('Sandbox Timeout: Resend API Connection Timeout. Mailbox unavailable.');
        }
        console.log(`📝 [SANDBOX EMAIL] De: ${SYSTEM_SENDER} -> Para: ${destinatario} | Assunto: ${titulo}`);
      }

      success = true;
      console.log(`✔️ E-mail enviado com sucesso na tentativa ${attempt}.`);
    } catch (err) {
      lastError = err.message;
      console.warn(`⚠️ Tentativa ${attempt} falhou: ${lastError}`);
      attempt++;
      // Backoff exponencial simples (aguarda antes de tentar novamente)
      if (attempt <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }

  // --- LOG DE AUDITORIA NO BANCO DE DADOS (logs_notificacoes) ---
  // Nota: A inserção do log é sempre permitida (INSERT), mas a alteração/remoção é travada
  try {
    const queryText = `
      INSERT INTO logs_notificacoes (usuario_id, tipo_notificacao, gatilho_regra, destinatario_email, status_entrega, erro_detalhe)
      VALUES ($1, $2, $3, $4, $5, $6);
    `;
    await db.query(queryText, [
      userId || null,
      'Email',
      gatilho,
      destinatario,
      success ? 'ENVIADO' : 'FALHA',
      success ? null : `Falhou após ${maxRetries} tentativas. Último erro: ${lastError}`
    ]);
    console.log(`💾 Log de auditoria registrado no banco para o gatilho '${gatilho}'.`);
  } catch (dbErr) {
    console.error('❌ Falha crítica ao gravar log de auditoria no PostgreSQL:', dbErr.message);
  }
}

// ----------------------------------------------------------------------------
// 1. ENDPOINTS DE AUTENTICAÇÃO
// ----------------------------------------------------------------------------

app.post('/api/auth/login', async (req, res, next) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ status: 'fail', error: 'Informe email e senha!' });
    }

    // Busca usuário no banco
    const userRes = await db.query('SELECT * FROM usuarios WHERE email = $1 AND status = TRUE', [email]);
    const user = userRes.rows[0];

    if (!user || !(await bcrypt.compare(password, user.senha_hash))) {
      return res.status(401).json({ status: 'fail', error: 'Email ou senha inválidos!' });
    }

    // Cria token JWT
    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email, cargo: user.cargo, diretoria: user.diretoria },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '15m' }
    );

    res.status(200).json({
      status: 'success',
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        cargo: user.cargo,
        diretoria: user.diretoria
      }
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 1.1 ADMINISTRAÇÃO E CRIAÇÃO DE NOVOS MEMBROS (RBAC EXCLUSIVO PRESIDÊNCIA - MASTER)
// ----------------------------------------------------------------------------

// Listar diretores/membros ativos
app.get('/api/users', protect, restrictTo(['Master', 'Diretor']), async (req, res, next) => {
  try {
    const usersRes = await db.query('SELECT id, nome, email, cargo, diretoria, status, created_at FROM usuarios ORDER BY nome');
    res.status(200).json({ status: 'success', data: usersRes.rows });
  } catch (err) {
    next(err);
  }
});

// Cadastrar novo membro (Exclusivo Presidência - Nível Master)
app.post('/api/users', protect, restrictTo(['Master']), async (req, res, next) => {
  const { nome, email, cargo, diretoria, password } = req.body;
  try {
    if (!nome || !email || !cargo || !password) {
      return res.status(400).json({ status: 'fail', error: 'Nome, E-mail, Cargo e Senha são obrigatórios!' });
    }

    // 1. Verifica se e-mail já está cadastrado
    const checkUser = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (checkUser.rowCount > 0) {
      return res.status(409).json({ status: 'fail', error: 'Erro: Este endereço de e-mail já está cadastrado no sistema!' });
    }

    // 2. Criptografa a senha com hash Bcrypt robusto
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    // 3. Insere o novo usuário de forma atômica associando a transação
    const queryText = `
      INSERT INTO usuarios (nome, email, senha_hash, cargo, diretoria, status)
      VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, nome, email, cargo, diretoria, status;
    `;
    const newUserRes = await db.queryWithSession(req.user.id, queryText, [
      nome, email, hashPassword, cargo, diretoria || 'Nenhuma'
    ]);
    const newUser = newUserRes.rows[0];

    // 4. --- GATILHO EMAIL F2: BEM-VINDO (Notificação de Boas-Vindas) ---
    await enviarNotificacaoEmail(
      req.user.id,
      'NOVO_DIRETOR_CADASTRADO',
      newUser.email,
      `🐺 Bem-vindo à Diretoria da Atlética LUP!`,
      `<h3>Olá ${newUser.nome},</h3>
       <p>Você foi cadastrado com sucesso como membro oficial da diretoria da <b>Atlética LUP</b>.</p>
       <ul>
         <li><b>Cargo:</b> ${newUser.cargo}</li>
         <li><b>Pasta/Diretoria:</b> ${newUser.diretoria}</li>
         <li><b>Instruções:</b> Acesse o portal institucional e utilize sua senha padrão temporária fornecida pela presidência.</li>
       </ul>
       <p><i>LUP Backoffice System - Governança & Eficiência.</i></p>`
    );

    res.status(210).json({
      status: 'success',
      data: newUser,
      message: 'Membro da diretoria cadastrado com sucesso e notificado por e-mail.'
    });
  } catch (err) {
    next(err);
  }
});

// Editar membro da diretoria (Exclusivo Presidência - Nível Master)
app.put('/api/users/:id', protect, restrictTo(['Master']), async (req, res, next) => {
  const { id } = req.params;
  const { nome, email, cargo, diretoria, status, password } = req.body;
  try {
    // 1. Verifica se o usuário existe
    const checkUser = await db.query('SELECT id, senha_hash FROM usuarios WHERE id = $1', [id]);
    if (checkUser.rowCount === 0) {
      return res.status(404).json({ status: 'fail', error: 'Usuário não encontrado!' });
    }

    // 2. Se e-mail foi alterado, verifica se já está em uso
    if (email) {
      const checkEmail = await db.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email, id]);
      if (checkEmail.rowCount > 0) {
        return res.status(409).json({ status: 'fail', error: 'Erro: Este endereço de e-mail já está cadastrado em outra conta!' });
      }
    }

    // 3. Monta query dinâmica de update
    let queryText = 'UPDATE usuarios SET ';
    const queryParams = [];
    let paramIndex = 1;

    if (nome !== undefined) {
      queryText += `nome = $${paramIndex++}, `;
      queryParams.push(nome);
    }
    if (email !== undefined) {
      queryText += `email = $${paramIndex++}, `;
      queryParams.push(email);
    }
    if (cargo !== undefined) {
      queryText += `cargo = $${paramIndex++}, `;
      queryParams.push(cargo);
    }
    if (diretoria !== undefined) {
      queryText += `diretoria = $${paramIndex++}, `;
      queryParams.push(diretoria);
    }
    if (status !== undefined) {
      queryText += `status = $${paramIndex++}, `;
      queryParams.push(status);
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashPassword = await bcrypt.hash(password, salt);
      queryText += `senha_hash = $${paramIndex++}, `;
      queryParams.push(hashPassword);
    }

    // Se nenhum campo foi fornecido para atualização
    if (queryParams.length === 0) {
      return res.status(400).json({ status: 'fail', error: 'Nenhum campo fornecido para atualização.' });
    }

    // Remove a última vírgula e espaço
    queryText = queryText.slice(0, -2);
    queryText += ` WHERE id = $${paramIndex++} RETURNING id, nome, email, cargo, diretoria, status;`;
    queryParams.push(id);

    const updatedUserRes = await db.queryWithSession(req.user.id, queryText, queryParams);
    const updatedUser = updatedUserRes.rows[0];

    res.status(200).json({
      status: 'success',
      data: updatedUser,
      message: 'Membro da diretoria atualizado com sucesso no Supabase.'
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 2. ROTAS DE EVENTOS E MARKETING
// ----------------------------------------------------------------------------

app.get('/api/events', protect, async (req, res, next) => {
  try {
    const eventsRes = await db.query('SELECT * FROM eventos ORDER BY created_at DESC');
    res.status(200).json({ status: 'success', data: eventsRes.rows });
  } catch (err) {
    next(err);
  }
});

app.post('/api/events', protect, restrictTo(['Master', 'Diretor', 'Coordenador']), async (req, res, next) => {
  const { nome, data_evento, local, orcamento_previsto } = req.body;
  try {
    // Insere novo evento em Rascunho
    const queryText = `
      INSERT INTO eventos (nome, data_evento, local, orcamento_previsto, status_aprovacao, criador_id)
      VALUES ($1, $2, $3, $4, 'Rascunho', $5) RETURNING *;
    `;
    const newEventRes = await db.queryWithSession(req.user.id, queryText, [
      nome, data_evento, local, orcamento_previsto, req.user.id
    ]);
    
    res.status(210).json({ status: 'success', data: newEventRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Atualiza o Status do Evento (Dispara Triggers de Validação RN-EV-01 e Geração RN-EV-02)
app.put('/api/events/:id/status', protect, async (req, res, next) => {
  const { id } = req.params;
  const { status_aprovacao } = req.body;
  try {
    // Busca informações atuais do evento
    const evtBeforeRes = await db.query('SELECT * FROM eventos WHERE id = $1', [id]);
    const event = evtBeforeRes.rows[0];
    if (!event) {
      return res.status(404).json({ status: 'fail', error: 'Evento não localizado!' });
    }

    // Executa o update injetando o contexto do usuário na sessão da transação (essencial para RN-EV-01)
    const queryText = `
      UPDATE eventos 
      SET status_aprovacao = $1 
      WHERE id = $2 RETURNING *;
    `;
    const updatedEvtRes = await db.queryWithSession(req.user.id, queryText, [status_aprovacao, id]);
    const updatedEvent = updatedEvtRes.rows[0];

    // --- GATILHO EMAIL F2: SOLICITACAO_VERBA ---
    if (status_aprovacao === 'Aguardando Tesouraria') {
      const treasuryUsers = await db.query("SELECT email FROM usuarios WHERE diretoria = 'Tesouraria' AND status = TRUE");
      
      for (const tUser of treasuryUsers.rows) {
        await enviarNotificacaoEmail(
          req.user.id,
          'SOLICITACAO_VERBA',
          tUser.email,
          `💸 Solicitação de Verba para Evento: ${event.nome}`,
          `<h3>Solicitação de Recursos</h3>
           <p>O evento <b>${event.nome}</b> está aguardando aprovação orçamentária.</p>
           <ul>
             <li><b>Valor Previsto:</b> R$ ${event.orcamento_previsto}</li>
             <li><b>Local:</b> ${event.local}</li>
             <li><b>Data:</b> ${event.data_evento}</li>
           </ul>
           <p>Por favor, acesse o painel da Tesouraria para analisar e aprovar.</p>`
        );
      }
    }

    res.status(200).json({ status: 'success', data: updatedEvent });
  } catch (err) {
    next(err);
  }
});

// Calendário Editorial de Marketing
app.post('/api/marketing/calendar', protect, restrictTo(['Master', 'Diretor', 'Coordenador'], ['Marketing']), async (req, res, next) => {
  const { evento_id, plataforma, data_publicacao, descricao } = req.body;
  try {
    // A trigger no Postgres trg_verificar_calendario_evento rejeitará se o evento associado não estiver 'Aprovado' (RN-EV-01)
    const queryText = `
      INSERT INTO calendario_editorial (evento_id, plataforma, data_publicacao, descricao, responsavel_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const postRes = await db.queryWithSession(req.user.id, queryText, [
      evento_id, plataforma, data_publicacao, descricao, req.user.id
    ]);

    res.status(210).json({ status: 'success', data: postRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get('/api/marketing/calendar', protect, async (req, res, next) => {
  try {
    const calendarRes = await db.query(`
      SELECT c.*, e.nome as evento_nome 
      FROM calendario_editorial c 
      JOIN eventos e ON c.evento_id = e.id 
      ORDER BY c.data_publicacao ASC
    `);
    res.status(200).json({ status: 'success', data: calendarRes.rows });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 3. ROTAS DE PRODUTOS E VENDAS
// ----------------------------------------------------------------------------

app.get('/api/products', protect, async (req, res, next) => {
  try {
    const productsRes = await db.query(`
      SELECT p.id as produto_id, p.nome, p.preco_custo, p.preco_venda, 
             pv.id as variante_id, pv.tamanho, pv.estoque_atual
      FROM produtos p
      JOIN produto_variantes pv ON p.id = pv.produto_id
      ORDER BY p.nome, pv.tamanho
    `);
    res.status(200).json({ status: 'success', data: productsRes.rows });
  } catch (err) {
    next(err);
  }
});

// Finaliza a venda/distribuição de variante de produto (RN-PROD-01)
app.post('/api/products/distribute', protect, restrictTo(['Master', 'Diretor', 'Coordenador'], ['Produtos']), async (req, res, next) => {
  const { variante_id, quantidade, comprador } = req.body;
  try {
    // 1. Busca a variante e o produto para calcular valores
    const variantRes = await db.query('SELECT * FROM produto_variantes WHERE id = $1', [variante_id]);
    const variant = variantRes.rows[0];
    if (!variant) {
      return res.status(404).json({ status: 'fail', error: 'Variante de produto não localizada!' });
    }

    const productRes = await db.query('SELECT * FROM produtos WHERE id = $1', [variant.produto_id]);
    const product = productRes.rows[0];

    // 2. Decrementa o estoque. A trigger constraint do Postgres (chk_estoque_positivo) impedirá estoque < 0 (RN-PROD-01)
    const updateStockQuery = `
      UPDATE produto_variantes 
      SET estoque_atual = estoque_atual - $1 
      WHERE id = $2 RETURNING *;
    `;
    await db.queryWithSession(req.user.id, updateStockQuery, [quantidade, variante_id]);

    // 3. Insere a entrada de caixa correspondente de forma atômica
    const totalVenda = product.preco_venda * quantidade;
    const addFinanceQuery = `
      INSERT INTO lancamentos_financeiros (tipo, categoria, valor, produto_id, status_conciliacao)
      VALUES ('Entrada', $1, $2, $3, FALSE) RETURNING *;
    `;
    const financeRes = await db.queryWithSession(req.user.id, addFinanceQuery, [
      `Venda ${product.nome} (Qtd: ${quantidade}) - Comprador: ${comprador}`,
      totalVenda,
      product.id
    ]);

    res.status(200).json({
      status: 'success',
      venda: financeRes.rows[0],
      message: 'Distribuição realizada com sucesso e caixa alimentado.'
    });
  } catch (err) {
    next(err);
  }
});

// Listar fornecedores
app.get('/api/suppliers', protect, async (req, res, next) => {
  try {
    const suppliersRes = await db.query('SELECT * FROM fornecedores ORDER BY nome');
    res.status(200).json({ status: 'success', data: suppliersRes.rows });
  } catch (err) {
    next(err);
  }
});

// Cadastrar fornecedor (Exclusivo Master/Produtos)
app.post('/api/suppliers', protect, restrictTo(['Master', 'Diretor'], ['Produtos']), async (req, res, next) => {
  const { nome, contato_nome, telefone, email, tipo_produto, observacoes } = req.body;
  try {
    if (!nome) {
      return res.status(400).json({ status: 'fail', error: 'Nome do fornecedor é obrigatório!' });
    }
    const queryText = `
      INSERT INTO fornecedores (nome, contato_nome, telefone, email, tipo_produto, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const supplierRes = await db.queryWithSession(req.user.id, queryText, [
      nome, contato_nome, telefone, email, tipo_produto, observacoes
    ]);
    res.status(210).json({ status: 'success', data: supplierRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Listar pedidos de compra (encomendas)
app.get('/api/orders', protect, async (req, res, next) => {
  try {
    const ordersRes = await db.query(`
      SELECT pc.*, f.nome as fornecedor_nome, p.nome as produto_nome
      FROM pedidos_compra pc
      JOIN fornecedores f ON pc.fornecedor_id = f.id
      JOIN produtos p ON pc.produto_id = p.id
      ORDER BY pc.data_pedido DESC
    `);
    res.status(200).json({ status: 'success', data: ordersRes.rows });
  } catch (err) {
    next(err);
  }
});

// Cadastrar pedido de compra (Exclusivo Master/Produtos)
app.post('/api/orders', protect, restrictTo(['Master', 'Diretor'], ['Produtos']), async (req, res, next) => {
  const { fornecedor_id, produto_id, tamanho, quantidade, data_previsao } = req.body;
  try {
    if (!fornecedor_id || !produto_id || !tamanho || !quantidade) {
      return res.status(400).json({ status: 'fail', error: 'Fornecedor, Produto, Tamanho e Quantidade são obrigatórios!' });
    }
    const queryText = `
      INSERT INTO pedidos_compra (fornecedor_id, produto_id, tamanho, quantidade, status, data_previsao)
      VALUES ($1, $2, $3, $4, 'Pendente', $5) RETURNING *;
    `;
    const orderRes = await db.queryWithSession(req.user.id, queryText, [
      fornecedor_id, produto_id, tamanho, quantidade, data_previsao
    ]);
    
    // Busca informações para retornar completo
    const fullOrderRes = await db.query(`
      SELECT pc.*, f.nome as fornecedor_nome, p.nome as produto_nome
      FROM pedidos_compra pc
      JOIN fornecedores f ON pc.fornecedor_id = f.id
      JOIN produtos p ON pc.produto_id = p.id
      WHERE pc.id = $1
    `, [orderRes.rows[0].id]);

    res.status(210).json({ status: 'success', data: fullOrderRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Atualizar status do pedido de compra (Exclusivo Master/Produtos)
app.put('/api/orders/:id/status', protect, restrictTo(['Master', 'Diretor'], ['Produtos']), async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    if (!status || !['Pendente', 'Recebido', 'Cancelado'].includes(status)) {
      return res.status(400).json({ status: 'fail', error: 'Status inválido!' });
    }

    const queryText = `
      UPDATE pedidos_compra 
      SET status = $1 
      WHERE id = $2 RETURNING *;
    `;
    const updatedOrderRes = await db.queryWithSession(req.user.id, queryText, [status, id]);
    const updatedOrder = updatedOrderRes.rows[0];

    if (!updatedOrder) {
      return res.status(404).json({ status: 'fail', error: 'Pedido de compra não localizado!' });
    }

    // Busca detalhes completos para resposta
    const fullOrderRes = await db.query(`
      SELECT pc.*, f.nome as fornecedor_nome, p.nome as produto_nome
      FROM pedidos_compra pc
      JOIN fornecedores f ON pc.fornecedor_id = f.id
      JOIN produtos p ON pc.produto_id = p.id
      WHERE pc.id = $1
    `, [id]);

    res.status(200).json({ status: 'success', data: fullOrderRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 4. ROTAS DE ESPORTES E ATLETAS
// ----------------------------------------------------------------------------

app.get('/api/athletes', protect, async (req, res, next) => {
  try {
    const athletesRes = await db.query(`
      SELECT a.*, m.nome as modalidade_nome 
      FROM atletas a 
      JOIN modalidades m ON a.modalidade_id = m.id
      ORDER BY a.nome
    `);
    res.status(200).json({ status: 'success', data: athletesRes.rows });
  } catch (err) {
    next(err);
  }
});

app.post('/api/athletes', protect, restrictTo(['Master', 'Diretor', 'Coordenador'], ['Esportes']), async (req, res, next) => {
  const { nome, ra_matricula, modalidade_id } = req.body;
  try {
    const queryText = `
      INSERT INTO atletas (nome, ra_matricula, modalidade_id, status_documentacao)
      VALUES ($1, $2, $3, 'Pendente') RETURNING *;
    `;
    const athleteRes = await db.queryWithSession(req.user.id, queryText, [nome, ra_matricula, modalidade_id]);
    res.status(210).json({ status: 'success', data: athleteRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Altera status documental (RN-ESP-01: Apenas diretoria de Jurídico pode gravar)
app.put('/api/athletes/:id/doc-status', protect, async (req, res, next) => {
  const { id } = req.params;
  const { status_documentacao } = req.body;
  try {
    const athleteRes = await db.query('SELECT * FROM atletas WHERE id = $1', [id]);
    const athlete = athleteRes.rows[0];
    if (!athlete) {
      return res.status(404).json({ status: 'fail', error: 'Atleta não localizado!' });
    }

    // Executa com controle de sessão. trg_proteger_documentacao_atleta barrará se usuário não for do Jurídico
    const queryText = `
      UPDATE atletas 
      SET status_documentacao = $1 
      WHERE id = $2 RETURNING *;
    `;
    const updatedRes = await db.queryWithSession(req.user.id, queryText, [status_documentacao, id]);
    const updatedAthlete = updatedRes.rows[0];

    // --- GATILHO EMAIL F2: ATLETA_BARRADO ---
    if (status_documentacao === 'Rejeitado' || status_documentacao === 'Pendente') {
      const sportsDirectorRes = await db.query("SELECT email FROM usuarios WHERE diretoria = 'Esportes' AND status = TRUE");
      
      for (const sDir of sportsDirectorRes.rows) {
        await enviarNotificacaoEmail(
          req.user.id,
          'ATLETA_BARRADO',
          sDir.email,
          `🚨 Alerta: Atleta Impedido - ${athlete.nome}`,
          `<h3>Regularização de Documentação Requerida</h3>
           <p>O atleta <b>${athlete.nome}</b> (RA: ${athlete.ra_matricula}) teve sua documentação avaliada como <b>${status_documentacao}</b>.</p>
           <p>O atleta está <b>impedido de jogar/ser escalado</b> em qualquer competição oficial pela Atlética (RN-ESP-01) até a regularização.</p>`
        );
      }
    }

    res.status(200).json({ status: 'success', data: updatedAthlete });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 5. ROTAS FINANCEIRAS (TESOURARIA)
// ----------------------------------------------------------------------------

app.get('/api/finance/ledger', protect, restrictTo(['Master', 'Diretor'], ['Tesouraria']), async (req, res, next) => {
  try {
    const ledgerRes = await db.query('SELECT * FROM lancamentos_financeiros ORDER BY data_competencia DESC, created_at DESC');
    res.status(200).json({ status: 'success', data: ledgerRes.rows });
  } catch (err) {
    next(err);
  }
});

app.post('/api/finance/ledger', protect, restrictTo(['Master', 'Diretor'], ['Tesouraria']), async (req, res, next) => {
  const { tipo, categoria, valor, data_competencia } = req.body;
  try {
    const queryText = `
      INSERT INTO lancamentos_financeiros (tipo, categoria, valor, data_competencia, status_conciliacao)
      VALUES ($1, $2, $3, COALESCE($4, CURRENT_TIMESTAMP), FALSE) RETURNING *;
    `;
    const newRecordRes = await db.queryWithSession(req.user.id, queryText, [tipo, categoria, valor, data_competencia]);
    res.status(210).json({ status: 'success', data: newRecordRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Concilia Lançamento (Ativa Lock de Imutabilidade)
app.put('/api/finance/ledger/:id/reconcile', protect, restrictTo(['Master', 'Diretor'], ['Tesouraria']), async (req, res, next) => {
  const { id } = req.params;
  try {
    const queryText = `
      UPDATE lancamentos_financeiros 
      SET status_conciliacao = TRUE 
      WHERE id = $1 RETURNING *;
    `;
    const reconciledRes = await db.queryWithSession(req.user.id, queryText, [id]);
    if (reconciledRes.rowCount === 0) {
      return res.status(404).json({ status: 'fail', error: 'Lançamento não localizado!' });
    }
    res.status(200).json({ status: 'success', data: reconciledRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Deleção de Lançamento (Triggado por trg_proteger_lancamento_conciliado - RN-FIN-01)
app.delete('/api/finance/ledger/:id', protect, restrictTo(['Master', 'Diretor'], ['Tesouraria']), async (req, res, next) => {
  const { id } = req.params;
  try {
    const queryText = `DELETE FROM lancamentos_financeiros WHERE id = $1 RETURNING *;`;
    const deletedRes = await db.queryWithSession(req.user.id, queryText, [id]);
    
    if (deletedRes.rowCount === 0) {
      return res.status(404).json({ status: 'fail', error: 'Lançamento não localizado!' });
    }
    res.status(200).json({ status: 'success', message: 'Lançamento deletado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 6. ROTAS JURÍDICAS E GED
// ----------------------------------------------------------------------------

app.get('/api/partners', protect, async (req, res, next) => {
  try {
    const partnersRes = await db.query('SELECT * FROM parceiros_patrocinadores ORDER BY nome_empresa');
    res.status(200).json({ status: 'success', data: partnersRes.rows });
  } catch (err) {
    next(err);
  }
});

// Altera status no Funil de Vendas do CRM (Triggado por trg_validar_parceria_ativa - RN-JUR-01)
app.put('/api/partners/:id/status', protect, restrictTo(['Master', 'Diretor', 'Coordenador'], ['Jurídico', 'Relações Externas']), async (req, res, next) => {
  const { id } = req.params;
  const { status_funil } = req.body;
  try {
    const queryText = `
      UPDATE parceiros_patrocinadores 
      SET status_funil = $1 
      WHERE id = $2 RETURNING *;
    `;
    const updatedPartnerRes = await db.queryWithSession(req.user.id, queryText, [status_funil, id]);
    
    if (updatedPartnerRes.rowCount === 0) {
      return res.status(404).json({ status: 'fail', error: 'Parceiro comercial não localizado!' });
    }
    
    res.status(200).json({ status: 'success', data: updatedPartnerRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.post('/api/legal/documents', protect, restrictTo(['Master', 'Diretor', 'Coordenador'], ['Jurídico']), async (req, res, next) => {
  const { titulo, tipo_documento, arquivo_url, data_vencimento, parceiro_id } = req.body;
  try {
    const queryText = `
      INSERT INTO documentos_contratos (titulo, tipo_documento, arquivo_url, data_vencimento, parceiro_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const docRes = await db.queryWithSession(req.user.id, queryText, [
      titulo, tipo_documento, arquivo_url, data_vencimento || null, parceiro_id || null
    ]);

    res.status(210).json({ status: 'success', data: docRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get('/api/legal/documents', protect, async (req, res, next) => {
  try {
    const docsRes = await db.query(`
      SELECT d.*, p.nome_empresa 
      FROM documentos_contratos d
      LEFT JOIN parceiros_patrocinadores p ON d.parceiro_id = p.id
      ORDER BY d.created_at DESC
    `);
    res.status(200).json({ status: 'success', data: docsRes.rows });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 7. SIMULAÇÃO DO CRON DIÁRIO: VENCIMENTO DE CONTRATOS (Gatilho 3 - Fase 2)
// ----------------------------------------------------------------------------
app.post('/api/cron/check-contracts', async (req, res, next) => {
  try {
    console.log('⏰ Cron Job: Iniciando varredura de contratos a vencer em 30 dias...');
    
    // Consulta documentos com vencimento em exatamente hoje + 30 dias
    const queryText = `
      SELECT d.*, p.nome_empresa 
      FROM documentos_contratos d
      LEFT JOIN parceiros_patrocinadores p ON d.parceiro_id = p.id
      WHERE d.data_vencimento::date = (CURRENT_DATE + INTERVAL '30 days')::date;
    `;
    const contractsRes = await db.query(queryText);
    const expiringContracts = contractsRes.rows;

    console.log(`⏰ Cron Job: Localizado ${expiringContracts.length} contratos expirando em 30 dias.`);

    const notificationReceivers = await db.query(`
      SELECT email FROM usuarios 
      WHERE cargo = 'Master' OR diretoria IN ('Presidência', 'Vice-Presidência', 'Relações Externas') 
        AND status = TRUE
    `);

    for (const contract of expiringContracts) {
      for (const receiver of notificationReceivers.rows) {
        await enviarNotificacaoEmail(
          null, // Executado pelo sistema de cron (SYSTEM)
          'CONTRATO_VENCENDO',
          receiver.email,
          `⚠️ Alerta de Vencimento de Contrato: ${contract.titulo}`,
          `<h3>Aviso de Expiracão do Contrato</h3>
           <p>O documento <b>${contract.titulo}</b> do parceiro comercial <b>${contract.nome_empresa || 'Geral'}</b> vencerá em 30 dias.</p>
           <ul>
             <li><b>Data de Vencimento:</b> ${contract.data_vencimento}</li>
             <li><b>Link de Acesso GED:</b> <a href="${contract.arquivo_url}">Abrir Documento</a></li>
           </ul>
           <p>Favor proceder com a renegociação ou arquivamento.</p>`
        );
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Varredura concluída. ${expiringContracts.length} contratos notificados.`
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 8. ROTAS DE AUDITORIA & SEGURANÇA (logs_notificacoes)
// ----------------------------------------------------------------------------

app.get('/api/audit/logs', protect, restrictTo(['Master', 'Diretor'], ['Presidência', 'Tesouraria']), async (req, res, next) => {
  try {
    const logsRes = await db.query('SELECT * FROM logs_notificacoes ORDER BY data_envio DESC');
    res.status(200).json({ status: 'success', data: logsRes.rows });
  } catch (err) {
    next(err);
  }
});

// Tentativa de exclusão de logs (Bloqueada por trg_bloquear_modificacao_logs - RN-LOG-01)
app.delete('/api/audit/logs/:id', protect, restrictTo(['Master']), async (req, res, next) => {
  const { id } = req.params;
  try {
    const queryText = 'DELETE FROM logs_notificacoes WHERE id = $1';
    await db.queryWithSession(req.user.id, queryText, [id]);
    res.status(200).json({ status: 'success', message: 'Log deletado.' });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 9. CENTRAL GLOBAL DE ERROS E MAPEAMENTO POSTGRESQL (TRIGGERS)
// ----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('❌ Erro capturado na central de tratamento:', err.message);

  // Mapeamento dinâmico de códigos de erro do PostgreSQL para respostas HTTP limpas
  
  // A. Restrições customizadas de Trigger (PL/pgSQL Exception - State 45000)
  if (err.code === '45000') {
    return res.status(409).json({
      status: 'fail',
      error_code: 'DB_TRIGGER_VIOLATION',
      error: err.message.replace('ERROR: ', '')
    });
  }

  // B. Violação de permissão RBAC disparada no banco (State 42501)
  if (err.code === '42501') {
    return res.status(403).json({
      status: 'fail',
      error_code: 'DB_PERMISSION_DENIED',
      error: err.message.replace('ERROR: ', '')
    });
  }

  // C. Violação de Constraint CHECK do Postgres (State 23514 - ex: chk_estoque_positivo)
  if (err.code === '23514') {
    return res.status(400).json({
      status: 'fail',
      error_code: 'DB_CHECK_CONSTRAINT_FAILED',
      error: `Violação de integridade física de dados. Motivo: ${err.message}`
    });
  }

  // D. Erros genéricos de conexão/banco
  res.status(500).json({
    status: 'error',
    error: 'Ocorreu um erro interno no servidor de banco de dados. Transação revertida.'
  });
});

// ============================================================================
// ROTAS: GESTÃO DE USUÁRIOS / MEMBROS DA DIRETORIA (Sem exclusão - Fase 2)
// ============================================================================

// PUT /api/users/:id — Atualiza dados ou status de um usuário (sem DELETE)
app.put('/api/users/:id', protect, restrictTo('Master'), async (req, res) => {
  const { id } = req.params;
  const { nome, email, cargo, diretoria, status, password } = req.body;

  try {
    // Verifica unicidade de e-mail (excluindo o próprio usuário)
    if (email) {
      const emailCheck = await db.query(
        'SELECT id FROM usuarios WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'E-mail já está em uso por outro membro da diretoria.' });
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(nome); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
    if (cargo !== undefined) { fields.push(`cargo = $${idx++}`); values.push(cargo); }
    if (diretoria !== undefined) { fields.push(`diretoria = $${idx++}`); values.push(diretoria); }
    if (status !== undefined) { fields.push(`ativo = $${idx++}`); values.push(status); }

    // Troca de senha (re-hash)
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar foi enviado.' });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE usuarios SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, nome, email, cargo, diretoria, ativo`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    console.log(`✅ Usuário ${id} atualizado com sucesso. Status: ${status !== undefined ? status : 'não alterado'}`);
    res.json({ message: 'Usuário atualizado com sucesso no Supabase.', user: result.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno ao atualizar o usuário no banco de dados.' });
  }
});

// ============================================================================
// ROTAS: FORNECEDORES
// ============================================================================

// GET /api/suppliers — Lista todos os fornecedores
app.get('/api/suppliers', protect, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM fornecedores ORDER BY nome ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err.message);
    res.status(500).json({ error: 'Erro ao buscar fornecedores.' });
  }
});

// POST /api/suppliers — Cadastra um novo fornecedor
app.post('/api/suppliers', protect, restrictTo('Master', 'Diretor'), async (req, res) => {
  const { nome, contato, telefone, email, tipo_produto, obs } = req.body;

  if (!nome || !tipo_produto) {
    return res.status(400).json({ error: 'Nome e tipo_produto são campos obrigatórios.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO fornecedores (nome, contato, telefone, email, tipo_produto, obs)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, contato || null, telefone || null, email || null, tipo_produto, obs || null]
    );
    console.log(`✅ Fornecedor '${nome}' cadastrado com sucesso.`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao cadastrar fornecedor:', err.message);
    res.status(500).json({ error: 'Erro interno ao cadastrar o fornecedor.' });
  }
});

// ============================================================================
// ROTAS: PEDIDOS DE COMPRA / ENCOMENDAS
// ============================================================================

// GET /api/orders — Lista todos os pedidos de compra
app.get('/api/orders', protect, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pc.*, f.nome AS fornecedor_nome, p.nome AS produto_nome
      FROM pedidos_compra pc
      LEFT JOIN fornecedores f ON f.id = pc.fornecedor_id
      LEFT JOIN produtos p ON p.id = pc.produto_id
      ORDER BY pc.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar pedidos de compra:', err.message);
    res.status(500).json({ error: 'Erro ao buscar pedidos de compra.' });
  }
});

// POST /api/orders — Registra um novo pedido de compra
app.post('/api/orders', protect, restrictTo('Master', 'Diretor'), async (req, res) => {
  const { fornecedor_id, produto_id, tamanho, quantidade, data_previsao } = req.body;

  if (!fornecedor_id || !produto_id || !tamanho || !quantidade || quantidade <= 0) {
    return res.status(400).json({ error: 'Campos obrigatórios: fornecedor_id, produto_id, tamanho, quantidade (> 0).' });
  }

  try {
    const result = await db.query(
      `INSERT INTO pedidos_compra (fornecedor_id, produto_id, tamanho, quantidade, data_previsao, status)
       VALUES ($1, $2, $3, $4, $5, 'Pendente') RETURNING *`,
      [fornecedor_id, produto_id, tamanho, quantidade, data_previsao || null]
    );
    console.log(`✅ Pedido de compra registrado (ID: ${result.rows[0].id}).`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao registrar pedido de compra:', err.message);
    res.status(500).json({ error: 'Erro interno ao registrar o pedido de compra.' });
  }
});

// PUT /api/orders/:id/status — Marca pedido como Recebido e incrementa estoque (via trigger no DB)
app.put('/api/orders/:id/status', protect, restrictTo('Master', 'Diretor'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'Recebido') {
    return res.status(400).json({ error: "Apenas a transição para o status 'Recebido' é permitida nesta rota." });
  }

  try {
    // Busca o pedido
    const pedidoResult = await db.query('SELECT * FROM pedidos_compra WHERE id = $1', [id]);
    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido de compra não encontrado.' });
    }
    const pedido = pedidoResult.rows[0];

    if (pedido.status === 'Recebido') {
      return res.status(409).json({ error: 'Este pedido já foi marcado como Recebido anteriormente.' });
    }

    // Atualiza o status do pedido (o trigger trg_receber_pedido_compra no PostgreSQL cuida do estoque)
    const result = await db.query(
      `UPDATE pedidos_compra SET status = 'Recebido', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    console.log(`✅ Pedido '${id}' marcado como Recebido. Trigger trg_receber_pedido_compra ativado no PostgreSQL.`);
    res.json({ message: 'Pedido marcado como Recebido. Estoque atualizado pelo trigger do banco de dados.', order: result.rows[0] });
  } catch (err) {
    console.error('Erro ao receber pedido:', err.message);
    res.status(500).json({ error: 'Erro interno ao processar o recebimento do pedido.' });
  }
});

// ----------------------------------------------------------------------------
// BOOTSTRAP DO SERVIDOR
// ----------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🐺 Servidor da Atlética LUP rodando na porta ${PORT}`);
  console.log(`⚙️ Banco de dados padrão: ${process.env.DATABASE_URL}`);
});
