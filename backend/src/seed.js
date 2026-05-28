// ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// SCRIPT DE SEED DO BANCO DE DADOS (seed.js) - MVP v2.0
// ============================================================================

const bcrypt = require('bcryptjs');
const db = require('./config/db');
require('dotenv').config();

async function runSeed() {
  console.log('🌱 Seed: Iniciando inserção de dados iniciais no PostgreSQL...');
  
  try {
    // 1. Gera hashes de senha seguras
    const defaultPassword = 'lup123_strategy';
    const hash = await bcrypt.hash(defaultPassword, 10);
    console.log(`🔑 Senha padrão gerada para todos os usuários: '${defaultPassword}'`);

    // 2. Limpa dados antigos de forma segura (Opcional - apenas se necessário)
    // await db.query('TRUNCATE usuarios, modalidades, atletas, produtos, produto_variantes, eventos, lancamentos_financeiros CASCADE');

    // 3. Insere Usuários (Membros da Diretoria)
    const userRes = await db.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(userRes.rows[0].count) === 0) {
      console.log('👤 Seed: Inserindo usuários institucionais (RBAC)...');
      
      const insertUserQuery = `
        INSERT INTO usuarios (nome, email, senha_hash, cargo, diretoria, status) VALUES
        ('Eduardo Carolo', 'presidencia@atleticalup.com.br', $1, 'Master', 'Presidência', TRUE),
        ('Barthô da Tesouraria', 'financeiro@atleticalup.com.br', $1, 'Diretor', 'Tesouraria', TRUE),
        ('Mariana do Mkt', 'marketing@atleticalup.com.br', $1, 'Diretor', 'Marketing', TRUE),
        ('Guilherme do Esporte', 'esportes@atleticalup.com.br', $1, 'Diretor', 'Esportes', TRUE),
        ('Lucas do Jurídico', 'juridico@atleticalup.com.br', $1, 'Diretor', 'Jurídico', TRUE),
        ('Amanda Apoio', 'suporte@atleticalup.com.br', $1, 'Apoio', 'Nenhuma', TRUE)
        RETURNING id, nome, email;
      `;
      const insertedUsers = await db.query(insertUserQuery, [hash]);
      console.log(`✔️ Usuários inseridos: ${insertedUsers.rowCount}`);
    } else {
      console.log('👤 Seed: Usuários já existem no banco. Pulando...');
    }

    // 4. Insere Modalidades Esportivas
    const modRes = await db.query('SELECT COUNT(*) FROM modalidades');
    let futsalId, volleyballId;

    if (parseInt(modRes.rows[0].count) === 0) {
      console.log('🏅 Seed: Inserindo modalidades desportivas...');
      
      // Busca o ID do Diretor de Esportes
      const sportsDirRes = await db.query("SELECT id FROM usuarios WHERE email = 'esportes@atleticalup.com.br'");
      const sportsDirId = sportsDirRes.rows[0]?.id;

      const insertModQuery = `
        INSERT INTO modalidades (nome, coordenador_id) VALUES
        ('Futsal Masculino', $1),
        ('Vôlei Feminino', $1),
        ('Cheerleading Misto', $1)
        RETURNING id, nome;
      `;
      const insertedMods = await db.query(insertModQuery, [sportsDirId]);
      futsalId = insertedMods.rows[0].id;
      volleyballId = insertedMods.rows[1].id;
      console.log(`✔️ Modalidades inseridas: ${insertedMods.rowCount}`);
    } else {
      const mods = await db.query('SELECT id FROM modalidades');
      futsalId = mods.rows[0]?.id;
      volleyballId = mods.rows[1]?.id;
      console.log('🏅 Seed: Modalidades já existem no banco. Pulando...');
    }

    // 5. Insere Atletas
    const athleteRes = await db.query('SELECT COUNT(*) FROM atletas');
    if (parseInt(athleteRes.rows[0].count) === 0 && futsalId) {
      console.log('🏃 Seed: Inserindo ficha inicial de atletas...');
      const insertAthleteQuery = `
        INSERT INTO atletas (nome, ra_matricula, modalidade_id, status_documentacao) VALUES
        ('Mateus Silva Ramos', '22.01948-2', $1, 'Aprovado'),
        ('Gabriela Mendes Costa', '23.00341-9', $2, 'Pendente'),
        ('Rodrigo Nogueira Souza', '21.01185-5', $1, 'Rejeitado');
      `;
      await db.query(insertAthleteQuery, [futsalId, volleyballId]);
      console.log('✔️ Atletas inseridos.');
    }

    // 6. Insere Produtos e Variantes (Modelagem C-02 corrigida)
    const productRes = await db.query('SELECT COUNT(*) FROM produtos');
    if (parseInt(productRes.rows[0].count) === 0) {
      console.log('👕 Seed: Inserindo catálogo de produtos oficiais...');
      
      const p1Res = await db.query(`
        INSERT INTO produtos (nome, preco_custo, preco_venda) 
        VALUES ('Moletom Oficial Lupus', 85.00, 160.00) RETURNING id;
      `);
      const p1Id = p1Res.rows[0].id;

      const p2Res = await db.query(`
        INSERT INTO produtos (nome, preco_custo, preco_venda) 
        VALUES ('Caneca Tirante LUP', 12.00, 25.00) RETURNING id;
      `);
      const p2Id = p2Res.rows[0].id;

      // Insere as variantes físicas separadas em produto_variantes (Tamanhos e estoques)
      const insertVariantsQuery = `
        INSERT INTO produto_variantes (produto_id, tamanho, estoque_atual) VALUES
        ($1, 'P', 15),
        ($1, 'M', 24),
        ($1, 'G', 0), -- Esgotado para testar chk_estoque_positivo
        ($1, 'GG', 5),
        ($2, 'Único', 150);
      `;
      await db.query(insertVariantsQuery, [p1Id, p2Id]);
      console.log('✔️ Produtos e variantes físicas de tamanho inseridos com sucesso!');
    } else {
      console.log('👕 Seed: Catálogo de produtos já existente. Pulando...');
    }

    // 7. Insere Parceiros e GED
    const partnerRes = await db.query('SELECT COUNT(*) FROM parceiros_patrocinadores');
    if (parseInt(partnerRes.rows[0].count) === 0) {
      console.log('🤝 Seed: Inserindo funil do CRM de parceiros e documentos GED...');
      
      const par1Res = await db.query(`
        INSERT INTO parceiros_patrocinadores (nome_empresa, tipo_parceria, status_funil)
        VALUES ('RedBull Brasil', 'Fornecimento de Energéticos', 'Negociação') RETURNING id;
      `);
      const par1Id = par1Res.rows[0].id;

      const par2Res = await db.query(`
        INSERT INTO parceiros_patrocinadores (nome_empresa, tipo_parceria, status_funil)
        VALUES ('Cervejaria Local', 'Patrocínio Financeiro LUP Fest', 'Contrato Ativo') RETURNING id;
      `);
      const par2Id = par2Res.rows[0].id;

      // Documentos do GED Drive
      const insertDocsQuery = `
        INSERT INTO documentos_contratos (titulo, tipo_documento, arquivo_url, data_vencimento, parceiro_id) VALUES
        ('Termo de Parceria RedBull 2026', 'Termo de Parceria', '', '2026-12-31', $1),
        ('Contrato Assinado Cervejaria 2026', 'Contrato', 'https://drive.google.com/file/d/atletica-lup-contrato-cerveja-193/view', '2026-11-30', $2);
      `;
      await db.query(insertDocsQuery, [par1Id, par2Id]);
      console.log('✔️ Parceiros e contratos de auditoria cadastrados.');
    }

    // 8. Insere Fornecedores e Pedidos de Compra (Fase 2)
    const supplierCount = await db.query('SELECT COUNT(*) FROM fornecedores');
    if (parseInt(supplierCount.rows[0].count) === 0) {
      console.log('🏭 Seed: Inserindo fornecedores oficiais...');
      const insertSupplierQuery = `
        INSERT INTO fornecedores (nome, contato_nome, telefone, email, tipo_produto, categoria_servico, observacoes) VALUES
        ('Confecções Estrela do Sul', 'Roberto Santos', '(11) 98765-4321', 'comercial@estreladosul.com.br', 'Camisetas e Moletons', 'Vestuário', 'Fornecedor principal de moletons de algodão premium.'),
        ('Brindes e Copos Litoral', 'Cláudia Lima', '(13) 99122-3344', 'vendas@brindeslitoral.com.br', 'Canecas e Chopeiras', 'Som & Iluminação', 'Fornecedor parceiro de canecas de alumínio com tirantes.')
        RETURNING id;
      `;
      const insertedSuppliers = await db.query(insertSupplierQuery);
      const supplier1Id = insertedSuppliers.rows[0].id;

      // Busca o ID do Moletom LUP cadastrado
      const productRes = await db.query("SELECT id FROM produtos WHERE nome = 'Moletom Oficial Lupus'");
      const p1Id = productRes.rows[0]?.id;

      if (p1Id) {
        console.log('📦 Seed: Inserindo pedidos de compra pendentes...');
        const insertOrderQuery = `
          INSERT INTO pedidos_compra (fornecedor_id, produto_id, tamanho, quantidade, status, data_previsao) VALUES
          ($1, $2, 'G', 20, 'Pendente', NOW() + INTERVAL '15 days');
        `;
        await db.query(insertOrderQuery, [supplier1Id, p1Id]);
        console.log('✔️ Fornecedores e pedidos de compra de teste cadastrados.');
      }
    }

    console.log('🎉 Seed: Banco de dados populado com sucesso!');
  } catch (err) {
    console.error('❌ Erro durante a inserção de seeds:', err.message);
  } finally {
    db.pool.end();
  }
}

runSeed();
