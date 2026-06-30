    // ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// IN-MEMORY DATABASE & ENGINE SIMULATOR (app.js) - MVP v2.0
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ========================================================================
    // SUPABASE CONFIGURATION (AGUARDANDO CREDENCIAIS)
    // ========================================================================
    const SUPABASE_URL = 'https://ruytftiztkrkvniqqmjj.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_70qktfjIX0DcfY2O-YM3Fw_fZbjUkEc';
    
    // Inicializa o cliente do Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    // ------------------------------------------------------------------------
    // 1. ESTADO DO BANCO DE DADOS (IN-MEMORY DB)
    // ------------------------------------------------------------------------
    const DB = {
        usuarios: [], eventos: [], tarefas_logistica: [], modalidades: [],
        atletas: [], produtos: [], produto_variantes: [], calendario_editorial: [],
        cronograma_postagens: [], escalacoes: [], participantes_evento: [],
        lancamentos_financeiros: [], parceiros_patrocinadores: [], documentos_contratos: [],
        logs_notificacoes: [], fornecedores: [], pedidos_compra: [], chat_conversations: [
            { id: 'conv-1', name: 'Geral LUP', type: 'Grupo', created_at: new Date().toISOString() }
        ],
        chat_participants: [], chat_messages: [], chat_attachments: []
    };

    window.DB = DB;
    
    // Usuário logado — preenchido após autenticação
    let currentUser = null;
    window.currentUser = currentUser;

    // Estado de seleção para marketing, esportes e financeiro (Fase 4)
    let selectedMarketingEventId = '';
    let selectedSportsEventId = '';
    let selectedSportsModalityId = '';
    let pendingRoster = []; // Lista de objetos { atletaId, funcao, observacao } na escalação pendente
    let selectedFinanceEventId = '';

    // Estado do calendário do dashboard (Fase 5)
    let calendarCurrentDate = new Date();
    let calendarSelectedDate = new Date();

    // URL base do backend (tenta localhost em dev)
    const API_BASE = 'http://localhost:5000';
    let backendOnline = false;

    // -----------------------------------------------------------------------
    // MAPEAMENTO DE PERMISSÕES DE ESCRITA POR MÓDULO
    // -----------------------------------------------------------------------
    // Chave = data-target do módulo. Valor = array de diretorias com escrita.
    // Master sempre tem escrita plena.
    const WRITE_PERMISSIONS = {
        'mod-dashboard':     ['Presidência', 'Vice-Presidência'],
        'mod-acessos':       ['Presidência', 'Vice-Presidência'],  // só Master (verificado via cargo)
        'mod-eventos':       ['Presidência', 'Vice-Presidência', 'Tesouraria', 'Marketing', 'Esportes'],
        'mod-marketing':     ['Presidência', 'Vice-Presidência', 'Marketing'],
        'mod-produtos':      ['Presidência', 'Vice-Presidência', 'Tesouraria', 'Produtos'],
        'mod-esportes':      ['Presidência', 'Vice-Presidência', 'Esportes', 'Jurídico'],
        'mod-financeiro':    ['Presidência', 'Vice-Presidência', 'Tesouraria'],
        'mod-parcerias':     ['Presidência', 'Vice-Presidência', 'Parcerias', 'Relações Externas'],
        'mod-legal':         ['Presidência', 'Vice-Presidência', 'Jurídico'],
        // Chat interno: aberto para leitura e escrita a todos os membros autenticados
        'mod-comunicacao':   ['Presidência', 'Vice-Presidência', 'Tesouraria', 'Marketing', 'Esportes', 'Jurídico', 'Produtos', 'Parcerias', 'Relações Externas', 'Nenhuma'],
    };

    function canWrite(moduleId) {
        if (!currentUser) return false;
        if (currentUser.cargo === 'Master') return true;
        const allowed = WRITE_PERMISSIONS[moduleId] || [];
        return allowed.includes(currentUser.diretoria);
    }

    function canViewFinance() {
        if (!currentUser) return false;
        if (currentUser.cargo === 'Master') return true;
        return currentUser.diretoria === 'Tesouraria' || currentUser.diretoria === 'Presidência' || currentUser.diretoria === 'Vice-Presidência';
    }

    // ------------------------------------------------------------------------
    // 2. SISTEMA DE SIMULAÇÃO DE BANCO DE DADOS POSTGRESQL (TRIGGER ENGINE)
    // ------------------------------------------------------------------------
    
    function logSQL(message, type = 'success') {
        const timestamp = new Date().toLocaleTimeString();
        if (type === 'trigger') {
            console.log(`⚙️ [${timestamp}] [PL/pgSQL Trigger] ${message}`);
        } else if (type === 'error') {
            console.error(`❌ [${timestamp}] [DB ERROR] ${message}`);
        } else {
            console.log(`💾 [${timestamp}] [Query Success] ${message}`);
        }
    }

    // Mapeamento de erros técnicos → mensagens amigáveis para o usuário final
    const ERROR_FRIENDLY_MAP = [
        {
            match: ['42501', 'Permission Denied'],
            icon: 'fas fa-lock',
            title: 'Acesso não autorizado',
            msg: 'Você não tem permissão para realizar esta ação. Se precisar, entre em contato com a Presidência para solicitar o acesso.'
        },
        {
            match: ['Unique Violation', '23505'],
            icon: 'fas fa-clone',
            title: 'Registro duplicado',
            msg: 'Já existe um cadastro com esses dados no sistema. Por favor, verifique as informações e tente novamente.'
        },
        {
            match: ['Not Null', '23502'],
            icon: 'fas fa-exclamation-circle',
            title: 'Campos obrigatórios',
            msg: 'Preencha todos os campos obrigatórios antes de salvar.'
        },
        {
            match: ['chk_estoque', 'Estoque', 'CHECK Constraint'],
            icon: 'fas fa-box',
            title: 'Estoque insuficiente',
            msg: 'Não é possível realizar esta operação pois o estoque ficaria negativo. Verifique a quantidade disponível e tente novamente.'
        },
        {
            match: ['RN-LOG-01', 'Audit', 'Append-Only'],
            icon: 'fas fa-shield-alt',
            title: 'Registro protegido',
            msg: 'Este histórico de auditoria é protegido e não pode ser alterado ou excluído. Isso garante a integridade das informações da diretoria.'
        },
        {
            match: ['RN-FIN-01', 'Caixa', 'Imutável'],
            icon: 'fas fa-wallet',
            title: 'Lançamento bloqueado',
            msg: 'Este lançamento financeiro já foi conciliado e não pode ser modificado. Para correções, registre um novo lançamento de ajuste.'
        },
        {
            match: ['RN-EV-01', 'Aprovação', 'Fluxo'],
            icon: 'fas fa-calendar-times',
            title: 'Aprovação não permitida',
            msg: 'Apenas a Tesouraria ou a Presidência pode aprovar o orçamento deste evento. Solicite a aprovação ao responsável.'
        },
        {
            match: ['Calendário', 'Editorial'],
            icon: 'fas fa-calendar-exclamation',
            title: 'Conflito de datas',
            msg: 'Já existe outro evento agendado neste período. Escolha uma data diferente e tente novamente.'
        },
        {
            match: ['RN-JUR-01', 'Parceria', 'Validação'],
            icon: 'fas fa-file-contract',
            title: 'Documento inválido',
            msg: 'Esta parceria não pode ser ativada sem um contrato anexado e aprovado. Faça o upload do documento e tente novamente.'
        },
        {
            match: ['RN-ESP-01', 'Elegibilidade'],
            icon: 'fas fa-user-times',
            title: 'Atleta inelegível',
            msg: 'Este atleta não atende aos requisitos para participar da modalidade selecionada. Verifique as condições de elegibilidade.'
        },
        {
            match: ['trg_receber_pedido', 'Recebido'],
            icon: 'fas fa-box-check',
            title: 'Pedido já recebido',
            msg: 'Este pedido de compra já foi marcado como recebido e não pode ser processado novamente.'
        },
    ];

    function showDBErrorDialog(errCode, constraintName, description) {
        // Registra o erro técnico silenciosamente no console (apenas para devs)
        console.debug(`[DB_ENGINE] ${errCode} | ${constraintName} | ${description}`);

        // Encontra a mensagem amigável correspondente
        const combined = `${errCode} ${constraintName} ${description}`;
        let friendly = ERROR_FRIENDLY_MAP.find(rule =>
            rule.match.some(keyword => combined.includes(keyword))
        );

        // Fallback genérico se nenhuma regra bater
        if (!friendly) {
            friendly = {
                icon: 'fas fa-exclamation-circle',
                title: 'Não foi possível concluir',
                msg: 'Esta ação não pôde ser realizada. Verifique as informações e tente novamente. Caso o problema persista, entre em contato com o suporte.'
            };
        }

        // Atualiza o modal com conteúdo amigável
        const iconEl = document.getElementById('error-modal-icon');
        const titleEl = document.getElementById('error-title');
        const msgEl = document.getElementById('error-message');
        if (iconEl) iconEl.className = friendly.icon;
        if (titleEl) titleEl.textContent = friendly.title;
        if (msgEl) msgEl.textContent = friendly.msg;

        document.getElementById('error-overlay').classList.add('active');
    }

    // Central de Interceptação de Escrita (Falso SGBD Engine)
    const DB_Engine = {
        // Simula UPDATE em Eventos (RN-EV-01 & RN-EV-02)
        updateEventStatus: function(eventId, newStatus) {
            const event = DB.eventos.find(e => e.id === eventId);
            if (!event) return false;

            const oldStatus = event.status_aprovacao;
            if (oldStatus === newStatus) return true;

            logSQL(`UPDATE eventos SET status_aprovacao = '${newStatus}' WHERE id = '${eventId}';`, 'query');

            // --- TRIGGER: fn_trg_verificar_aprovacao_evento (RN-EV-01) ---
            logSQL(`Evaluating trg_verificar_aprovacao_evento BEFORE UPDATE...`, 'trigger');
            if (newStatus === 'Aprovado' && oldStatus === 'Aguardando Tesouraria') {
                const user = currentUser;
                // Apenas diretoria == 'Tesouraria' ou cargo == 'Presidência' ou 'Vice-Presidência' ou Master
                const isAuthorized = user.diretoria === 'Tesouraria' || user.cargo === 'Master' || user.diretoria === 'Presidência' || user.diretoria === 'Vice-Presidência';
                
                if (!isAuthorized) {
                    // Simula escrita autônoma na tabela de logs (append-only bypass na transação)
                    const logId = 'log_auton_' + Date.now();
                    const logEntry = {
                        id: logId,
                        usuario_id: user.id,
                        tipo_notificacao: 'Alerta de Segurança',
                        gatilho_regra: 'TENTATIVA_VIOLACAO',
                        destinatario_email: 'presidencia@atleticalup.com.br',
                        status_entrega: 'ENVIADO',
                        data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                        erro_detalhe: `Tentativa de aprovação de evento '${event.nome}' por usuário não autorizado: ${user.nome} (${user.cargo} - ${user.diretoria})`,
                        lida: false
                    };
                    DB.logs_notificacoes.push(logEntry);
                    logSQL(`Inserted security violation log autonomously (ID: ${logId})`, 'trigger');
                    
                    const msg = `Erro 403 (Permissão Negada): O usuário ${user.nome} (${user.cargo}/${user.diretoria}) não possui credenciais suficientes da Tesouraria para aprovar orçamentos.`;
                    logSQL(msg, 'error');
                    showDBErrorDialog('42501 (Permission Denied)', 'RN-EV-01 (Fluxo de Aprovação)', msg);
                    refreshAllUI();
                    return false;
                }
            }

            // Realiza a alteração do evento (Commit Parcial)
            event.status_aprovacao = newStatus;
            logSQL(`Event status committed: '${oldStatus}' -> '${newStatus}'`, 'success');
            supabase.from('eventos').update({status_aprovacao: newStatus}).eq('id', eventId).then(({error}) => { if(error) console.error(error); });

            // --- TRIGGER NOTIFICAÇÃO: Solicitação de Verba (SOLICITACAO_VERBA) ---
            if (newStatus === 'Aguardando Tesouraria') {
                DB.logs_notificacoes.push({
                    id: 'log_' + Date.now(),
                    usuario_id: currentUser ? currentUser.id : 'u1',
                    tipo_notificacao: 'Email',
                    gatilho_regra: 'SOLICITACAO_VERBA',
                    destinatario_email: 'financeiro@atleticalup.com.br',
                    status_entrega: 'ENVIADO',
                    data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                    erro_detalhe: null,
                    lida: false
                });
                logSQL(`INSERT INTO logs_notificacoes (usuario_id, tipo_notificacao, gatilho_regra, destinatario_email, status_entrega) VALUES ('${currentUser ? currentUser.id : 'u1'}', 'Email', 'SOLICITACAO_VERBA', 'financeiro@atleticalup.com.br', 'ENVIADO');`, 'query');
                logSQL(`Notificação de SOLICITACAO_VERBA disparada automaticamente para Tesouraria sobre o evento '${event.nome}'.`, 'success');
            }

            // --- TRIGGER: fn_trg_gerar_lancamento_evento_aprovado (RN-EV-02) ---
            if (newStatus === 'Aprovado' && oldStatus !== 'Aprovado') {
                logSQL(`Evaluating trg_gerar_lancamento_evento_aprovado AFTER UPDATE...`, 'trigger');
                
                // Criação automática do lançamento financeiro (Débito/Saída)
                const newFinanceId = 'lf_' + Date.now();
                const financeEntry = {
                    id: newFinanceId,
                    tipo: 'Saída',
                    categoria: 'Logística Evento',
                    valor: event.orcamento_previsto,
                    data_competencia: new Date().toISOString().split('T')[0],
                    status_conciliacao: false,
                    evento_id: event.id,
                    produto_id: null
                };
                DB.lancamentos_financeiros.push(financeEntry);
                logSQL(`Trigger RN-EV-02: Lançamento financeiro de Saída criado automaticamente para '${event.name}' (Valor: R$ ${event.orcamento_previsto.toFixed(2)})`, 'trigger');
            }

            refreshAllUI();
            return true;
        },

        // Simula INSERT no Calendário Editorial (Marketing - RN-EV-01)
        insertCalendarioEditorial: function(eventoId, plataforma, data, descricao) {
            logSQL(`INSERT INTO calendario_editorial (evento_id, plataforma, data, descricao) VALUES (...);`, 'query');
            logSQL(`Evaluating trg_verificar_calendario_evento BEFORE INSERT...`, 'trigger');

            const event = DB.eventos.find(e => e.id === eventoId);
            if (!event) {
                logSQL('Evento não encontrado', 'error');
                return false;
            }

            // RN-EV-01: Não permite campanhas de marketing para eventos não aprovados
            if (event.status_aprovacao !== 'Aprovado') {
                const msg = `Regra RN-EV-01: Não é permitido criar agendamentos no Calendário Editorial para eventos no estado '${event.status_aprovacao}'. O evento deve estar 'Aprovado' pela Tesouraria.`;
                logSQL(msg, 'error');
                showDBErrorDialog('45000 (Trigger Violation)', 'RN-EV-01 (Calendário Editorial)', msg);
                return false;
            }

            const newId = 'ce_' + Date.now();
            DB.calendario_editorial.push({
                id: newId,
                evento_id: eventoId,
                plataforma: plataforma,
                data_publicacao: data,
                descricao: descricao,
                responsavel_id: currentUser.id
            });

            logSQL(`Calendário Editorial inserido com sucesso (ID: ${newId})`, 'success');
            refreshAllUI();
            return true;
        },

        // Simula UPDATE/DELETE nos Lançamentos Financeiros (Caixa - RN-FIN-01)
        mutateFinanceRecord: function(id, action, updatedFields = null) {
            const index = DB.lancamentos_financeiros.findIndex(lf => lf.id === id);
            if (index === -1) return false;

            const record = DB.lancamentos_financeiros[index];
            logSQL(`${action.toUpperCase()} ON lancamentos_financeiros WHERE id = '${id}';`, 'query');
            logSQL(`Evaluating trg_proteger_lancamento_conciliado BEFORE ${action.toUpperCase()}...`, 'trigger');

            // RN-FIN-01: Lançamentos já conciliados são IMUTÁVEIS
            if (record.status_conciliacao === true) {
                let isViolated = false;
                if (action === 'delete') {
                    isViolated = true;
                } else if (action === 'update' && updatedFields) {
                    // Verifica se alterou campos protegidos
                    if (updatedFields.valor !== record.valor || updatedFields.tipo !== record.tipo || updatedFields.data_competencia !== record.data_competencia) {
                        isViolated = true;
                    }
                }

                if (isViolated) {
                    const msg = `Regra RN-FIN-01 (Imutabilidade de Caixa): Lançamentos financeiros com conciliação realizada não podem ser alterados ou deletados. Para fazer correções, utilize a ferramenta de Lançamento de Estorno.`;
                    logSQL(msg, 'error');
                    showDBErrorDialog('45000 (Integrity Constraint)', 'RN-FIN-01 (Caixa Imutável)', msg);
                    return false;
                }
            }

            if (action === 'delete') {
                DB.lancamentos_financeiros.splice(index, 1);
                logSQL(`Lançamento excluído com sucesso (ID: ${id})`, 'success');
            } else if (action === 'update' && updatedFields) {
                Object.assign(record, updatedFields);
                logSQL(`Lançamento atualizado com sucesso (ID: ${id})`, 'success');
            }

            refreshAllUI();
            return true;
        },

        // Simula UPDATE de Estoque de Produtos / Vendas (RN-PROD-01)
        mutateProductStock: function(variantId, quantityDelta) {
            const variant = DB.produto_variantes.find(pv => pv.id === variantId);
            if (!variant) return false;

            const oldStock = variant.estoque_atual;
            const newStock = oldStock + quantityDelta;

            logSQL(`UPDATE produto_variantes SET estoque_atual = ${newStock} WHERE id = '${variantId}';`, 'query');
            logSQL(`Evaluating CHECK chk_estoque_positivo (estoque_atual >= 0)...`, 'trigger');

            // RN-PROD-01: Estoque Blindado chk_estoque_positivo
            if (newStock < 0) {
                const msg = `Regra RN-PROD-01 (Estoque Blindado): A operação causaria violação de estoque negativo na variante de tamanho '${variant.tamanho}'. Estoque atual: ${oldStock}, Requisitado: ${Math.abs(quantityDelta)}.`;
                logSQL(msg, 'error');
                showDBErrorDialog('23514 (CHECK Constraint Violation)', 'chk_estoque_positivo (Estoque >= 0)', msg);
                return false;
            }

            variant.estoque_atual = newStock;
            logSQL(`Estoque de variante atualizado: ${oldStock} -> ${newStock}`, 'success');
            refreshAllUI();
            return true;
        },

        // Simula UPDATE em Atletas (RN-ESP-01)
        updateAthleteDocStatus: function(athleteId, newStatus) {
            const athlete = DB.atletas.find(a => a.id === athleteId);
            if (!athlete) return false;

            const oldStatus = athlete.status_documentacao;
            if (oldStatus === newStatus) return true;

            logSQL(`UPDATE atletas SET status_documentacao = '${newStatus}' WHERE id = '${athleteId}';`, 'query');
            logSQL(`Evaluating trg_proteger_documentacao_atleta BEFORE UPDATE...`, 'trigger');

            // RN-ESP-01: Apenas diretoria == 'Jurídico' ou Master pode alterar documentação
            const user = currentUser;
            const isAuthorized = user.diretoria === 'Jurídico' || user.cargo === 'Master';

            if (!isAuthorized) {
                const msg = `Erro 403 (Permissão Negada): O usuário ${user.nome} (${user.cargo}/${user.diretoria}) tentou alterar a documentação de um atleta, mas esta ação é restrita exclusivamente ao departamento JURÍDICO da Atlética.`;
                logSQL(msg, 'error');
                showDBErrorDialog('42501 (Permission Denied)', 'RN-ESP-01 (Elegibilidade Esportiva)', msg);
                return false;
            }

            athlete.status_documentacao = newStatus;
            logSQL(`Athlete document status updated: '${oldStatus}' -> '${newStatus}'`, 'success');

            // --- TRIGGER NOTIFICAÇÃO: Atleta Irregular (ATLETA_BARRADO) ---
            if (newStatus === 'Rejeitado') {
                DB.logs_notificacoes.push({
                    id: 'log_' + Date.now(),
                    usuario_id: currentUser ? currentUser.id : 'u1',
                    tipo_notificacao: 'Email',
                    gatilho_regra: 'ATLETA_BARRADO',
                    destinatario_email: 'esportes@atleticalup.com.br',
                    status_entrega: 'ENVIADO',
                    data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                    erro_detalhe: `Documentos do atleta ${athlete.nome} rejeitados. Escalação impedida.`,
                    lida: false
                });
                logSQL(`INSERT INTO logs_notificacoes (usuario_id, tipo_notificacao, gatilho_regra, destinatario_email, status_entrega) VALUES ('${currentUser ? currentUser.id : 'u1'}', 'Email', 'ATLETA_BARRADO', 'esportes@atleticalup.com.br', 'ENVIADO');`, 'query');
                logSQL(`Notificação de ATLETA_BARRADO disparada para Esportes e Coordenador sobre atleta '${athlete.nome}'.`, 'success');
            }

            refreshAllUI();
            return true;
        },

        // Simula UPDATE em Parcerias CRM (RN-JUR-01)
        updatePartnerStatus: function(partnerId, newStatus) {
            const partner = DB.parceiros_patrocinadores.find(p => p.id === partnerId);
            if (!partner) return false;

            const oldStatus = partner.status_funil;
            if (oldStatus === newStatus) return true;

            logSQL(`UPDATE parceiros_patrocinadores SET status_funil = '${newStatus}' WHERE id = '${partnerId}';`, 'query');
            logSQL(`Evaluating trg_validar_parceria_ativa BEFORE UPDATE...`, 'trigger');

            // RN-JUR-01: Não permite ativar parceria se não houver arquivo contrato de link preenchido no GED
            if (newStatus === 'Contrato Ativo') {
                const contracts = DB.documentos_contratos.filter(dc => dc.parceiro_id === partnerId && dc.arquivo_url && dc.arquivo_url.trim() !== '');
                
                if (contracts.length === 0) {
                    const msg = `Regra RN-JUR-01: Não é permitido mover o parceiro comercial '${partner.nome_empresa}' para o estágio 'Contrato Ativo' sem antes anexar um contrato com link ativo (GED Drive) para arquivamento no repositório.`;
                    logSQL(msg, 'error');
                    showDBErrorDialog('45000 (Trigger Exception)', 'RN-JUR-01 (Validação de Parceria)', msg);
                    return false;
                }
            }

            partner.status_funil = newStatus;
            logSQL(`Partner status updated in CRM: '${oldStatus}' -> '${newStatus}'`, 'success');
            refreshAllUI();
            return true;
        },

        // Simula UPDATE/DELETE nos Logs de Auditoria (RN-LOG-01)
        mutateAuditLog: function(id, action) {
            logSQL(`${action.toUpperCase()} ON logs_notificacoes WHERE id = '${id}';`, 'query');
            logSQL(`Evaluating trg_bloquear_modificacao_logs BEFORE ${action.toUpperCase()}...`, 'trigger');

            // RN-LOG-01: Tabela é rigorosamente APPEND-ONLY
            const msg = `Regra RN-LOG-01 (Auditoria Absoluta): A tabela 'logs_notificacoes' possui segurança nível banco. Operações de UPDATE ou DELETE são proibidas para garantir auditoria inviolável à diretoria.`;
            logSQL(msg, 'error');
            showDBErrorDialog('45000 (Trigger Audit Rejection)', 'RN-LOG-01 (Auditoria Append-Only)', msg);
            return false;
        },

        // Simula INSERT em Fornecedores
        insertFornecedor: function(nome, contato, telefone, email, tipo_produto, categoria_servico, obs) {
            logSQL(`INSERT INTO fornecedores (nome, contato, telefone, email, tipo_produto, categoria_servico, obs) VALUES (...);`, 'query');
            if (!nome || !tipo_produto || !categoria_servico) {
                showDBErrorDialog('23502 (Not Null Violation)', 'fornecedores.nome', 'Nome, tipo de produto e categoria são campos obrigatórios.');
                return false;
            }
            const newId = 'f_' + Date.now();
            DB.fornecedores.push({ id: newId, nome, contato, telefone, email, tipo_produto, categoria_servico, obs });
            logSQL(`Fornecedor '${nome}' cadastrado com sucesso (ID: ${newId}).`, 'success');
            refreshAllUI();
            return newId;
        },

        // Simula INSERT em Pedidos de Compra
        insertPedidoCompra: function(fornecedor_id, produto_id, tamanho, quantidade, data_previsao) {
            logSQL(`INSERT INTO pedidos_compra (fornecedor_id, produto_id, tamanho, quantidade, data_previsao, status) VALUES (..., 'Pendente');`, 'query');
            if (!fornecedor_id || !produto_id || !tamanho || quantidade <= 0) {
                alert('Preencha todos os campos do pedido de compra corretamente!');
                return false;
            }
            const newId = 'pc_' + Date.now();
            DB.pedidos_compra.push({ id: newId, fornecedor_id, produto_id, tamanho, quantidade, data_previsao: data_previsao || null, status: 'Pendente' });
            logSQL(`Pedido de Compra registrado com sucesso (ID: ${newId}).`, 'success');
            refreshAllUI();
            return newId;
        },

        // Simula trigger trg_receber_pedido_compra: atualiza estoque ao marcar como Recebido
        receberPedidoCompra: function(pedidoId) {
            const pedido = DB.pedidos_compra.find(pc => pc.id === pedidoId);
            if (!pedido) return false;

            if (pedido.status === 'Recebido') {
                showDBErrorDialog('45000 (Trigger Exception)', 'trg_receber_pedido_compra', `Pedido '${pedidoId}' já foi marcado como Recebido e não pode ser processado novamente.`);
                return false;
            }

            logSQL(`UPDATE pedidos_compra SET status = 'Recebido' WHERE id = '${pedidoId}';`, 'query');
            logSQL(`Evaluating trg_receber_pedido_compra AFTER UPDATE...`, 'trigger');

            // Localiza a variante de estoque correspondente ao produto + tamanho do pedido
            const variant = DB.produto_variantes.find(pv => pv.produto_id === pedido.produto_id && pv.tamanho === pedido.tamanho);

            if (variant) {
                const oldStock = variant.estoque_atual;
                variant.estoque_atual += pedido.quantidade;
                logSQL(`Trigger trg_receber_pedido_compra: Estoque da variante '${pedido.tamanho}' do produto atualizado automaticamente: ${oldStock} → ${variant.estoque_atual} (+${pedido.quantidade}).`, 'trigger');
            } else {
                // Cria nova variante se não existir
                const newVarId = 'pv_' + Date.now();
                DB.produto_variantes.push({ id: newVarId, produto_id: pedido.produto_id, tamanho: pedido.tamanho, estoque_atual: pedido.quantidade });
                logSQL(`Trigger trg_receber_pedido_compra: Nova variante '${pedido.tamanho}' criada e estoque inicializado em ${pedido.quantidade} unidades.`, 'trigger');
            }

            pedido.status = 'Recebido';
            logSQL(`Pedido '${pedidoId}' marcado como Recebido. Estoque atualizado com sucesso.`, 'success');
            refreshAllUI();
            return true;
        },

        // INSERT de Usuário / UPDATE de Usuário
        saveUsuario: function(data) {
            const { id, nome, email, password, cargo, diretoria, status } = data;

            if (id) {
                // ── EDITAR usuário existente ──────────────────────────────
                const user = DB.usuarios.find(u => u.id === id);
                if (!user) { alert('Usuário não encontrado!'); return false; }

                logSQL(`UPDATE usuarios SET nome='${nome}', cargo='${cargo}', diretoria='${diretoria}', status=${status} WHERE id='${id}';`, 'query');
                user.nome = nome; user.email = email;
                user.cargo = cargo; user.diretoria = diretoria; user.status = status;
                if (password) { user.senha = password; }
                logSQL(`Usuário '${nome}' atualizado com sucesso (ID: ${id}).`, 'success');

                // Sincroniza edição com Supabase
                supabase.from('usuarios').update({
                    nome, email, cargo, diretoria, status
                }).eq('id', id).then(({ error }) => {
                    if (error) console.error('Erro ao atualizar usuário no Supabase:', error);
                });

                refreshAllUI();
                return true;

            } else {
                // ── CRIAR novo usuário ────────────────────────────────────
                const emailExists = DB.usuarios.find(u => u.email === email);
                if (emailExists) {
                    showDBErrorDialog('23505 (Unique Violation)', 'usuarios.email', `O e-mail '${email}' já está em uso por outro membro da diretoria.`);
                    return false;
                }
                if (!password) {
                    alert('É obrigatório definir uma senha para novos usuários!');
                    return false;
                }

                // 1. Insere no banco local imediatamente (com ID temporário)
                const tempId = 'u_' + Date.now();
                const localRecord = { id: tempId, nome, email, cargo, diretoria, status: true, senha: password, avatar: null };
                DB.usuarios.push(localRecord);
                logSQL(`INSERT INTO usuarios (nome, email, cargo, diretoria) VALUES ('${nome}', '${email}', '${cargo}', '${diretoria}');`, 'query');

                // Atualiza a UI imediatamente
                refreshAllUI();
                const rbacSelect = document.getElementById('user-rbac-select');
                if (rbacSelect) {
                    const opt = document.createElement('option');
                    opt.value = tempId;
                    opt.innerText = `${nome} (${cargo} / ${diretoria})`;
                    rbacSelect.appendChild(opt);
                }

                // 2. Cria no Supabase Auth (background) → depois grava na tabela
                const tempSB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
                tempSB.auth.signUp({ email, password }).then(({ data: authData, error: authError }) => {
                    if (authError) {
                        console.error('Erro no Supabase Auth.signUp:', authError);
                        return;
                    }
                    const realUID = authData?.user?.id || tempId;
                    // Atualiza ID local para o UUID real
                    const localUser = DB.usuarios.find(u => u.email === email);
                    if (localUser) localUser.id = realUID;

                    // Grava na tabela usuarios com o UUID real
                    supabase.from('usuarios').upsert({
                        id: realUID, nome, email, cargo, diretoria, status: true
                    }).then(({ error: dbError }) => {
                        if (dbError) console.error('Erro ao gravar usuário na tabela:', dbError);
                        else logSQL(`Usuário '${nome}' sincronizado no Supabase (UUID: ${realUID}).`, 'success');
                    });
                });

                alert(`✅ Usuário ${nome} criado com sucesso!\n\nEle já aparece na tabela abaixo.\n\nAguarde 1 minuto para realizar o login com este novo acesso.`);
                return true;
            }
        },

        // --- MÉTODOS DE MARKETING (Fase 4) ---
        insertCronogramaPostagem: function(eventoId, plataforma, tipo_conteudo, data_publicacao, descricao) {
            logSQL(`INSERT INTO cronograma_postagens (evento_id, plataforma, tipo_conteudo, data_publicacao, descricao, status) VALUES ('${eventoId}', '${plataforma}', '${tipo_conteudo}', '${data_publicacao}', '${descricao}', 'Agendado');`, 'query');
            const newId = 'cp_' + Date.now();
            DB.cronograma_postagens.push({
                id: newId,
                evento_id: eventoId,
                plataforma: plataforma,
                tipo_conteudo: tipo_conteudo,
                data_publicacao: data_publicacao.replace('T', ' '),
                descricao: descricao,
                status: 'Agendado'
            });
            logSQL(`Postagem agendada com sucesso (ID: ${newId}).`, 'success');
            refreshAllUI();
            return newId;
        },
        updateCronogramaPostagemStatus: function(postId, status) {
            const post = DB.cronograma_postagens.find(p => p.id === postId);
            if (!post) return false;
            logSQL(`UPDATE cronograma_postagens SET status = '${status}' WHERE id = '${postId}';`, 'query');
            post.status = status;
            logSQL(`Status da postagem '${postId}' atualizado para '${status}'.`, 'success');
            refreshAllUI();
            return true;
        },
        deleteCronogramaPostagem: function(postId) {
            const idx = DB.cronograma_postagens.findIndex(p => p.id === postId);
            if (idx === -1) return false;
            logSQL(`DELETE FROM cronograma_postagens WHERE id = '${postId}';`, 'query');
            DB.cronograma_postagens.splice(idx, 1);
            logSQL(`Postagem '${postId}' removida com sucesso.`, 'success');
            refreshAllUI();
            return true;
        },

        // --- MÉTODOS DE ESPORTES (Fase 4) ---
        insertModalidade: function(nome, coordenadorId) {
            logSQL(`INSERT INTO modalidades (nome, coordenador_id) VALUES ('${nome}', '${coordenadorId}');`, 'query');
            if (!nome) {
                alert('Nome da modalidade é obrigatório!');
                return false;
            }
            const newId = 'm_' + Date.now();
            DB.modalidades.push({ id: newId, nome: nome, coordenador_id: coordenadorId || null });
            logSQL(`Modalidade '${nome}' cadastrada com sucesso (ID: ${newId}).`, 'success');
            refreshAllUI();
            return newId;
        },
        deleteModalidade: function(modId) {
            const idx = DB.modalidades.findIndex(m => m.id === modId);
            if (idx === -1) return false;
            const mod = DB.modalidades[idx];
            logSQL(`DELETE FROM modalidades WHERE id = '${modId}';`, 'query');
            // Remove atletas associados
            DB.atletas = DB.atletas.filter(a => a.modalidade_id !== modId);
            DB.modalidades.splice(idx, 1);
            logSQL(`Modalidade '${mod.nome}' e seus atletas associados foram excluídos com sucesso.`, 'success');
            refreshAllUI();
            return true;
        },
        deleteAtleta: function(atletaId) {
            const idx = DB.atletas.findIndex(a => a.id === atletaId);
            if (idx === -1) return false;
            const athlete = DB.atletas[idx];
            logSQL(`DELETE FROM atletas WHERE id = '${atletaId}';`, 'query');
            DB.atletas.splice(idx, 1);
            logSQL(`Atleta '${athlete.nome}' excluído com sucesso.`, 'success');
            refreshAllUI();
            return true;
        },
        saveEscalacao: function(eventoId, modalidadeId, athleteRoles) {
            logSQL(`DELETE FROM escalacoes WHERE evento_id = '${eventoId}' AND modalidade_id = '${modalidadeId}';`, 'query');
            logSQL(`INSERT INTO escalacoes (evento_id, modalidade_id, atleta_id, funcao, observacao) VALUES (...);`, 'query');
            
            // Delete previous roster for this event & modality
            DB.escalacoes = DB.escalacoes.filter(esc => !(esc.evento_id === eventoId && esc.modalidade_id === modalidadeId));
            
            // Insert new roster
            athleteRoles.forEach(ar => {
                const newId = 'esc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                DB.escalacoes.push({
                    id: newId,
                    evento_id: eventoId,
                    modalidade_id: modalidadeId,
                    atleta_id: ar.atleta_id,
                    funcao: ar.funcao || 'Titular',
                    observacao: ar.observacao || ''
                });
            });
            
            logSQL(`Escalação com ${athleteRoles.length} atletas salva com sucesso para o evento '${eventoId}' na modalidade '${modalidadeId}'.`, 'success');
            refreshAllUI();
            return true;
        },

        // --- MÉTODOS FINANCEIRO/PARTICIPANTES (Fase 4) ---
        insertParticipanteEvento: function(eventoId, nome, ra, valorCobrado, statusPagamento, formaPagamento, obs) {
            logSQL(`INSERT INTO participantes_evento (evento_id, nome, ra_matricula, valor_cobrado, status_pagamento, forma_pagamento, obs) VALUES (...);`, 'query');
            if (!nome) {
                alert('Nome do participante é obrigatório!');
                return false;
            }
            
            const newId = 'pe_' + Date.now();
            DB.participantes_evento.push({
                id: newId,
                evento_id: eventoId,
                nome: nome,
                ra_matricula: ra || '',
                valor_cobrado: parseFloat(valorCobrado) || 0.00,
                status_pagamento: statusPagamento || 'Pendente',
                forma_pagamento: formaPagamento || 'Pix',
                data_pagamento: statusPagamento === 'Pago' ? new Date().toISOString().split('T')[0] : null,
                obs: obs || ''
            });
            logSQL(`Participante '${nome}' cadastrado para o evento com taxa de R$ ${parseFloat(valorCobrado).toFixed(2)}.`, 'success');
            
            if (statusPagamento === 'Pago') {
                const newFinanceId = 'lf_' + Date.now();
                const event = DB.eventos.find(e => e.id === eventoId);
                DB.lancamentos_financeiros.push({
                    id: newFinanceId,
                    tipo: 'Entrada',
                    categoria: `Ingresso: ${event ? event.nome : 'Evento'}`,
                    valor: parseFloat(valorCobrado),
                    data_competencia: new Date().toISOString().split('T')[0],
                    status_conciliacao: false,
                    evento_id: eventoId,
                    produto_id: null
                });
                logSQL(`Trigger Automático: Lançamento de Entrada de R$ ${parseFloat(valorCobrado).toFixed(2)} criado no caixa referente ao ingresso de ${nome}.`, 'trigger');
            }
            
            refreshAllUI();
            return newId;
        },
        updateParticipanteEventoValor: function(partId, novoValor, obs) {
            const part = DB.participantes_evento.find(p => p.id === partId);
            if (!part) return false;
            
            logSQL(`UPDATE participantes_evento SET valor_cobrado = ${novoValor}, obs = '${obs}' WHERE id = '${partId}';`, 'query');
            part.valor_cobrado = parseFloat(novoValor);
            part.obs = obs;
            logSQL(`Valor cobrado do participante '${part.nome}' atualizado para R$ ${parseFloat(novoValor).toFixed(2)}.`, 'success');
            refreshAllUI();
            return true;
        },
        updateParticipanteEventoStatus: function(partId, status, formaPgto) {
            const part = DB.participantes_evento.find(p => p.id === partId);
            if (!part) return false;
            
            const oldStatus = part.status_pagamento;
            if (oldStatus === status) return true;
            
            logSQL(`UPDATE participantes_evento SET status_pagamento = '${status}', forma_pagamento = '${formaPgto}' WHERE id = '${partId}';`, 'query');
            part.status_pagamento = status;
            part.forma_pagamento = formaPgto;
            if (status === 'Pago') {
                part.data_pagamento = new Date().toISOString().split('T')[0];
                
                const newFinanceId = 'lf_' + Date.now();
                const event = DB.eventos.find(e => e.id === part.evento_id);
                DB.lancamentos_financeiros.push({
                    id: newFinanceId,
                    tipo: 'Entrada',
                    categoria: `Ingresso: ${event ? event.nome : 'Evento'}`,
                    valor: part.valor_cobrado,
                    data_competencia: new Date().toISOString().split('T')[0],
                    status_conciliacao: false,
                    evento_id: part.evento_id,
                    produto_id: null
                });
                logSQL(`Trigger Automático: Lançamento de Entrada de R$ ${part.valor_cobrado.toFixed(2)} criado no caixa referente ao pagamento de ${part.nome}.`, 'trigger');
            } else {
                part.data_pagamento = null;
            }
            
            logSQL(`Status de pagamento do participante '${part.nome}' alterado para '${status}'.`, 'success');
            refreshAllUI();
            return true;
        },
        deleteParticipanteEvento: function(partId) {
            const idx = DB.participantes_evento.findIndex(p => p.id === partId);
            if (idx === -1) return false;
            
            const part = DB.participantes_evento[idx];
            logSQL(`DELETE FROM participantes_evento WHERE id = '${partId}';`, 'query');
            DB.participantes_evento.splice(idx, 1);
            logSQL(`Participante '${part.nome}' removido do evento.`, 'success');
            refreshAllUI();
            return true;
        }
    };

    async function updateConnectionStatus() {
        const badge = document.getElementById('login-db-status');
        if (!badge) return;
        const connBadge = document.getElementById('connection-status-badge');

        let online = false;
        if (typeof window.supabase !== 'undefined') {
            online = true;
        }

        if (online) {
            badge.style.display = 'none';
            if (connBadge) {
                connBadge.className = 'badge';
                connBadge.style.cssText = 'padding:6px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center;';
                connBadge.innerHTML = '<i class="fas fa-database"></i>';
                connBadge.title = 'Banco de Dados Conectado';
            }
        } else {
            badge.style.display = '';
            badge.className = 'login-status-badge offline';
            badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Banco Local (Simulado)';
            if (connBadge) {
                connBadge.className = 'badge badge-secondary';
                connBadge.style.cssText = 'padding:8px 12px;';
                connBadge.innerHTML = '<i class="fas fa-flask"></i> Ambiente Simulado';
                connBadge.title = '';
            }
        }
    }

    // ------------------------------------------------------------------------
    // 3. AUTENTICAÇÃO REAL DE PRODUÇÃO (Login / JWT / Simulador)
    // ------------------------------------------------------------------------

    // --- Verifica se o backend está online ---
    async function checkBackend() {
        const badge = document.getElementById('login-status-badge');
        const connBadge = document.getElementById('connection-status-badge');
        
        let online = false;
        if (typeof window.supabase !== 'undefined') {
            online = true;
        }

        if (online) {
            if (badge) {
                badge.style.display = 'none';
            }
            if (connBadge) {
                connBadge.className = 'badge';
                connBadge.style.cssText = 'padding:6px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center;';
                connBadge.innerHTML = '<i class="fas fa-database"></i>';
                connBadge.title = 'Banco de Dados Conectado';
            }
        } else {
            if (badge) {
                badge.style.display = '';
                badge.className = 'login-status-badge offline';
                badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Banco Local (Simulado)';
            }
            if (connBadge) {
                connBadge.className = 'badge badge-secondary';
                connBadge.style.cssText = 'padding:8px 12px;';
                connBadge.innerHTML = '<i class="fas fa-flask"></i> Ambiente Simulado';
                connBadge.title = '';
            }
        }
    }

    // --- Autenticação local (fallback sem backend) ---
    function localAuth(email, password) {
        const user = DB.usuarios.find(u => u.email === email && u.status);
        if (!user) return null;
        const expectedPassword = user.senha || 'lup123_strategy';
        if (password !== expectedPassword) return null;
        return user;
    }

    // --- Popula a sidebar após login ---
    function populateSidebar(user) {
        document.getElementById('sidebar-user-name').textContent = user.nome;
        document.getElementById('sidebar-user-role').textContent = user.cargo;
        document.getElementById('sidebar-user-dept').textContent =
            user.diretoria !== 'Nenhuma' ? `Dir. de ${user.diretoria}` : 'Geral';
    }

    // --- Aplica visibilidade do menu financeiro ---
    function applyNavPermissions() {
        if (!currentUser) return;
        const isMaster = currentUser.cargo === 'Master';
        const dir = currentUser.diretoria;

        // Reset visibility of conditional nav items
        const parceriasNavItem = document.querySelector('[data-target="mod-parcerias"]');
        const legalNavItem     = document.querySelector('[data-target="mod-legal"]');
        if (parceriasNavItem) parceriasNavItem.style.display = '';
        if (legalNavItem)     legalNavItem.style.display = '';

        // Financeiro: somente Presidência, Vice-Presidência, Tesouraria e Master
        const financeItem = document.querySelector('.nav-item-finance');
        if (financeItem) {
            financeItem.style.display = canViewFinance() ? '' : 'none';
        }

        // Gestão de Acessos: apenas Master
        document.querySelectorAll('[data-requires-master]').forEach(item => {
            item.style.display = isMaster ? '' : 'none';
        });

        if (!isMaster) {
            // Jurídico: NÃO vê mod-parcerias no menu
            if (dir === 'Jurídico') {
                if (parceriasNavItem) parceriasNavItem.style.display = 'none';
            }
            // Parcerias: NÃO vê mod-legal no menu
            if (dir === 'Parcerias') {
                if (legalNavItem) legalNavItem.style.display = 'none';
            }
        }
    }

    // --- Aplica modo somente leitura aos módulos ---
    function applyReadonlyMode() {
        document.querySelectorAll('.module-section').forEach(section => {
            const moduleId = section.id;
            const canEdit = canWrite(moduleId);
            const existingBanner = section.querySelector('.readonly-module-banner');

            if (!canEdit) {
                section.classList.add('module-readonly');
                if (!existingBanner) {
                    const banner = document.createElement('div');
                    banner.className = 'readonly-module-banner';
                    banner.innerHTML = `<i class="fas fa-eye"></i> <span><strong>Modo Somente Leitura</strong> — sua diretoria pode visualizar este módulo, mas apenas a diretoria responsável pode criar ou editar dados aqui.</span>`;
                    section.insertBefore(banner, section.firstChild);
                }
            } else {
                section.classList.remove('module-readonly');
                if (existingBanner) existingBanner.remove();
            }
        });
    }

    // --- Sincroniza dados do Supabase para Memória Local ---
    window.syncDBFromSupabase = async function() {
        console.log('Iniciando sincronização com o Supabase...');
        const tables = [
            'usuarios', 'eventos', 'tarefas_logistica', 'modalidades', 'atletas',
            'produtos', 'produto_variantes', 'calendario_editorial', 'cronograma_postagens',
            'escalacoes', 'participantes_evento', 'lancamentos_financeiros',
            'parceiros_patrocinadores', 'documentos_contratos', 'logs_notificacoes',
            'fornecedores', 'pedidos_compra', 'chat_conversations', 'chat_participants', 'chat_messages'
        ];

        for (const table of tables) {
            const { data, error } = await supabase.from(table).select('*');
            if (error) {
                console.error(`Erro ao carregar ${table}:`, error);
            } else if (data) {
                if(data.length > 0) DB[table] = data; 
            }
        }

        // Garante que a conversa padrão "Geral LUP" existe (seed automático)
        if (!DB.chat_conversations.find(c => c.id === 'conv-1')) {
            const seedConv = { id: 'conv-1', name: 'Geral LUP', type: 'Grupo' };
            DB.chat_conversations.push(seedConv);
            supabase.from('chat_conversations').upsert(seedConv)
                .then(({ error }) => { if (error) console.warn('Seed chat_conversations:', error); });
        }

        console.log('Sincronização concluída! chat_conversations:', DB.chat_conversations.length);
    };

    // --- Abre o painel após autenticação ---
    function openApp(user) {
        currentUser = user;
        window.currentUser = currentUser;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-wrapper').style.display = '';
        
        // Atualiza a foto e textos do perfil no topo
        const userAvatar = user.avatar || 'assets/default-avatar.png';
        const imgHeader = document.getElementById('header-user-avatar');
        const imgDropdown = document.getElementById('dropdown-user-avatar');
        if (imgHeader) imgHeader.src = userAvatar;
        if (imgDropdown) imgDropdown.src = userAvatar;

        const nameEl = document.getElementById('dropdown-user-name');
        const emailEl = document.getElementById('dropdown-user-email');
        const badgeEl = document.getElementById('dropdown-user-badge');
        if (nameEl) nameEl.textContent = user.nome;
        if (emailEl) emailEl.textContent = user.email;
        if (badgeEl) badgeEl.textContent = `${user.cargo} / ${user.diretoria !== 'Nenhuma' ? user.diretoria : 'Geral'}`;

        populateSidebar(user);
        applyNavPermissions();
        applyReadonlyMode();
        logSQL(`LOGIN: Usuário '${user.nome}' autenticado. cargo=${user.cargo}, diretoria=${user.diretoria}`, 'trigger');
        
        // Configura e inicializa o calendário para o mês atual ao entrar no app
        calendarCurrentDate = new Date();
        calendarSelectedDate = new Date();
        renderDashboardCalendar();
        renderCalendarDayDetails(calendarSelectedDate);

        // Cron simulado: verifica contratos vencendo nos próximos 30 dias ao abrir o painel
        checkContratoVencendoNotifications();

        refreshAllUI();

        // Sempre resetar para a aba "Dashboard Executivo" ao fazer login para evitar herdar telas anteriores
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
        
        const dashboardNavItem = document.querySelector('[data-target="mod-dashboard"]');
        if (dashboardNavItem) {
            dashboardNavItem.classList.add('active');
            document.getElementById('mod-dashboard').classList.add('active');
        }
    }

    // --- Handler do formulário de login ---
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email    = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl    = document.getElementById('login-error');
        const btnText  = document.getElementById('btn-login-text');
        const btnLoad  = document.getElementById('btn-login-loading');
        const btn      = document.getElementById('btn-login');

        errEl.style.display = 'none';
        btnText.style.display = 'none';
        btnLoad.style.display = '';
        btn.disabled = true;

        try {
            // 1. Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email, password
            });

            if (authError) throw authError;

            // 2. Sincroniza o Banco de Dados Inteiro
            await window.syncDBFromSupabase();

            // 3. Valida se o usuário existe na tabela pública
            // Usa o UUID real do Auth como id do currentUser para garantir que sender_id do chat é correto
            const authUID = authData.user.id;
            let user = DB.usuarios.find(u => u.id === authUID);
            if (!user) {
                // Fallback: busca por email e atualiza o ID para o UUID real
                user = DB.usuarios.find(u => u.email === email);
                if (user) {
                    user.id = authUID; // Corrige o ID local para o UUID real
                }
            }
            if (!user) throw new Error('Seu usuário foi criado no cofre, mas ainda não tem ficha na tabela de usuários. Peça ao Master para criar sua ficha.');

            openApp(user);

        } catch (err) {
            console.error('Erro no Supabase:', err);
            // Fallback provisório (Mock) caso o Supabase ainda não tenha usuários
            let localUser = localAuth(email, password);
            if (localUser) {
                console.warn('Fallback: Logado pelo cache local mockado.');
                openApp(localUser);
            } else {
                errEl.textContent = err.message || 'E-mail ou senha inválidos no Supabase.';
                errEl.style.display = 'block';
            }
        }

        btnText.style.display = '';
        btnLoad.style.display = 'none';
        btn.disabled = false;

        if (user) openApp(user);
    });

    // --- Toggle show/hide senha ---
    document.getElementById('btn-toggle-password').addEventListener('click', () => {
        const pwInput = document.getElementById('login-password');
        const icon    = document.getElementById('pw-eye-icon');
        if (pwInput.type === 'password') {
            pwInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            pwInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    });

    // --- Logout ---
    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('lup_token');
        localStorage.removeItem('lup_user');
        currentUser = null;
        document.getElementById('app-wrapper').style.display = 'none';
        document.getElementById('login-screen').style.display = '';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        logSQL('LOGOUT: Sessão encerrada pelo usuário.', 'trigger');
    });

    // --- Inicializa verificação de backend e tenta re-login por token salvo ---
    (async () => {
        await checkBackend();
        // Se token válido no localStorage, tenta restaurar sessão
        try {
            const savedUser = JSON.parse(localStorage.getItem('lup_user'));
            const savedToken = localStorage.getItem('lup_token');
            if (savedUser && savedToken) {
                openApp(savedUser);
                return;
            }
        } catch { /* ignorar */ }
    })();

    // ------------------------------------------------------------------------
    // 4. LOGICA DA INTERFACE DE USUÁRIO (DOM MANIPULATION)
    // ------------------------------------------------------------------------

    // Tab Navigation Switcher
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.module-section');

    let prevTarget = null;
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetSection = item.getAttribute('data-target');

        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        item.classList.add('active');
        document.getElementById(targetSection).classList.add('active');
        logSQL(`Navegação: Acessou módulo '${item.innerText.trim()}'`, 'query');

        // Inicializar chat ao entrar no módulo
        if (targetSection === 'mod-comunicacao' && currentUser) {
            ChatModule.init();
            const _noConv = document.getElementById('chat-no-selection');
            const _actConv = document.getElementById('chat-active-area');
            if (_noConv)  _noConv.style.display  = 'flex';
            if (_actConv) _actConv.style.display = 'none';
        }

        // Destruir subscriptions Realtime ao sair do módulo
        if (prevTarget === 'mod-comunicacao' && targetSection !== 'mod-comunicacao') {
            ChatModule.destroy();
        }

        prevTarget = targetSection;
    });
});

    // Close Error Overlay Modal
    document.getElementById('btn-close-error').addEventListener('click', () => {
        document.getElementById('error-overlay').classList.remove('active');
    });

    // RENDER 1: EXECUTIVE DASHBOARD
    function renderExecutiveDashboard() {
        // KPIs calculations
        const totalCash = DB.lancamentos_financeiros.reduce((sum, item) => {
            return item.tipo === 'Entrada' ? sum + item.valor : sum - item.valor;
        }, 0);
        
        const countEvents = DB.eventos.filter(e => e.status_aprovacao === 'Aguardando Tesouraria').length;
        
        const countContracts = DB.documentos_contratos.filter(dc => {
            if (!dc.data_vencimento) return false;
            const diffDays = Math.ceil((new Date(dc.data_vencimento) - new Date()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 30; // Vencendo nos próximos 30 dias
        }).length;
        
        const countAtletasIrregulares = DB.atletas.filter(a => a.status_documentacao === 'Pendente' || a.status_documentacao === 'Rejeitado').length;

        // Populate KPI elements
        document.getElementById('kpi-saldo-caixa').innerText = `R$ ${totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('kpi-eventos-pendentes').innerText = countEvents;
        document.getElementById('kpi-contratos-vencer').innerText = countContracts;
        document.getElementById('kpi-atletas-irregulares').innerText = countAtletasIrregulares;

        renderAccessModule();

        // Render Logs & Audit table (with Delete attempt simulated to test RN-LOG-01)
        const logsTbody = document.querySelector('#logs-table tbody');
        logsTbody.innerHTML = '';
        
        const sortedLogs = DB.logs_notificacoes.slice().sort((a, b) => b.data_envio.localeCompare(a.data_envio));
        sortedLogs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.data_envio}</td>
                <td><span class="badge badge-secondary">${log.tipo_notificacao}</span></td>
                <td><span class="badge ${log.gatilho_regra === 'TENTATIVA_VIOLACAO' ? 'badge-danger' : 'badge-warning'}">${log.gatilho_regra}</span></td>
                <td><code>${log.destinatario_email}</code></td>
                <td>
                    <span class="badge ${log.status_entrega === 'ENVIADO' ? 'badge-success' : 'badge-danger'}">
                        ${log.status_entrega}
                    </span>
                    ${log.erro_detalhe ? `<div style="font-size:10px; color:var(--text-secondary); margin-top:4px; max-width:250px;">${log.erro_detalhe}</div>` : ''}
                </td>
                <td>
                    <button class="btn btn-secondary btn-delete-log" data-log-id="${log.id}" style="padding: 4px 8px; font-size:11px;">
                        <i class="fas fa-trash"></i> Deletar
                    </button>
                </td>
            `;
            logsTbody.appendChild(tr);
        });

        // Event listener for trying to delete append-only logs (RN-LOG-01)
        document.querySelectorAll('.btn-delete-log').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const logId = btn.getAttribute('data-log-id');
                if (confirm('Tem certeza de que deseja excluir este log de auditoria? Esta ação é irreversível.')) {
                    DB_Engine.mutateAuditLog(logId, 'delete');
                }
            });
        });
    }

    // --- FUNÇÕES E LISTENERS DO CALENDÁRIO ---
    function renderDashboardCalendar() {
        const monthYearEl = document.getElementById('cal-month-year');
        const calWrapper = document.querySelector('.calendar-wrapper');
        if (!monthYearEl || !calWrapper) return;

        const year = calendarCurrentDate.getFullYear();
        const month = calendarCurrentDate.getMonth();

        const monthsPT = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        monthYearEl.textContent = `${monthsPT[month]} ${year}`;

        calWrapper.innerHTML = `
            <div class="calendar-grid-header">
                <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            <div class="calendar-grid-body"></div>
        `;

        const gridBody = calWrapper.querySelector('.calendar-grid-body');

        const firstDayIndex = new Date(year, month, 1).getDay();
        const prevLastDay = new Date(year, month, 0).getDate();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const lastDayIndex = new Date(year, month, lastDay).getDay();
        const nextDays = 7 - lastDayIndex - 1;

        // Dias do mês anterior
        for (let x = firstDayIndex; x > 0; x--) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day other-month';
            dayEl.textContent = prevLastDay - x + 1;
            gridBody.appendChild(dayEl);
        }

        // Dias do mês atual
        for (let i = 1; i <= lastDay; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = i;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            dayEl.setAttribute('data-date', dateStr);

            const today = new Date();
            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayEl.classList.add('today');
            }

            if (i === calendarSelectedDate.getDate() && month === calendarSelectedDate.getMonth() && year === calendarSelectedDate.getFullYear()) {
                dayEl.classList.add('active-day');
            }

            // Busca eventos aprovados
            const hasEvents = DB.eventos.some(e => {
                if (e.status_aprovacao !== 'Aprovado') return false;
                return e.data_evento.split(' ')[0] === dateStr;
            });

            // Busca posts agendados
            const hasPosts = DB.cronograma_postagens.some(p => {
                if (p.status !== 'Agendado') return false;
                return p.data_publicacao.split(' ')[0] === dateStr;
            });

            if (hasEvents || hasPosts) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'calendar-dots-container';
                if (hasEvents) {
                    const dot = document.createElement('span');
                    dot.className = 'calendar-dot dot-event';
                    dotsContainer.appendChild(dot);
                }
                if (hasPosts) {
                    const dot = document.createElement('span');
                    dot.className = 'calendar-dot dot-post';
                    dotsContainer.appendChild(dot);
                }
                dayEl.appendChild(dotsContainer);
            }

            dayEl.addEventListener('click', () => {
                calendarSelectedDate = new Date(year, month, i);
                renderDashboardCalendar();
                renderCalendarDayDetails(calendarSelectedDate);
            });

            gridBody.appendChild(dayEl);
        }

        // Dias do próximo mês
        for (let j = 1; j <= nextDays; j++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day other-month';
            dayEl.textContent = j;
            gridBody.appendChild(dayEl);
        }
    }

    function renderCalendarDayDetails(date) {
        const selectedLabel = document.getElementById('cal-selected-day-label');
        const actionsList = document.getElementById('calendar-day-actions-list');
        if (!selectedLabel || !actionsList) return;

        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        selectedLabel.textContent = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
        actionsList.innerHTML = '';

        const dayEvents = DB.eventos.filter(e => {
            if (e.status_aprovacao !== 'Aprovado') return false;
            return e.data_evento.split(' ')[0] === dateStr;
        });

        const dayPosts = DB.cronograma_postagens.filter(p => {
            if (p.status !== 'Agendado') return false;
            return p.data_publicacao.split(' ')[0] === dateStr;
        });

        if (dayEvents.length === 0 && dayPosts.length === 0) {
            actionsList.innerHTML = `
                <div style="text-align:center; padding: 24px 12px; color: var(--text-secondary); font-size:12px;">
                    <i class="fas fa-calendar-times" style="font-size:24px; margin-bottom:8px; opacity:0.4;"></i>
                    <p>Nenhuma ação agendada para este dia.</p>
                </div>
            `;
            return;
        }

        dayEvents.forEach(evt => {
            const timeStr = evt.data_evento.split(' ')[1] || 'Geral';
            const card = document.createElement('div');
            card.className = 'action-day-card event-type';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:4px; color:#10b981;">
                    <span><i class="fas fa-star"></i> Evento Aprovado</span>
                    <span>${timeStr}</span>
                </div>
                <div style="font-size:13px; font-weight:bold; color:#fff; margin-bottom:2px;">${evt.nome}</div>
                <div style="color:var(--text-secondary); font-size:11px;">
                    <i class="fas fa-map-marker-alt"></i> Local: ${evt.local} | Tipo: ${evt.tipo}
                </div>
            `;
            actionsList.appendChild(card);
        });

        dayPosts.forEach(post => {
            const timeStr = post.data_publicacao.split(' ')[1] || 'Geral';
            const card = document.createElement('div');
            card.className = 'action-day-card post-type';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:4px; color:#ea580c;">
                    <span><i class="fab fa-instagram"></i> Postagem Agendada (${post.plataforma})</span>
                    <span>${timeStr}</span>
                </div>
                <div style="font-size:13px; font-weight:bold; color:#fff; margin-bottom:2px;">${post.tipo_conteudo}</div>
                <div style="color:var(--text-secondary); font-size:11px; word-break:break-word;">
                    Desc: ${post.descricao}
                </div>
            `;
            actionsList.appendChild(card);
        });
    }

    // Navegação do Calendário
    const prevMonthBtn = document.getElementById('cal-prev-month');
    const nextMonthBtn = document.getElementById('cal-next-month');
    if (prevMonthBtn && nextMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
            renderDashboardCalendar();
        });
        nextMonthBtn.addEventListener('click', () => {
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
            renderDashboardCalendar();
        });
    }

    // --- LOGICA DE GERENCIAMENTO DE PERFIL INDIVIDUAL ---
    const btnProfile = document.getElementById('btn-profile-dropdown');
    const profileDropdown = document.getElementById('profile-dropdown');
    const btnGoSettings = document.getElementById('btn-go-to-settings');
    const btnDropdownLogout = document.getElementById('btn-dropdown-logout');

    if (btnProfile && profileDropdown) {
        btnProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.style.display = profileDropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            profileDropdown.style.display = 'none';
        });

        profileDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (btnGoSettings) {
        btnGoSettings.addEventListener('click', () => {
            if (profileDropdown) profileDropdown.style.display = 'none';

            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));

            const configSection = document.getElementById('mod-configuracoes');
            if (configSection) {
                configSection.classList.add('active');
            }

            if (currentUser) {
                document.getElementById('profile-name').value = currentUser.nome;
                document.getElementById('profile-email').value = currentUser.email;
                document.getElementById('profile-password').value = '';
                document.getElementById('profile-password-confirm').value = '';
                document.getElementById('profile-avatar-url').value = currentUser.avatar && !currentUser.avatar.startsWith('data:') ? currentUser.avatar : '';
                document.getElementById('profile-avatar-file').value = '';
            }
        });
    }

    if (btnDropdownLogout) {
        btnDropdownLogout.addEventListener('click', () => {
            if (profileDropdown) profileDropdown.style.display = 'none';
            document.getElementById('btn-logout').click();
        });
    }

    const formProfileSettings = document.getElementById('form-profile-settings');
    if (formProfileSettings) {
        formProfileSettings.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const email = document.getElementById('profile-email').value.trim();
            const password = document.getElementById('profile-password').value;
            const passwordConfirm = document.getElementById('profile-password-confirm').value;
            const avatarUrl = document.getElementById('profile-avatar-url').value.trim();
            const avatarFileInput = document.getElementById('profile-avatar-file');
            const saveMsg = document.getElementById('profile-save-message');

            if (password && password.length < 6) {
                alert('A nova senha deve conter pelo menos 6 caracteres!');
                return;
            }

            if (password !== passwordConfirm) {
                alert('A nova senha e a confirmação de senha não coincidem!');
                return;
            }

            const executeSave = (avatarData) => {
                const userInDb = DB.usuarios.find(u => u.id === currentUser.id);
                if (userInDb) {
                    userInDb.email = email;
                    if (password) {
                        userInDb.senha = password;
                        userInDb.password_hash = `[HASH de '${password}']`;
                    }
                    if (avatarData) {
                        userInDb.avatar = avatarData;
                    }

                    currentUser.email = email;
                    if (password) {
                        currentUser.senha = password;
                        currentUser.password_hash = userInDb.password_hash;
                    }
                    if (avatarData) {
                        currentUser.avatar = avatarData;
                    }

                    localStorage.setItem('lup_user', JSON.stringify(currentUser));

                    logSQL(`UPDATE usuarios SET email = '${email}'${password ? `, senha = [HASH]` : ''}${avatarData ? `, avatar = [IMAGE]` : ''} WHERE id = '${currentUser.id}';`, 'query');
                    logSQL(`Perfil de '${currentUser.nome}' atualizado com sucesso.`, 'success');

                    const userAvatar = currentUser.avatar || 'assets/default-avatar.png';
                    const imgHeader = document.getElementById('header-user-avatar');
                    const imgDropdown = document.getElementById('dropdown-user-avatar');
                    if (imgHeader) imgHeader.src = userAvatar;
                    if (imgDropdown) imgDropdown.src = userAvatar;

                    const emailEl = document.getElementById('dropdown-user-email');
                    if (emailEl) emailEl.textContent = email;

                    if (saveMsg) {
                        saveMsg.textContent = 'Alterações salvas com sucesso!';
                        saveMsg.style.display = 'inline-block';
                        setTimeout(() => {
                            saveMsg.style.display = 'none';
                        }, 3000);
                    }
                    refreshAllUI();
                }
            };

            if (avatarFileInput && avatarFileInput.files && avatarFileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    executeSave(evt.target.result);
                };
                reader.readAsDataURL(avatarFileInput.files[0]);
            } else if (avatarUrl) {
                executeSave(avatarUrl);
            } else {
                executeSave(null);
            }
        });
    }

    // RENDER 2: ACCESS MANAGEMENT MODULE (Gestão de Acessos)
    function renderAccessModule() {
        const searchInput = document.getElementById('search-users-input');
        const query = searchInput ? searchInput.value.toLowerCase() : '';

        const userListTbody = document.querySelector('#users-table tbody');
        userListTbody.innerHTML = '';

        const filteredUsers = DB.usuarios.filter(u =>
            u.nome.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.cargo.toLowerCase().includes(query) ||
            u.diretoria.toLowerCase().includes(query)
        );

        filteredUsers.forEach(user => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Clique para editar este membro';
            tr.innerHTML = `
                <td><b>${user.nome}</b></td>
                <td><code>${user.email}</code></td>
                <td><span class="badge badge-secondary">${user.cargo}</span></td>
                <td><span class="badge badge-secondary">${user.diretoria}</span></td>
                <td>
                    <span class="badge ${user.status ? 'badge-success' : 'badge-danger'}">
                        ${user.status ? '<i class="fas fa-circle" style="font-size:8px;"></i> Ativo' : '<i class="fas fa-ban" style="font-size:10px;"></i> Inativo'}
                    </span>
                </td>
            `;
            // Click row to load user into the edit form
            tr.addEventListener('click', () => {
                document.getElementById('user-edit-id').value = user.id;
                document.getElementById('user-nome').value = user.nome;
                document.getElementById('user-email').value = user.email;
                document.getElementById('user-cargo').value = user.cargo;
                document.getElementById('user-diretoria').value = user.diretoria;
                document.getElementById('user-status').checked = user.status;
                document.getElementById('user-status-text').innerText = user.status ? 'Conta Ativa' : 'Conta Inativa';
                document.getElementById('user-password').value = '';
                document.getElementById('user-password-group').style.opacity = '1';
                document.getElementById('user-form-title').innerHTML = `<i class="fas fa-user-edit"></i> Editando: ${user.nome}`;
                document.getElementById('btn-cancel-user-edit').style.display = 'inline-flex';
                document.getElementById('btn-save-user').innerHTML = '<i class="fas fa-save"></i> Salvar Alterações (Atualizar no Supabase)';
                // Highlight row
                document.querySelectorAll('#users-table tbody tr').forEach(r => r.style.background = '');
                tr.style.background = 'rgba(234, 88, 12, 0.08)';
            });
            userListTbody.appendChild(tr);
        });
    }

    // Reactive search: filter user table on input
    const searchUsersInput = document.getElementById('search-users-input');
    if (searchUsersInput) {
        searchUsersInput.addEventListener('input', () => renderAccessModule());
    }

    // Toggle checkbox status text
    const userStatusCheckbox = document.getElementById('user-status');
    if (userStatusCheckbox) {
        userStatusCheckbox.addEventListener('change', () => {
            document.getElementById('user-status-text').innerText = userStatusCheckbox.checked ? 'Conta Ativa' : 'Conta Inativa';
        });
    }

    // Reset user form to 'new user' mode
    function resetUserForm() {
        document.getElementById('user-edit-id').value = '';
        document.getElementById('user-form-title').innerHTML = '<i class="fas fa-user-plus"></i> Cadastrar Novo Membro da Diretoria';
        document.getElementById('form-manage-user').reset();
        document.getElementById('user-status').checked = true;
        document.getElementById('user-status-text').innerText = 'Conta Ativa';
        document.getElementById('user-password-group').style.opacity = '1';
        document.getElementById('btn-cancel-user-edit').style.display = 'none';
        document.getElementById('btn-save-user').innerHTML = '<i class="fas fa-save"></i> Salvar Membro';
        document.querySelectorAll('#users-table tbody tr').forEach(r => r.style.background = '');
    }

    // User form submit handler
    const formManageUser = document.getElementById('form-manage-user');
    if (formManageUser) {
        formManageUser.addEventListener('submit', (e) => {
            e.preventDefault();
            const editId = document.getElementById('user-edit-id').value;
            const data = {
                id: editId || null,
                nome: document.getElementById('user-nome').value,
                email: document.getElementById('user-email').value,
                password: document.getElementById('user-password').value,
                cargo: document.getElementById('user-cargo').value,
                diretoria: document.getElementById('user-diretoria').value,
                status: document.getElementById('user-status').checked
            };

            const ok = DB_Engine.saveUsuario(data);
            if (ok) resetUserForm();
        });
    }

    const btnCancelEdit = document.getElementById('btn-cancel-user-edit');
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener('click', () => resetUserForm());
    }

    // RENDER 3: EVENTS MODULE (KANBAN BOARD)
    function renderEventsModule() {
        const cols = {
            'Rascunho': document.getElementById('col-rascunho-body'),
            'Aguardando Tesouraria': document.getElementById('col-tesouraria-body'),
            'Aprovado': document.getElementById('col-aprovado-body'),
            'Cancelado': document.getElementById('col-cancelado-body')
        };

        // Clear columns
        Object.keys(cols).forEach(k => cols[k].innerHTML = '');

        // Populate Kanban cards
        DB.eventos.forEach(evt => {
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.setAttribute('draggable', 'true');
            card.innerHTML = `
                <div class="event-name">${evt.nome}</div>
                <div class="event-details">
                    <span><i class="fas fa-map-marker-alt"></i> ${evt.local}</span>
                    <span><i class="fas fa-calendar-alt"></i> ${evt.data_evento}</span>
                </div>
                <div class="event-details" style="margin-top: 4px; display: flex; gap: 4px; align-items: center;">
                    <span class="badge badge-secondary" style="font-size:10px; padding: 2px 6px;">${evt.tipo || 'Institucional'}</span>
                    ${(evt.tipo === 'Social' || evt.tipo === 'Misto' || evt.tipo === 'Competição') && evt.valor_taxa_base > 0 ? `
                        <span class="badge" style="font-size:10px; padding: 2px 6px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);"><i class="fas fa-ticket-alt"></i> R$ ${evt.valor_taxa_base.toFixed(2)}</span>
                    ` : ''}
                </div>
                <div class="event-budget" style="margin-top: 8px;">
                    <span>Orçamento: R$ ${evt.orcamento_previsto.toFixed(2)}</span>
                    ${evt.status_aprovacao === 'Aguardando Tesouraria' ? `
                        <button class="btn-approve-event" data-evt-id="${evt.id}">
                            <i class="fas fa-check"></i> Aprovar
                        </button>
                    ` : ''}
                </div>
            `;

            // Click listener for Approve Button (testing triggers & permissions)
            const approveBtn = card.querySelector('.btn-approve-event');
            if (approveBtn) {
                approveBtn.addEventListener('click', () => {
                    DB_Engine.updateEventStatus(evt.id, 'Aprovado');
                });
            }

            // Simple Drag and Drop listeners or column transitions
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', evt.id);
            });

            if (cols[evt.status_aprovacao]) {
                cols[evt.status_aprovacao].appendChild(card);
            }
        });

        // Set up drop zones
        Object.keys(cols).forEach(status => {
            const colBody = cols[status];
            colBody.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            colBody.addEventListener('drop', (e) => {
                e.preventDefault();
                const evtId = e.dataTransfer.getData('text/plain');
                DB_Engine.updateEventStatus(evtId, status);
            });
        });
    }

    // Toggle Taxa Base visibility based on Event Type
    const evtTipoSelect = document.getElementById('evt-tipo');
    if (evtTipoSelect) {
        evtTipoSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const groupTaxa = document.getElementById('group-taxa-base');
            if (groupTaxa) {
                if (val === 'Social' || val === 'Misto' || val === 'Competição') {
                    groupTaxa.style.display = 'block';
                } else {
                    groupTaxa.style.display = 'none';
                    document.getElementById('evt-taxa-base').value = '0.00';
                }
            }
        });
    }

    // Event Handler: Create Event Form
    document.getElementById('form-create-event').addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('evt-nome').value;
        const data = document.getElementById('evt-data').value;
        const local = document.getElementById('evt-local').value;
        const orcamento = parseFloat(document.getElementById('evt-orcamento').value) || 0;
        const tipo = document.getElementById('evt-tipo').value;
        const taxaBase = parseFloat(document.getElementById('evt-taxa-base').value) || 0;

        const newId = 'e_' + Date.now();
        const event = {
            id: newId,
            nome: nome,
            data_evento: data.replace('T', ' '),
            local: local,
            orcamento_previsto: orcamento,
            status_aprovacao: 'Rascunho',
            tipo: tipo,
            valor_taxa_base: taxaBase,
            criador_id: currentUser.id
        };

        DB.eventos.push(event);
        logSQL(`INSERT INTO eventos (nome, data_evento, local, orcamento_previsto, status_aprovacao, tipo, valor_taxa_base, criador_id) VALUES ('${nome}', '${data}', '${local}', ${orcamento}, 'Rascunho', '${tipo}', ${taxaBase}, '${currentUser.id}');`, 'query');
        logSQL(`Event successfully created in state 'Rascunho'. Please drag or push it to 'Aguardando Tesouraria' to request funds.`, 'success');

        // --- TRIGGER NOTIFICAÇÃO: Solicitação de Verba para eventos do tipo Misto ou com orçamento previsto ---
        if (tipo === 'Misto' || orcamento > 0) {
            DB.logs_notificacoes.push({
                id: 'log_' + Date.now(),
                usuario_id: currentUser ? currentUser.id : 'u1',
                tipo_notificacao: 'Email',
                gatilho_regra: 'SOLICITACAO_VERBA',
                destinatario_email: 'financeiro@atleticalup.com.br',
                status_entrega: 'ENVIADO',
                data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                erro_detalhe: `Solicitação de verba para evento '${nome}' (${tipo}) de valor R$ ${orcamento.toFixed(2)}.`,
                lida: false
            });
            logSQL(`INSERT INTO logs_notificacoes (usuario_id, tipo_notificacao, gatilho_regra, destinatario_email, status_entrega) VALUES ('${currentUser ? currentUser.id : 'u1'}', 'Email', 'SOLICITACAO_VERBA', 'financeiro@atleticalup.com.br', 'ENVIADO');`, 'query');
            logSQL(`Notificação de SOLICITACAO_VERBA disparada automaticamente para Tesouraria.`, 'success');
        }
        
        document.getElementById('form-create-event').reset();
        const groupTaxa = document.getElementById('group-taxa-base');
        if (groupTaxa) groupTaxa.style.display = 'none';
        refreshAllUI();
    });

    // RENDER: MARKETING MODULE (Fase 4)
    function renderMarketingModule() {
        const mktEvtSelect = document.getElementById('mkt-evento-select');
        if (!mktEvtSelect) return;

        // Populate event select with approved events
        const prevSelectValue = selectedMarketingEventId;
        mktEvtSelect.innerHTML = '<option value="">Selecione um Evento...</option>';
        
        const approvedEvents = DB.eventos.filter(e => e.status_aprovacao === 'Aprovado');
        approvedEvents.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.innerText = `${e.nome} (${e.tipo || 'Institucional'})`;
            mktEvtSelect.appendChild(opt);
        });

        if (prevSelectValue && approvedEvents.some(e => e.id === prevSelectValue)) {
            mktEvtSelect.value = prevSelectValue;
            selectedMarketingEventId = prevSelectValue;
        } else {
            mktEvtSelect.value = '';
            selectedMarketingEventId = '';
        }

        // Setup change listener once
        if (!mktEvtSelect.dataset.listener) {
            mktEvtSelect.addEventListener('change', (e) => {
                selectedMarketingEventId = e.target.value;
                renderMarketingModule();
            });
            mktEvtSelect.dataset.listener = 'true';
        }

        const container = document.getElementById('mkt-cronograma-container');
        const placeholder = document.getElementById('mkt-no-evento-selected');

        if (!selectedMarketingEventId) {
            if (container) container.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
            return;
        }

        if (container) container.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        // Render table of post schedules
        const tbody = document.querySelector('#mkt-posts-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const posts = DB.cronograma_postagens.filter(p => p.evento_id === selectedMarketingEventId);
            
            if (posts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">Nenhuma postagem agendada para este evento.</td></tr>';
            } else {
                posts.forEach(post => {
                    const tr = document.createElement('tr');
                    
                    let statusBadge = '';
                    if (post.status === 'Publicado') {
                        statusBadge = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Publicado</span>`;
                    } else if (post.status === 'Cancelado') {
                        statusBadge = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Cancelado</span>`;
                    } else {
                        statusBadge = `<span class="badge badge-warning"><i class="fas fa-clock"></i> Agendado</span>`;
                    }

                    const evento = DB.eventos.find(e => e.id === post.evento_id);
                    const eventoNome = evento ? evento.nome : '—';

                    tr.innerHTML = `
                        <td><b>${eventoNome}</b></td>
                        <td><b>${post.plataforma}</b> <span class="badge badge-secondary" style="font-size:10px;">${post.tipo_conteudo}</span></td>
                        <td><code>${post.data_publicacao}</code></td>
                        <td>${post.descricao}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                ${post.status === 'Agendado' ? `
                                    <button class="btn btn-secondary btn-publish-post" data-post-id="${post.id}" style="padding:4px 8px; font-size:11px; background:var(--success-glow); color:var(--success);">
                                        Publicar
                                    </button>
                                    <button class="btn btn-secondary btn-cancel-post" data-post-id="${post.id}" style="padding:4px 8px; font-size:11px; background:var(--danger-glow); color:var(--danger);">
                                        Cancelar
                                    </button>
                                ` : ''}
                                <button class="btn btn-secondary btn-delete-post" data-post-id="${post.id}" style="padding:4px 8px; font-size:11px;">
                                    Excluir
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Attach button click listeners
                tbody.querySelectorAll('.btn-publish-post').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-post-id');
                        DB_Engine.updateCronogramaPostagemStatus(id, 'Publicado');
                    });
                });

                tbody.querySelectorAll('.btn-cancel-post').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-post-id');
                        DB_Engine.updateCronogramaPostagemStatus(id, 'Cancelado');
                    });
                });

                tbody.querySelectorAll('.btn-delete-post').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-post-id');
                        if (confirm('Tem certeza de que deseja excluir esta postagem? Esta ação é irreversível.')) {
                            DB_Engine.deleteCronogramaPostagem(id);
                        }
                    });
                });
            }
        }
    }

    // Event Handler: Create Marketing Schedule Post
    const formCreatePost = document.getElementById('form-create-post');
    if (formCreatePost) {
        formCreatePost.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!selectedMarketingEventId) {
                alert('Selecione um evento primeiro!');
                return;
            }
            const plataforma = document.getElementById('post-plataforma').value;
            const tipo = document.getElementById('post-tipo').value;
            const data = document.getElementById('post-data').value;
            const desc = document.getElementById('post-descricao').value;

            DB_Engine.insertCronogramaPostagem(selectedMarketingEventId, plataforma, tipo, data, desc);
            formCreatePost.reset();
        });
    }

    // RENDER 3: PRODUCTS & INVENTORY
    function renderProductsModule() {
        // Tabela de Inventário
        const inventoryTbody = document.querySelector('#inventory-table tbody');
        inventoryTbody.innerHTML = '';
        
        // Tabela de Cadastro de Produtos (Aba Produtos)
        const productsTbody = document.querySelector('#produtos-list-table tbody');
        if (productsTbody) {
            productsTbody.innerHTML = '';
            DB.produtos.forEach(p => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td><b>${p.nome}</b></td>
                    <td>R$ ${p.preco_custo.toFixed(2)}</td>
                    <td>R$ ${p.preco_venda.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-secondary btn-delete-product" data-prod-id="${p.id}" style="padding:4px 8px; font-size:11px; background:rgba(239,68,68,0.1); color:#ef4444;">
                            <i class="fas fa-trash-alt"></i> Excluir
                        </button>
                    </td>
                `;
                // Ao clicar na linha (mas não no botão de excluir), preenche o formulário
                tr.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-delete-product')) return;
                    
                    document.getElementById('prod-edit-id').value = p.id;
                    document.getElementById('prod-nome').value = p.nome;
                    document.getElementById('prod-custo').value = p.preco_custo.toFixed(2);
                    document.getElementById('prod-venda').value = p.preco_venda.toFixed(2);
                    
                    const btnSave = document.getElementById('btn-save-product');
                    const btnCancel = document.getElementById('btn-cancel-product');
                    if (btnSave) btnSave.innerHTML = '<i class="fas fa-save"></i> Atualizar Produto';
                    if (btnCancel) btnCancel.style.display = 'inline-block';
                });
                
                productsTbody.appendChild(tr);
            });

            // Delete buttons
            productsTbody.querySelectorAll('.btn-delete-product').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pId = btn.getAttribute('data-prod-id');
                    if (confirm('Tem certeza que deseja excluir este produto? Esta ação é irreversível.')) {
                        const idx = DB.produtos.findIndex(p => p.id === pId);
                        if (idx !== -1) {
                            DB.produtos.splice(idx, 1);
                            logSQL(`DELETE FROM produtos WHERE id = '${pId}';`, 'query');
                            refreshAllUI();
                        }
                    }
                });
            });
        }

        
        DB.produto_variantes.forEach(variant => {
            const product = DB.produtos.find(p => p.id === variant.produto_id);
            const tr = document.createElement('tr');
            
            // Stock Alert
            let stockBadge = `<span class="badge badge-success">${variant.estoque_atual} un</span>`;
            if (variant.estoque_atual === 0) {
                stockBadge = `<span class="badge badge-danger">ESGOTADO</span>`;
            } else if (variant.estoque_atual <= 5) {
                stockBadge = `<span class="badge badge-warning">Estoque Baixo (${variant.estoque_atual})</span>`;
            }

            tr.innerHTML = `
                <td><b>${product.nome}</b></td>
                <td><span class="badge badge-secondary" style="font-size:12px;">${variant.tamanho}</span></td>
                <td>R$ ${product.preco_custo.toFixed(2)}</td>
                <td>R$ ${product.preco_venda.toFixed(2)}</td>
                <td>${stockBadge}</td>
            `;
            inventoryTbody.appendChild(tr);
        });

        // Populate dropdowns in distribution form
        const productSelect = document.getElementById('dist-product-select');
        productSelect.innerHTML = '<option value="">Selecione...</option>';
        DB.produtos.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.nome;
            productSelect.appendChild(opt);
        });

        // Populate size variants based on selected product
        const sizeSelect = document.getElementById('dist-size-select');
        productSelect.addEventListener('change', () => {
            const pId = productSelect.value;
            sizeSelect.innerHTML = '<option value="">Selecione...</option>';
            if (!pId) return;

            const variants = DB.produto_variantes.filter(pv => pv.produto_id === pId);
            variants.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = `${v.tamanho} (Disponível: ${v.estoque_atual})`;
                sizeSelect.appendChild(opt);
            });
        });
    }

    // Event Handler: Sell / Distribute variant (tests RN-PROD-01 stocks Check)
    document.getElementById('btn-distribute-product').addEventListener('click', () => {
        const variantId = document.getElementById('dist-size-select').value;
        const quant = parseInt(document.getElementById('dist-qty').value) || 0;
        const buyer = document.getElementById('dist-buyer').value;

        if (!variantId || quant <= 0 || !buyer) {
            alert('Preencha os dados de distribuição corretamente.');
            return;
        }

        // Simula a venda/decremento de estoque (Delta negativo)
        const isSuccess = DB_Engine.mutateProductStock(variantId, -quant);
        
        if (isSuccess) {
            const variant = DB.produto_variantes.find(v => v.id === variantId);
            const product = DB.produtos.find(p => p.id === variant.produto_id);
            const totalVal = product.preco_venda * quant;
            
            // Injeta o lançamento financeiro automático correspondente à venda
            const finId = 'lf_' + Date.now();
            DB.lancamentos_financeiros.push({
                id: finId,
                tipo: 'Entrada',
                categoria: `Venda ${product.nome} (Qtd: ${quant})`,
                valor: totalVal,
                data_competencia: new Date().toISOString().split('T')[0],
                status_conciliacao: false,
                evento_id: null,
                produto_id: product.id
            });
            logSQL(`Venda registrada! Entrada de R$ ${totalVal.toFixed(2)} inserida no caixa do produto '${product.nome}' (Variant size: ${variant.tamanho}).`, 'success');
            
            document.getElementById('dist-qty').value = '1';
            document.getElementById('dist-buyer').value = '';
            refreshAllUI();
        }
    });

    // Event Handler: Form Manage Product
    const formManageProduct = document.getElementById('form-manage-product');
    const btnCancelProduct = document.getElementById('btn-cancel-product');

    if (formManageProduct) {
        formManageProduct.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('prod-edit-id').value;
            const nome = document.getElementById('prod-nome').value;
            const custo = parseFloat(document.getElementById('prod-custo').value) || 0;
            const venda = parseFloat(document.getElementById('prod-venda').value) || 0;

            if (id) {
                // Update
                const prod = DB.produtos.find(p => p.id === id);
                if (prod) {
                    prod.nome = nome;
                    prod.preco_custo = custo;
                    prod.preco_venda = venda;
                    logSQL(`UPDATE produtos SET nome='${nome}', preco_custo=${custo}, preco_venda=${venda} WHERE id='${id}';`, 'query');
                }
            } else {
                // Insert
                const newId = 'p_' + Date.now();
                DB.produtos.push({
                    id: newId,
                    nome: nome,
                    preco_custo: custo,
                    preco_venda: venda
                });
                logSQL(`INSERT INTO produtos (nome, preco_custo, preco_venda) VALUES ('${nome}', ${custo}, ${venda});`, 'query');
            }

            formManageProduct.reset();
            document.getElementById('prod-edit-id').value = '';
            document.getElementById('btn-save-product').innerHTML = '<i class="fas fa-save"></i> Salvar Produto';
            if (btnCancelProduct) btnCancelProduct.style.display = 'none';
            refreshAllUI();
        });
    }

    if (btnCancelProduct) {
        btnCancelProduct.addEventListener('click', () => {
            if (formManageProduct) formManageProduct.reset();
            document.getElementById('prod-edit-id').value = '';
            document.getElementById('btn-save-product').innerHTML = '<i class="fas fa-save"></i> Salvar Produto';
            btnCancelProduct.style.display = 'none';
        });
    }

    // RENDER 4: SPORTS & ATHLETES (Fase 4)
    function renderSportsModule() {
        // Modalidades list
        const modalitiesTbody = document.querySelector('#modalities-table tbody');
        if (modalitiesTbody) {
            modalitiesTbody.innerHTML = '';
            DB.modalidades.forEach(mod => {
                const manager = DB.usuarios.find(u => u.id === mod.coordenador_id);
                const countAthletes = DB.atletas.filter(a => a.modalidade_id === mod.id).length;
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>${mod.nome}</b></td>
                    <td><span class="badge badge-secondary">${mod.categoria || 'Coletivo'}</span></td>
                    <td>${manager ? manager.nome : 'Nenhum'}</td>
                    <td><span class="badge badge-secondary">${countAthletes} atletas</span></td>
                    <td>
                        <button class="btn btn-secondary btn-delete-mod" data-mod-id="${mod.id}" style="padding:4px 8px; font-size:11px; background:var(--danger-glow); color:var(--danger);">
                            <i class="fas fa-trash-alt"></i> Excluir
                        </button>
                    </td>
                `;
                modalitiesTbody.appendChild(tr);
            });

            // Modality Delete button listeners
            document.querySelectorAll('.btn-delete-mod').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modId = btn.getAttribute('data-mod-id');
                    if (confirm('Tem certeza que deseja excluir esta modalidade? Esta ação é irreversível. Todos os atletas e escalações dela também serão excluídos.')) {
                        DB_Engine.deleteModalidade(modId);
                    }
                });
            });
        }

        // Athlete rows
        const athletesTbody = document.querySelector('#athletes-table tbody');
        if (athletesTbody) {
            athletesTbody.innerHTML = '';
            DB.atletas.forEach(athlete => {
                const mod = DB.modalidades.find(m => m.id === athlete.modalidade_id);
                const tr = document.createElement('tr');
                
                let statusBadge = '';
                if (athlete.status_documentacao === 'Aprovado') {
                    statusBadge = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Aprovado (Elegível)</span>`;
                } else if (athlete.status_documentacao === 'Rejeitado') {
                    statusBadge = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Rejeitado (Impedido)</span>`;
                } else {
                    statusBadge = `<span class="badge badge-warning"><i class="fas fa-clock"></i> Pendente</span>`;
                }

                tr.innerHTML = `
                    <td><b>${athlete.nome}</b></td>
                    <td><code>${athlete.ra_matricula}</code></td>
                    <td><span class="badge badge-secondary">${mod ? mod.nome : '—'}</span></td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="btn btn-secondary btn-approve-doc" data-ath-id="${athlete.id}" style="padding:4px 8px; font-size:11px; background:var(--success-glow); color:var(--success);">
                                Validar
                            </button>
                            <button class="btn btn-secondary btn-reject-doc" data-ath-id="${athlete.id}" style="padding:4px 8px; font-size:11px; background:var(--danger-glow); color:var(--danger);">
                                Reprovar
                            </button>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-secondary btn-delete-athlete" data-ath-id="${athlete.id}" style="padding:4px 8px; font-size:11px; background:var(--danger-glow); color:var(--danger);">
                            <i class="fas fa-trash-alt"></i> Excluir
                        </button>
                    </td>
                `;
                athletesTbody.appendChild(tr);
            });

            // Doc approval button click listeners (tests RN-ESP-01)
            document.querySelectorAll('.btn-approve-doc').forEach(btn => {
                btn.addEventListener('click', () => {
                    const athId = btn.getAttribute('data-ath-id');
                    DB_Engine.updateAthleteDocStatus(athId, 'Aprovado');
                });
            });

            document.querySelectorAll('.btn-reject-doc').forEach(btn => {
                btn.addEventListener('click', () => {
                    const athId = btn.getAttribute('data-ath-id');
                    DB_Engine.updateAthleteDocStatus(athId, 'Rejeitado');
                });
            });

            // Athlete Delete button listeners
            document.querySelectorAll('.btn-delete-athlete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const athId = btn.getAttribute('data-ath-id');
                    if (confirm('Deseja realmente excluir este atleta? Esta ação é irreversível.')) {
                        DB_Engine.deleteAtleta(athId);
                    }
                });
            });
        }

        // Modalidade select list in athlete enrollment form
        const modSelect = document.getElementById('enroll-mod-select');
        if (modSelect) {
            modSelect.innerHTML = '<option value="">Selecione...</option>';
            DB.modalidades.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.innerText = m.nome;
                modSelect.appendChild(opt);
            });
        }

        // Populate coordinators list in modality creation form
        const coordSelect = document.getElementById('mod-coordenador');
        if (coordSelect) {
            coordSelect.innerHTML = '<option value="">Selecione...</option>';
            DB.usuarios.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = `${u.nome} (${u.cargo} / ${u.diretoria})`;
                coordSelect.appendChild(opt);
            });
        }

        // --- ROSTER BUILDER RENDERING ---
        renderRosterBuilder();
    }

    // --- FUNCTION: RENDER ROSTER BUILDER ---
    function renderRosterBuilder() {
        const rosterEvtSelect = document.getElementById('roster-evento-select');
        const rosterModSelect = document.getElementById('roster-mod-select');
        if (!rosterEvtSelect || !rosterModSelect) return;

        // Populate event selector (Aprovado + tipo === Competição)
        if (!rosterEvtSelect.dataset.populated) {
            rosterEvtSelect.innerHTML = '<option value="">Selecione um Evento...</option>';
            const compEvents = DB.eventos.filter(e => e.status_aprovacao === 'Aprovado' && e.tipo === 'Competição');
            compEvents.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.innerText = e.nome;
                rosterEvtSelect.appendChild(opt);
            });
            rosterEvtSelect.dataset.populated = 'true';
        }

        // Populate modality selector
        if (!rosterModSelect.dataset.populated) {
            rosterModSelect.innerHTML = '<option value="">Selecione uma Modalidade...</option>';
            DB.modalidades.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.innerText = m.nome;
                rosterModSelect.appendChild(opt);
            });
            rosterModSelect.dataset.populated = 'true';
        }

        // Listeners for changes in selections
        if (!rosterEvtSelect.dataset.listener) {
            rosterEvtSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (selectedSportsEventId !== val) {
                    selectedSportsEventId = val;
                    pendingRoster = []; // Clear pending list
                    renderRosterBuilder();
                }
            });
            rosterEvtSelect.dataset.listener = 'true';
        }

        if (!rosterModSelect.dataset.listener) {
            rosterModSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (selectedSportsModalityId !== val) {
                    selectedSportsModalityId = val;
                    pendingRoster = []; // Clear pending list
                    renderRosterBuilder();
                }
            });
            rosterModSelect.dataset.listener = 'true';
        }

        const rosterInterface = document.getElementById('roster-builder-interface');
        const rosterNoSelection = document.getElementById('roster-no-selection');
        const rosterSavedContainer = document.getElementById('roster-saved-container');

        if (!selectedSportsEventId || !selectedSportsModalityId) {
            if (rosterInterface) rosterInterface.style.display = 'none';
            if (rosterSavedContainer) rosterSavedContainer.style.display = 'none';
            if (rosterNoSelection) rosterNoSelection.style.display = 'block';
            return;
        }

        if (rosterInterface) rosterInterface.style.display = 'block';
        if (rosterNoSelection) rosterNoSelection.style.display = 'none';

        // Load existing saved roster into pendingRoster if pendingRoster is empty
        const savedEscalacoes = DB.escalacoes.filter(esc => esc.evento_id === selectedSportsEventId && esc.modalidade_id === selectedSportsModalityId);
        if (pendingRoster.length === 0 && savedEscalacoes.length > 0) {
            savedEscalacoes.forEach(esc => {
                pendingRoster.push({
                    atleta_id: esc.atleta_id,
                    funcao: esc.funcao,
                    observacao: esc.observacao
                });
            });
        }

        // 1. Render Available Athletes (filtered by modality)
        const availableDiv = document.getElementById('roster-available-athletes');
        if (availableDiv) {
            availableDiv.innerHTML = '';
            const modalityAthletes = DB.atletas.filter(a => a.modalidade_id === selectedSportsModalityId);
            
            if (modalityAthletes.length === 0) {
                availableDiv.innerHTML = '<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding:10px;">Nenhum atleta inscrito nesta modalidade.</p>';
            } else {
                modalityAthletes.forEach(ath => {
                    const isIncluded = pendingRoster.some(item => item.atleta_id === ath.id);
                    const card = document.createElement('div');
                    card.className = 'glass-card-item';
                    card.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); border:1px solid var(--border-glass);';
                    
                    let badge = '';
                    let disabled = false;
                    if (ath.status_documentacao === 'Aprovado') {
                        badge = '<span class="badge badge-success" style="font-size:10px;">🟢 Apto</span>';
                    } else if (ath.status_documentacao === 'Rejeitado') {
                        badge = '<span class="badge badge-danger" style="font-size:10px;">🔴 Reprovado</span>';
                        disabled = true;
                    } else {
                        badge = '<span class="badge badge-warning" style="font-size:10px;">🟡 Pendente</span>';
                        disabled = true;
                    }

                    card.innerHTML = `
                        <div>
                            <div style="font-size:12px; font-weight:bold;">${ath.nome}</div>
                            <div style="font-size:10px; color:var(--text-secondary);">RA: ${ath.ra_matricula} | ${badge}</div>
                        </div>
                        <div>
                            ${isIncluded ? `
                                <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" disabled>
                                    Incluído
                                </button>
                            ` : `
                                <button class="btn btn-accent btn-include-athlete" data-ath-id="${ath.id}" style="padding:4px 8px; font-size:11px;" ${disabled ? 'disabled' : ''}>
                                    <i class="fas fa-plus"></i> Incluir
                                </button>
                            `}
                        </div>
                    `;
                    availableDiv.appendChild(card);
                });

                // Include athlete click listeners
                availableDiv.querySelectorAll('.btn-include-athlete').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const athId = btn.getAttribute('data-ath-id');
                        pendingRoster.push({
                            atleta_id: athId,
                            funcao: 'Titular',
                            observacao: ''
                        });
                        renderRosterBuilder();
                    });
                });
            }
        }

        // 2. Render Roster (pending selection)
        const currentDiv = document.getElementById('roster-current-athletes');
        if (currentDiv) {
            currentDiv.innerHTML = '';
            if (pendingRoster.length === 0) {
                currentDiv.innerHTML = '<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding:10px;">Nenhum atleta incluído nesta escalação ainda.</p>';
            } else {
                pendingRoster.forEach((item, index) => {
                    const ath = DB.atletas.find(a => a.id === item.atleta_id);
                    if (!ath) return;

                    const row = document.createElement('div');
                    row.className = 'glass-card-item';
                    row.style.cssText = 'display:flex; flex-direction:column; gap:8px; padding:12px; background:rgba(255,255,255,0.03); border-radius:var(--radius-sm); border:1px solid var(--border-glass);';
                    
                    row.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span style="font-size:12px; font-weight:bold; color:var(--accent);">${ath.nome}</span>
                                <span style="font-size:10px; color:var(--text-secondary);"> (${ath.ra_matricula})</span>
                            </div>
                            <button class="btn btn-secondary btn-remove-roster" data-index="${index}" style="padding:2px 6px; font-size:10px; background:rgba(239,68,68,0.1); color:#ef4444;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="form-grid" style="grid-template-columns:1fr 1.5fr; gap:8px; margin-top:4px;">
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:10px; margin-bottom:2px;">Função</label>
                                <select class="form-control roster-funcao-select" data-index="${index}" style="font-size:11px; padding:4px 8px; height:auto;">
                                    <option value="Titular" ${item.funcao === 'Titular' ? 'selected' : ''}>Titular</option>
                                    <option value="Reserva" ${item.funcao === 'Reserva' ? 'selected' : ''}>Reserva</option>
                                    <option value="Capitão" ${item.funcao === 'Capitão' ? 'selected' : ''}>Capitão</option>
                                    <option value="Staff Técnico" ${item.funcao === 'Staff Técnico' ? 'selected' : ''}>Staff Técnico</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:10px; margin-bottom:2px;">Observação</label>
                                <input type="text" class="form-control roster-obs-input" data-index="${index}" value="${item.observacao || ''}" placeholder="Ex: Camisa 10 / lesão recente..." style="font-size:11px; padding:4px 8px; height:auto;">
                            </div>
                        </div>
                    `;
                    currentDiv.appendChild(row);
                });

                // Bind remove buttons
                currentDiv.querySelectorAll('.btn-remove-roster').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const index = parseInt(btn.getAttribute('data-index'));
                        pendingRoster.splice(index, 1);
                        renderRosterBuilder();
                    });
                });

                // Bind change in function select
                currentDiv.querySelectorAll('.roster-funcao-select').forEach(select => {
                    select.addEventListener('change', (e) => {
                        const idx = parseInt(select.getAttribute('data-index'));
                        pendingRoster[idx].funcao = e.target.value;
                    });
                });

                // Bind change in observation input
                currentDiv.querySelectorAll('.roster-obs-input').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const idx = parseInt(input.getAttribute('data-index'));
                        pendingRoster[idx].observacao = e.target.value;
                    });
                });
            }
        }

        // 3. Render Saved Roster Table
        if (savedEscalacoes.length > 0) {
            if (rosterSavedContainer) rosterSavedContainer.style.display = 'block';
            const tbody = document.querySelector('#roster-saved-table tbody');
            if (tbody) {
                tbody.innerHTML = '';
                savedEscalacoes.forEach(esc => {
                    const ath = DB.atletas.find(a => a.id === esc.atleta_id);
                    const mod = DB.modalidades.find(m => m.id === esc.modalidade_id);
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><b>${ath ? ath.nome : '—'}</b></td>
                        <td><code>${ath ? ath.ra_matricula : '—'}</code></td>
                        <td><span class="badge badge-secondary">${mod ? mod.nome : '—'}</span></td>
                        <td><span class="badge badge-accent">${esc.funcao}</span></td>
                        <td>${esc.observacao || '<span style="color:var(--text-muted);">—</span>'}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } else {
            if (rosterSavedContainer) rosterSavedContainer.style.display = 'none';
        }
    }

    // --- EVENT LISTENERS SPORTS MODULE ---
    
    // Handler: Create Modality Form
    const formCreateModality = document.getElementById('form-create-modality');
    if (formCreateModality) {
        formCreateModality.addEventListener('submit', (e) => {
            e.preventDefault();
            const nome = document.getElementById('mod-nome').value;
            const coordId = document.getElementById('mod-coordenador').value;
            const categoria = document.getElementById('mod-categoria').value;
            
            // Create a custom insertion to include the category!
            logSQL(`INSERT INTO modalidades (nome, coordenador_id, categoria) VALUES ('${nome}', '${coordId}', '${categoria}');`, 'query');
            const newId = 'm_' + Date.now();
            DB.modalidades.push({ id: newId, nome: nome, coordenador_id: coordId || null, categoria: categoria });
            logSQL(`Modalidade '${nome}' de categoria '${categoria}' cadastrada com sucesso.`, 'success');
            
            // Reset fields
            document.getElementById('mod-nome').value = '';
            document.getElementById('mod-coordenador').value = '';
            
            // Rebuild selects that depend on modalities
            const rosterModSelect = document.getElementById('roster-mod-select');
            if (rosterModSelect) rosterModSelect.removeAttribute('data-populated');
            const enrollModSelect = document.getElementById('enroll-mod-select');
            if (enrollModSelect) enrollModSelect.removeAttribute('data-populated');
            
            refreshAllUI();
        });
    }

    // Handler: Register Athlete
    const btnEnrollAthlete = document.getElementById('btn-enroll-athlete');
    if (btnEnrollAthlete) {
        // Remove old listener if double defined or just replace
        btnEnrollAthlete.replaceWith(btnEnrollAthlete.cloneNode(true));
        document.getElementById('btn-enroll-athlete').addEventListener('click', () => {
            const name = document.getElementById('enroll-name').value;
            const ra = document.getElementById('enroll-ra').value;
            const modId = document.getElementById('enroll-mod-select').value;

            if (!name || !ra || !modId) {
                alert('Preencha todos os campos do cadastro do atleta!');
                return;
            }

            const newId = 'a_' + Date.now();
            DB.atletas.push({
                id: newId,
                nome: name,
                ra_matricula: ra,
                modalidade_id: modId,
                status_documentacao: 'Pendente' // Default is pending for Juridico approval
            });

            logSQL(`INSERT INTO atletas (nome, ra_matricula, modalidade_id, status_documentacao) VALUES ('${name}', '${ra}', '${modId}', 'Pendente');`, 'query');
            logSQL(`Atleta cadastrado com sucesso. Status inicial da documentação: 'Pendente'. Requer análise jurídica para homologação de elegibilidade desportiva (RN-ESP-01).`, 'success');

            document.getElementById('enroll-name').value = '';
            document.getElementById('enroll-ra').value = '';
            refreshAllUI();
        });
    }

    // Handler: Clear Roster
    const btnClearRoster = document.getElementById('btn-clear-roster');
    if (btnClearRoster) {
        btnClearRoster.addEventListener('click', () => {
            pendingRoster = [];
            renderRosterBuilder();
            logSQL('Escalação pendente limpa.', 'success');
        });
    }

    // Handler: Save Roster
    const btnSaveRoster = document.getElementById('btn-save-roster');
    if (btnSaveRoster) {
        btnSaveRoster.addEventListener('click', () => {
            if (!selectedSportsEventId || !selectedSportsModalityId) return;
            if (pendingRoster.length === 0) {
                if (!confirm('Deseja salvar a escalação vazia?')) return;
            }
            DB_Engine.saveEscalacao(selectedSportsEventId, selectedSportsModalityId, pendingRoster);
        });
    }

    // RENDER 5: TREASURY (FINANCE MODULE)
    function renderFinanceModule() {
        const financeTbody = document.querySelector('#ledger-table tbody');
        if (financeTbody) {
            financeTbody.innerHTML = '';
            
            let netInflow = 0;
            let netOutflow = 0;

            DB.lancamentos_financeiros.forEach(record => {
                const tr = document.createElement('tr');
                
                if (record.tipo === 'Entrada') netInflow += record.valor;
                else netOutflow += record.valor;

                tr.innerHTML = `
                    <td><code>${record.id}</code></td>
                    <td>${record.data_competencia}</td>
                    <td>
                        <span class="badge ${record.tipo === 'Entrada' ? 'badge-success' : 'badge-danger'}">
                            ${record.tipo}
                        </span>
                    </td>
                    <td><b>${record.categoria}</b></td>
                    <td>R$ ${record.valor.toFixed(2)}</td>
                    <td>
                        <span class="badge ${record.status_conciliacao ? 'badge-success' : 'badge-secondary'}">
                            ${record.status_conciliacao ? '<i class="fas fa-lock"></i> Conciliado' : '<i class="fas fa-clock"></i> Pendente'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            ${!record.status_conciliacao ? `
                                <button class="btn btn-secondary btn-reconcile" data-lf-id="${record.id}" style="padding:4px 8px; font-size:11px; background:var(--accent-glow); color:var(--accent);">
                                    Conciliar
                                </button>
                            ` : `
                                <button class="btn btn-secondary btn-estorno-row" data-lf-id="${record.id}" style="padding:4px 8px; font-size:11px; border-color:var(--danger); color:var(--danger);">
                                    Estornar
                                </button>
                            `}
                            <button class="btn btn-secondary btn-delete-lf" data-lf-id="${record.id}" style="padding:4px 8px; font-size:11px;">
                                Excluir
                            </button>
                        </div>
                    </td>
                `;
                financeTbody.appendChild(tr);
            });

            // Balance Summary Cards update
            const netTotal = netInflow - netOutflow;
            document.getElementById('ledger-inflow').innerText = `R$ ${netInflow.toFixed(2)}`;
            document.getElementById('ledger-outflow').innerText = `R$ ${netOutflow.toFixed(2)}`;
            document.getElementById('ledger-total').innerText = `R$ ${netTotal.toFixed(2)}`;
            
            if (netTotal < 0) {
                document.getElementById('ledger-total').className = 'badge badge-danger';
            } else {
                document.getElementById('ledger-total').className = 'badge badge-success';
            }

            // Reconcile trigger button click (renders record imutável)
            document.querySelectorAll('.btn-reconcile').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lfId = btn.getAttribute('data-lf-id');
                    DB_Engine.mutateFinanceRecord(lfId, 'update', { status_conciliacao: true });
                });
            });

            // Inline Estornar trigger button click
            document.querySelectorAll('.btn-estorno-row').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lfId = btn.getAttribute('data-lf-id');
                    if (confirm(`Tem certeza de que deseja realizar o estorno automático para o lançamento conciliado '${lfId}'? Isso gerará uma transação oposta de compensação.`)) {
                        performEstorno(lfId);
                    }
                });
            });

            // Delete record button click (tests RN-FIN-01 lock)
            document.querySelectorAll('.btn-delete-lf').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lfId = btn.getAttribute('data-lf-id');
                    if (confirm('Tem certeza de que deseja excluir este lançamento financeiro? Esta ação é irreversível.')) {
                        DB_Engine.mutateFinanceRecord(lfId, 'delete');
                    }
                });
            });
        }

        // Render phase 4 event participants section
        renderEventParticipants();
    }

    // --- FUNCTION: RENDER EVENT PARTICIPANTS (Fase 4) ---
    function renderEventParticipants() {
        const finEvtSelect = document.getElementById('fin-evento-select');
        const filterSelect = document.getElementById('part-filter-select');
        if (!finEvtSelect) return;

        // Populate event select with approved Social/Misto events
        const prevSelectValue = selectedFinanceEventId;
        finEvtSelect.innerHTML = '<option value="">Selecione um Evento...</option>';
        
        const eligibleEvents = DB.eventos.filter(e => e.status_aprovacao === 'Aprovado' && (e.tipo === 'Social' || e.tipo === 'Misto'));
        eligibleEvents.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.innerText = `${e.nome} (${e.tipo})`;
            finEvtSelect.appendChild(opt);
        });

        if (prevSelectValue && eligibleEvents.some(e => e.id === prevSelectValue)) {
            finEvtSelect.value = prevSelectValue;
            selectedFinanceEventId = prevSelectValue;
        } else {
            finEvtSelect.value = '';
            selectedFinanceEventId = '';
        }

        // Setup event listener once
        if (!finEvtSelect.dataset.listener) {
            finEvtSelect.addEventListener('change', (e) => {
                selectedFinanceEventId = e.target.value;
                const event = DB.eventos.find(evt => evt.id === selectedFinanceEventId);
                const partValInput = document.getElementById('part-valor');
                if (event && partValInput) {
                    partValInput.value = event.valor_taxa_base.toFixed(2);
                }
                renderEventParticipants();
            });
            finEvtSelect.dataset.listener = 'true';
        }

        if (filterSelect && !filterSelect.dataset.listener) {
            filterSelect.addEventListener('change', () => {
                renderEventParticipants();
            });
            filterSelect.dataset.listener = 'true';
        }

        const interfaceDiv = document.getElementById('fin-participants-interface');
        const placeholderDiv = document.getElementById('fin-participants-no-selection');

        if (!selectedFinanceEventId) {
            if (interfaceDiv) interfaceDiv.style.display = 'none';
            if (placeholderDiv) placeholderDiv.style.display = 'block';
            return;
        }

        if (interfaceDiv) interfaceDiv.style.display = 'block';
        if (placeholderDiv) placeholderDiv.style.display = 'none';

        const event = DB.eventos.find(e => e.id === selectedFinanceEventId);

        // Fetch participants for this event
        const allPart = DB.participantes_evento.filter(p => p.evento_id === selectedFinanceEventId);
        
        // Calculate KPIs
        const totalCount = allPart.length;
        const totalPaid = allPart.filter(p => p.status_pagamento === 'Pago').reduce((sum, p) => sum + p.valor_cobrado, 0);
        const totalPending = allPart.filter(p => p.status_pagamento === 'Pendente').reduce((sum, p) => sum + p.valor_cobrado, 0);
        const netProfit = totalPaid - event.orcamento_previsto;

        document.getElementById('evt-kpi-total-part').innerText = totalCount;
        document.getElementById('evt-kpi-arrecadado').innerText = `R$ ${totalPaid.toFixed(2)}`;
        document.getElementById('evt-kpi-a-receber').innerText = `R$ ${totalPending.toFixed(2)}`;
        
        const netProfitEl = document.getElementById('evt-kpi-liquido');
        netProfitEl.innerText = `R$ ${netProfit.toFixed(2)}`;
        if (netProfit < 0) {
            netProfitEl.style.color = '#ef4444';
        } else {
            netProfitEl.style.color = '#10b981';
        }

        // Render table
        const tbody = document.querySelector('#fin-part-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            
            const filterVal = filterSelect ? filterSelect.value : 'Todos';
            const filteredPart = allPart.filter(p => {
                if (filterVal === 'Todos') return true;
                return p.status_pagamento === filterVal;
            });

            if (filteredPart.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Nenhum participante correspondente a este filtro.</td></tr>';
            } else {
                filteredPart.forEach(part => {
                    const tr = document.createElement('tr');
                    
                    let statusBadge = '';
                    if (part.status_pagamento === 'Pago') {
                        statusBadge = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Pago</span>`;
                    } else if (part.status_pagamento === 'Isento') {
                        statusBadge = `<span class="badge badge-secondary"><i class="fas fa-gift"></i> Isento</span>`;
                    } else {
                        statusBadge = `<span class="badge badge-warning"><i class="fas fa-clock"></i> Pendente</span>`;
                    }

                    tr.innerHTML = `
                        <td>
                            <b>${part.nome}</b>
                            ${part.ra_matricula ? `<br><code style="font-size:10px; color:var(--text-secondary);">${part.ra_matricula}</code>` : ''}
                        </td>
                        <td>
                            R$ ${part.valor_cobrado.toFixed(2)}
                            <button class="btn btn-secondary btn-edit-part-price" data-part-id="${part.id}" style="padding: 2px 4px; font-size: 9px; margin-left: 6px;" title="Editar Valor">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            ${part.obs ? `<br><span style="font-size: 10px; color: var(--text-secondary); font-style: italic;">Obs: ${part.obs}</span>` : ''}
                        </td>
                        <td>${statusBadge}</td>
                        <td>${part.forma_pagamento || '<span style="color:var(--text-muted);">—</span>'}</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                ${part.status_pagamento === 'Pendente' ? `
                                    <button class="btn btn-secondary btn-pay-part" data-part-id="${part.id}" style="padding:4px 8px; font-size:11px; background:var(--success-glow); color:var(--success);">
                                        Confirmar Pago
                                    </button>
                                    <button class="btn btn-secondary btn-exempt-part" data-part-id="${part.id}" style="padding:4px 8px; font-size:11px;">
                                        Isentar
                                    </button>
                                ` : `
                                    <button class="btn btn-secondary btn-pend-part" data-part-id="${part.id}" style="padding:4px 8px; font-size:11px; background:var(--danger-glow); color:var(--danger);">
                                        Reverter
                                    </button>
                                `}
                                <button class="btn btn-secondary btn-delete-part" data-part-id="${part.id}" style="padding:4px 8px; font-size:11px; background:rgba(239,68,68,0.1); color:#ef4444;">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Attach button listeners
                tbody.querySelectorAll('.btn-edit-part-price').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-part-id');
                        const pObj = DB.participantes_evento.find(p => p.id === id);
                        if (!pObj) return;

                        const newValStr = prompt(`Digite o novo valor cobrado para ${pObj.nome}:`, pObj.valor_cobrado.toFixed(2));
                        if (newValStr === null) return;
                        const newVal = parseFloat(newValStr);
                        if (isNaN(newVal) || newVal < 0) {
                            alert('Valor inválido!');
                            return;
                        }
                        const newObs = prompt('Motivo da alteração de valor (desconto, cortesia, etc.):', pObj.obs || '');
                        DB_Engine.updateParticipanteEventoValor(id, newVal, newObs || '');
                    });
                });

                tbody.querySelectorAll('.btn-pay-part').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-part-id');
                        const forma = prompt('Digite a forma de pagamento (Pix, Dinheiro, Cartão):', 'Pix');
                        if (forma === null) return;
                        DB_Engine.updateParticipanteEventoStatus(id, 'Pago', forma || 'Pix');
                    });
                });

                tbody.querySelectorAll('.btn-exempt-part').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-part-id');
                        DB_Engine.updateParticipanteEventoStatus(id, 'Isento', 'Isento');
                    });
                });

                tbody.querySelectorAll('.btn-pend-part').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-part-id');
                        if (confirm('Deseja realmente reverter este pagamento para Pendente? Lançamentos automáticos no caixa não serão excluídos para manter a conciliação manual.')) {
                            DB_Engine.updateParticipanteEventoStatus(id, 'Pendente', '');
                        }
                    });
                });

                tbody.querySelectorAll('.btn-delete-part').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-part-id');
                        if (confirm('Deseja realmente remover este participante? Esta ação é irreversível.')) {
                            DB_Engine.deleteParticipanteEvento(id);
                        }
                    });
                });
            }
        }
    }

    // Event Handler: Register Participant
    const formAddParticipant = document.getElementById('form-add-participant');
    if (formAddParticipant) {
        formAddParticipant.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!selectedFinanceEventId) {
                alert('Selecione um evento primeiro!');
                return;
            }
            const nome = document.getElementById('part-nome').value;
            const ra = document.getElementById('part-ra').value;
            const valor = parseFloat(document.getElementById('part-valor').value) || 0;
            const status = document.getElementById('part-status').value;
            const forma = document.getElementById('part-forma').value;
            const obs = document.getElementById('part-obs').value;

            DB_Engine.insertParticipanteEvento(selectedFinanceEventId, nome, ra, valor, status, forma, obs);
            
            // Reset input values
            document.getElementById('part-nome').value = '';
            document.getElementById('part-ra').value = '';
            document.getElementById('part-obs').value = '';
            
            // Set value back to default
            const event = DB.eventos.find(evt => evt.id === selectedFinanceEventId);
            if (event) {
                document.getElementById('part-valor').value = event.valor_taxa_base.toFixed(2);
            }
        });
    }

    // Event Handler: Add Lançamento Manual
    document.getElementById('btn-add-finance').addEventListener('click', () => {
        const tipo = document.getElementById('fin-type').value;
        const cat = document.getElementById('fin-category').value;
        const val = parseFloat(document.getElementById('fin-val').value) || 0;
        const date = document.getElementById('fin-date').value || new Date().toISOString().split('T')[0];

        if (!cat || val <= 0) {
            alert('Preencha os campos de categoria e valor corretamente!');
            return;
        }

        const newId = 'lf_' + Date.now();
        DB.lancamentos_financeiros.push({
            id: newId,
            tipo: tipo,
            categoria: cat,
            valor: val,
            data_competencia: date,
            status_conciliacao: false,
            evento_id: null,
            produto_id: null
        });

        logSQL(`INSERT INTO lancamentos_financeiros (tipo, categoria, valor, data_competencia, status_conciliacao) VALUES ('${tipo}', '${cat}', ${val}, '${date}', FALSE);`, 'query');
        logSQL(`Lançamento manual inserido no caixa em estado 'Pendente'.`, 'success');

        document.getElementById('fin-category').value = '';
        document.getElementById('fin-val').value = '';
        refreshAllUI();
    });

    // Função auxiliar para performar o estorno
    function performEstorno(idToEstorno) {
        const record = DB.lancamentos_financeiros.find(r => r.id === idToEstorno);
        if (!record) {
            alert("Lançamento não localizado!");
            return;
        }

        const estornoId = 'lf_' + Date.now();
        const estornoVal = record.valor;
        const estornoTipo = record.tipo === 'Entrada' ? 'Saída' : 'Entrada';
        
        DB.lancamentos_financeiros.push({
            id: estornoId,
            tipo: estornoTipo,
            categoria: `ESTORNO do lançamento [ID: ${record.id}] - ${record.categoria}`,
            valor: estornoVal,
            data_competencia: new Date().toISOString().split('T')[0],
            status_conciliacao: false, // O estorno entra pendente
            evento_id: record.evento_id,
            produto_id: record.produto_id
        });

        logSQL(`INSERT INTO lancamentos_financeiros (tipo, categoria, valor, status_conciliacao) VALUES ('${estornoTipo}', 'ESTORNO [${record.id}]', ${estornoVal}, FALSE);`, 'query');
        logSQL(`Compensação atômica realizada. Estorno injetado com sucesso no caixa geral para anular o lançamento imutável [ID: ${record.id}].`, 'success');
        refreshAllUI();
    }

    // Event Handler: Lançamento de Estorno (Forçando correção manual - RN-FIN-01)
    document.getElementById('btn-estorno-finance').addEventListener('click', () => {
        const idToEstorno = prompt("Digite o nome ou ID do Lançamento Conciliado que deseja estornar (ex: 'lf1'):");
        if (!idToEstorno) return;
        performEstorno(idToEstorno);
    });

    // RENDER 6: PARTNERS & LEGAL (GED Repositories)
    function renderParceriasModule() {
        const partnersList = document.getElementById('partners-list');
        if (!partnersList) return;
        partnersList.innerHTML = '';
        
        DB.parceiros_patrocinadores.forEach(partner => {
            const card = document.createElement('div');
            card.className = 'list-group-item';
            
            let statusBadge = '';
            if (partner.status_funil === 'Contrato Ativo') statusBadge = '<span class="badge badge-success">CONTRATO ATIVO</span>';
            else if (partner.status_funil === 'Arquivado') statusBadge = '<span class="badge badge-secondary">ARQUIVADO</span>';
            else statusBadge = `<span class="badge badge-warning">${partner.status_funil}</span>`;

            const contrato = DB.documentos_contratos.find(d => d.parceiro_id === partner.id && d.tipo_documento === 'Contrato');

            card.innerHTML = `
                <div style="flex-grow:1;">
                    <div class="list-group-item-title">${partner.nome_empresa}</div>
                    <div class="list-group-item-desc">🏷️ Tipo: ${partner.tipo_parceria}</div>
                    <div style="margin-top:8px; display:flex; gap:12px; align-items:center;">
                        ${partner.link_proposta_drive ? `
                        <a href="${partner.link_proposta_drive}" target="_blank" style="font-size:11px; color:var(--primary); text-decoration:none;"><i class="fas fa-external-link-alt"></i> Proposta no Drive</a>
                        ` : ''}
                        ${contrato && contrato.arquivo_url ? `
                        <a href="${contrato.arquivo_url}" target="_blank" style="font-size:11px; color:#22c55e; text-decoration:none;"><i class="fas fa-file-contract"></i> Contrato Assinado</a>
                        ` : ''}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                    ${statusBadge}
                </div>
            `;
            partnersList.appendChild(card);
        });
    }

    const formCreatePartner = document.getElementById('form-create-partner');
    if (formCreatePartner && !formCreatePartner.dataset.listener) {
        formCreatePartner.addEventListener('submit', (e) => {
            e.preventDefault();
            const nome = document.getElementById('partner-nome').value;
            const tipo = document.getElementById('partner-tipo').value;
            const link = document.getElementById('partner-proposta-url').value;
            
            const newId = 'par_' + Date.now();
            DB.parceiros_patrocinadores.push({
                id: newId,
                nome_empresa: nome,
                tipo_parceria: tipo,
                status_funil: 'Aguardando Contrato',
                link_proposta_drive: link
            });
            
            DB.logs_notificacoes.push({
                id: 'log_' + Date.now(),
                usuario_id: currentUser ? currentUser.id : 'u1',
                tipo_notificacao: 'Sistema',
                gatilho_regra: 'NOVA_PARCERIA',
                destinatario_email: 'juridico@atleticalup.com.br',
                status_entrega: 'ENVIADO',
                data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                erro_detalhe: null,
                lida: false
            });
            
            logSQL(`INSERT INTO parceiros_patrocinadores (nome_empresa, tipo_parceria, status_funil, link_proposta_drive) VALUES ('${nome}', '${tipo}', 'Aguardando Contrato', '${link}');`, 'query');
            logSQL(`Notificação disparada para Diretoria Jurídica sobre nova proposta de parceria: ${nome}.`, 'success');
            
            formCreatePartner.reset();
            refreshAllUI();
        });
        formCreatePartner.dataset.listener = 'true';
    }

    function renderLegalModule() {
        const auditoriaTbody = document.querySelector('#auditoria-parcerias-table tbody');
        if (auditoriaTbody) {
            auditoriaTbody.innerHTML = '';
            
            const parceriasAguardando = DB.parceiros_patrocinadores.filter(p => p.status_funil !== 'Contrato Ativo' && p.status_funil !== 'Encerrado');
            
            if (parceriasAguardando.length === 0) {
                auditoriaTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Nenhuma parceria pendente de contrato no momento.</td></tr>';
            } else {
                parceriasAguardando.forEach(partner => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><b>${partner.nome_empresa}</b></td>
                        <td>${partner.tipo_parceria}</td>
                        <td>
                            ${partner.link_proposta_drive ? `
                            <a href="${partner.link_proposta_drive}" target="_blank" style="color:var(--primary); text-decoration:none;">
                                <i class="fas fa-file-alt"></i> Visualizar Proposta
                            </a>
                            ` : `<span style="color:var(--text-muted);">S/ Link</span>`}
                        </td>
                        <td><span class="badge badge-warning">${partner.status_funil}</span></td>
                        <td>
                            <button class="btn btn-sm btn-primary btn-detail-partner" data-partner-id="${partner.id}" style="padding: 4px 8px; font-size: 11px;">
                                <i class="fas fa-eye"></i> Detalhes
                            </button>
                        </td>
                    `;
                    auditoriaTbody.appendChild(tr);
                });

                // Attach click listeners to detail buttons
                auditoriaTbody.querySelectorAll('.btn-detail-partner').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-partner-id');
                        openPartnerDetailModal(id);
                    });
                });
            }
        }

        // GED documents table
        const gedTbody = document.querySelector('#ged-table tbody');
        gedTbody.innerHTML = '';
        DB.documentos_contratos.forEach(doc => {
            const partner = DB.parceiros_patrocinadores.find(p => p.id === doc.parceiro_id);
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td><b>${doc.titulo}</b></td>
                <td><span class="badge badge-secondary">${doc.tipo_documento}</span></td>
                <td>${partner ? partner.nome_empresa : 'Geral'}</td>
                <td>
                    ${doc.arquivo_url ? `
                        <a href="${doc.arquivo_url}" target="_blank" style="color:var(--primary); text-decoration:none;">
                            <i class="fas fa-external-link-alt"></i> Visualizar (Google Drive)
                        </a>
                    ` : `
                        <span style="color:var(--danger); font-style:italic;">Sem link anexo</span>
                    `}
                </td>
                <td>${doc.data_vencimento || 'N/A'}</td>
            `;
            gedTbody.appendChild(tr);
        });

        // Populate dropdown in doc upload form
        const partnerSelect = document.getElementById('doc-partner-select');
        partnerSelect.innerHTML = '<option value="">Parceiro Geral...</option>';
        DB.parceiros_patrocinadores.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.nome_empresa;
            partnerSelect.appendChild(opt);
        });
    }

    // PARTNER DETAIL MODAL LOGIC (Jurídico Read/Write)
    function openPartnerDetailModal(partnerId) {
        const partner = DB.parceiros_patrocinadores.find(p => p.id === partnerId);
        if (!partner) return;

        document.getElementById('detail-partner-id').value = partner.id;
        document.getElementById('detail-partner-name').value = partner.nome_empresa;
        document.getElementById('detail-partner-type').value = partner.tipo_parceria;

        const proposalContainer = document.getElementById('detail-partner-proposal-container');
        if (partner.link_proposta_drive) {
            proposalContainer.innerHTML = `
                <a href="${partner.link_proposta_drive}" target="_blank" style="color:var(--primary); text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fas fa-external-link-alt"></i> Visualizar Proposta no Drive
                </a>
            `;
        } else {
            proposalContainer.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Sem link de proposta cadastrado</span>`;
        }

        // Populate status dropdown: excluding Contrato Ativo as per RN-JUR-01
        const statusSelect = document.getElementById('detail-partner-status');
        statusSelect.innerHTML = `
            <option value="Prospecção">Prospecção</option>
            <option value="Negociação">Negociação</option>
            <option value="Aguardando Contrato">Aguardando Contrato</option>
            <option value="Encerrado">Encerrado</option>
            <option value="Arquivado">Arquivado</option>
        `;

        if (partner.status_funil === 'Contrato Ativo') {
            const opt = document.createElement('option');
            opt.value = 'Contrato Ativo';
            opt.textContent = 'Contrato Ativo';
            opt.disabled = true;
            statusSelect.appendChild(opt);
            statusSelect.value = 'Contrato Ativo';
            statusSelect.disabled = true;
        } else {
            statusSelect.value = partner.status_funil;
            statusSelect.disabled = false;
        }

        // Check write permission for mod-legal
        const isWriteable = canWrite('mod-legal');
        const saveBtn = document.getElementById('btn-save-partner-detail');
        if (isWriteable) {
            if (partner.status_funil !== 'Contrato Ativo') {
                statusSelect.disabled = false;
            }
            if (saveBtn) saveBtn.style.display = '';
        } else {
            statusSelect.disabled = true;
            if (saveBtn) saveBtn.style.display = 'none';
        }

        document.getElementById('partner-detail-overlay').classList.add('active');
    }

    function closePartnerDetailModal() {
        document.getElementById('partner-detail-overlay').classList.remove('active');
    }

    // Modal Close Listeners
    const btnCloseDetail = document.getElementById('btn-close-partner-detail');
    if (btnCloseDetail) btnCloseDetail.addEventListener('click', closePartnerDetailModal);

    const btnCancelDetail = document.getElementById('btn-cancel-partner-detail');
    if (btnCancelDetail) btnCancelDetail.addEventListener('click', closePartnerDetailModal);

    // Modal Save Listener
    const btnSaveDetail = document.getElementById('btn-save-partner-detail');
    if (btnSaveDetail && !btnSaveDetail.dataset.listener) {
        btnSaveDetail.addEventListener('click', () => {
            const partnerId = document.getElementById('detail-partner-id').value;
            const newStatus = document.getElementById('detail-partner-status').value;

            const partner = DB.parceiros_patrocinadores.find(p => p.id === partnerId);
            if (!partner) return;

            const oldStatus = partner.status_funil;
            if (oldStatus !== newStatus) {
                partner.status_funil = newStatus;

                // Log SQL Query simulator
                logSQL(`UPDATE parceiros_patrocinadores SET status_funil = '${newStatus}' WHERE id = '${partnerId}';`, 'query');
                logSQL(`Status da parceria '${partner.nome_empresa}' atualizado de '${oldStatus}' para '${newStatus}' pelo Jurídico.`, 'success');

                // Add Notification to logs
                DB.logs_notificacoes.push({
                    id: 'log_' + Date.now(),
                    usuario_id: currentUser ? currentUser.id : 'u5',
                    tipo_notificacao: 'System',
                    gatilho_regra: 'STATUS_PARCERIA_JURIDICO',
                    destinatario_email: 'parcerias@atleticalup.com.br',
                    status_entrega: 'ENVIADO',
                    data_envio: new Date().toISOString().replace('T', ' ').substring(0, 16),
                    erro_detalhe: null,
                    lida: false
                });
            }

            closePartnerDetailModal();
            refreshAllUI();
        });
        btnSaveDetail.dataset.listener = 'true';
    }

    // Event Handler: Upload document link to GED (fixes validation issues for partners - RN-JUR-01)
    const btnAddDoc = document.getElementById('btn-add-document');
    if (btnAddDoc && !btnAddDoc.dataset.listener) {
        btnAddDoc.addEventListener('click', () => {
            const title = document.getElementById('doc-title').value;
            const type = document.getElementById('doc-type').value;
            const url = document.getElementById('doc-url').value;
            const expiry = document.getElementById('doc-expiry').value;
            const partnerId = document.getElementById('doc-partner-select').value;

            if (!title || !url) {
                alert('Preencha os dados do documento (título e URL do Drive são obrigatórios)!');
                return;
            }

            const newId = 'dc_' + Date.now();
            DB.documentos_contratos.push({
                id: newId,
                titulo: title,
                tipo_documento: type,
                arquivo_url: url,
                data_vencimento: expiry || null,
                parceiro_id: partnerId || null
            });

            logSQL(`INSERT INTO documentos_contratos (titulo, tipo_documento, arquivo_url, data_vencimento, parceiro_id) VALUES ('${title}', '${type}', '${url}', '${expiry}', '${partnerId}');`, 'query');
            logSQL(`GED: Arquivo de texto simples anexado com sucesso para auditoria e conciliação jurídica de parceria.`, 'success');
            
            if (type === 'Contrato' && partnerId) {
                const partner = DB.parceiros_patrocinadores.find(p => p.id === partnerId);
                if (partner && partner.status_funil !== 'Contrato Ativo') {
                    partner.status_funil = 'Contrato Ativo';
                    logSQL(`UPDATE parceiros_patrocinadores SET status_funil='Contrato Ativo' WHERE id='${partnerId}';`, 'query');
                    logSQL(`Parceria ${partner.nome_empresa} ativada automaticamente após vínculo do Contrato no GED!`, 'success');
                }
            }

            document.getElementById('doc-title').value = '';
            document.getElementById('doc-url').value = '';
            refreshAllUI();
        });
        btnAddDoc.dataset.listener = 'true';
    }

    // ------------------------------------------------------------------------
    // 4. BOOTSTRAP E RENDERIZADOR TOTAL
    // ------------------------------------------------------------------------

    // RENDER: SUPPLIERS & PURCHASE ORDERS (inside Products module)
    function renderProductsSupplyModule() {
        // -- Tabela de Fornecedores --
        const suppliersTbody = document.querySelector('#suppliers-table tbody');
        if (!suppliersTbody) return;
        suppliersTbody.innerHTML = '';

        const filterSelect = document.getElementById('supplier-filter-select');
        if (filterSelect && !filterSelect.dataset.listener) {
            filterSelect.addEventListener('change', () => {
                renderProductsSupplyModule();
            });
            filterSelect.dataset.listener = 'true';
        }

        const filterVal = filterSelect ? filterSelect.value : 'Todos';
        const filteredSuppliers = DB.fornecedores.filter(f => {
            if (filterVal === 'Todos') return true;
            return f.categoria_servico === filterVal;
        });

        filteredSuppliers.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${f.nome}</b></td>
                <td>${f.tipo_produto}</td>
                <td><span class="badge badge-secondary">${f.categoria_servico || 'Outros'}</span></td>
                <td>${f.contato ? `${f.contato}` : ''} ${f.telefone ? `<br><code style="font-size:11px;">${f.telefone}</code>` : ''}</td>
            `;
            suppliersTbody.appendChild(tr);
        });

        // -- Tabela de Pedidos de Compra --
        const ordersTbody = document.querySelector('#orders-table tbody');
        if (!ordersTbody) return;
        ordersTbody.innerHTML = '';
        DB.pedidos_compra.forEach(pc => {
            const fornecedor = DB.fornecedores.find(f => f.id === pc.fornecedor_id);
            const produto = DB.produtos.find(p => p.id === pc.produto_id);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${produto ? produto.nome : '—'}</b> <span class="badge badge-secondary" style="font-size:11px;">${pc.tamanho}</span></td>
                <td>${pc.quantidade}</td>
                <td>${fornecedor ? fornecedor.nome : '—'}</td>
                <td>${pc.data_previsao || '—'}</td>
                <td>
                    <span class="badge ${pc.status === 'Recebido' ? 'badge-success' : 'badge-warning'}">
                        ${pc.status === 'Recebido' ? '<i class="fas fa-check"></i> Recebido' : '<i class="fas fa-clock"></i> Pendente'}
                    </span>
                </td>
                <td>
                    ${pc.status !== 'Recebido' ? `
                        <button class="btn btn-secondary btn-receive-order" data-pc-id="${pc.id}" style="padding:4px 8px; font-size:11px; background:var(--success-glow); color:var(--success);">
                            <i class="fas fa-box-open"></i> Receber
                        </button>
                    ` : '<span style="font-size:11px; color:var(--text-muted);">Concluído</span>'}
                </td>
            `;
            ordersTbody.appendChild(tr);
        });

        // Receive Order button listeners (simula trigger trg_receber_pedido_compra)
        document.querySelectorAll('.btn-receive-order').forEach(btn => {
            btn.addEventListener('click', () => {
                const pcId = btn.getAttribute('data-pc-id');
                DB_Engine.receberPedidoCompra(pcId);
            });
        });

        // Populate supplier select in order form
        const orderSupplierSelect = document.getElementById('order-supplier-select');
        if (orderSupplierSelect) {
            orderSupplierSelect.innerHTML = '<option value="">Selecione o Fornecedor...</option>';
            DB.fornecedores.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.innerText = f.nome;
                orderSupplierSelect.appendChild(opt);
            });
        }

        // Populate product select in order form
        const orderProductSelect = document.getElementById('order-product-select');
        if (orderProductSelect) {
            orderProductSelect.innerHTML = '<option value="">Selecione o Produto...</option>';
            DB.produtos.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.innerText = p.nome;
                orderProductSelect.appendChild(opt);
            });
        }
    }

    // Event Handler: Create Supplier
    const formCreateSupplier = document.getElementById('form-create-supplier');
    if (formCreateSupplier) {
        formCreateSupplier.addEventListener('submit', (e) => {
            e.preventDefault();
            const ok = DB_Engine.insertFornecedor(
                document.getElementById('sup-nome').value,
                document.getElementById('sup-contato').value,
                document.getElementById('sup-telefone').value,
                document.getElementById('sup-email').value,
                document.getElementById('sup-tipo').value,
                document.getElementById('sup-categoria').value,
                document.getElementById('sup-obs').value
            );
            if (ok) formCreateSupplier.reset();
        });
    }

    // Event Handler: Create Purchase Order
    const formCreateOrder = document.getElementById('form-create-order');
    if (formCreateOrder) {
        formCreateOrder.addEventListener('submit', (e) => {
            e.preventDefault();
            const ok = DB_Engine.insertPedidoCompra(
                document.getElementById('order-supplier-select').value,
                document.getElementById('order-product-select').value,
                document.getElementById('order-size').value,
                parseInt(document.getElementById('order-qty').value) || 0,
                document.getElementById('order-date').value
            );
            if (ok) formCreateOrder.reset();
        });
    }

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-tab');
                if (!targetId) return;
                
                const tabNav = btn.closest('.tab-nav');
                const moduleContainer = tabNav ? tabNav.parentElement : document;
                
                if (tabNav) {
                    tabNav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                }
                
                if (moduleContainer) {
                    moduleContainer.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                }
                
                btn.classList.add('active');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    function setupConnectionBadge() {
        const badge = document.getElementById('connection-status-badge');
        const icon = document.getElementById('conn-icon');
        if (badge && icon) {
            badge.className = 'conn-icon-badge checking-icon';
            icon.className = 'fas fa-circle-notch fa-spin';
            
            setTimeout(() => {
                badge.className = 'conn-icon-badge online-icon';
                icon.className = 'fas fa-check-circle';
            }, 1500);
        }
    }

    function renderNotifications() {
        const notifList = document.getElementById('notifications-list');
        const notifBadge = document.getElementById('notif-badge');
        if (!notifList) return;

        notifList.innerHTML = '';

        const logs = DB.logs_notificacoes.slice().sort((a, b) => b.data_envio.localeCompare(a.data_envio));
        const unreadCount = logs.filter(l => !l.lida).length;

        if (notifBadge) {
            if (unreadCount > 0) {
                notifBadge.style.display = 'flex';
                notifBadge.innerText = unreadCount;
            } else {
                notifBadge.style.display = 'none';
            }
        }

        if (logs.length === 0) {
            notifList.innerHTML = '<div class="notif-empty">Nenhuma notificação no momento.</div>';
            return;
        }

        logs.forEach(log => {
            const isError = log.status_entrega === 'FALHA';
            const isRead = !!log.lida;
            const div = document.createElement('div');
            div.className = `notif-item${isRead ? ' read' : ''}`;

            const gatilhoLabel = {
                'SOLICITACAO_VERBA':    '💸 Solicitação de Verba',
                'ATLETA_BARRADO':       '⚠️ Atleta Irregular',
                'CONTRATO_VENCENDO':    '📄 Contrato Vencendo',
                'TENTATIVA_VIOLACAO':   '🚨 Tentativa de Violação',
                'NOVA_PARCERIA':        '🤝 Nova Parceria',
                'STATUS_PARCERIA_JURIDICO': '📝 Atualização de Parceria'
            }[log.gatilho_regra] || `${log.tipo_notificacao} — ${log.gatilho_regra}`;

            div.innerHTML = `
                <div class="notif-item-header">
                    <span class="notif-item-title">${gatilhoLabel}</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="notif-item-time">${log.data_envio.substring(0, 16)}</span>
                        ${!isRead ? `<button class="btn-mark-notif-read" data-log-id="${log.id}" title="Marcar como lida"><i class="fas fa-check"></i> Lida</button>` : `<span style="font-size:10px;color:var(--text-muted);"><i class="fas fa-check-double"></i></span>`}
                    </div>
                </div>
                <div class="notif-item-detail">Para: ${log.destinatario_email}</div>
                ${log.erro_detalhe ? `<div class="notif-item-detail" style="color:var(--text-secondary);font-size:11px;">${log.erro_detalhe}</div>` : ''}
                <div>
                    <span class="${isError ? 'notif-status-falha' : 'notif-status-enviado'}">
                        ${isError ? '<i class="fas fa-times-circle"></i> FALHA' : '<i class="fas fa-check-circle"></i> ENVIADO'}
                    </span>
                </div>
            `;

            notifList.appendChild(div);
        });

        // Listener: Marcar notificação como lida
        notifList.querySelectorAll('.btn-mark-notif-read').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const logId = btn.getAttribute('data-log-id');
                const logEntry = DB.logs_notificacoes.find(l => l.id === logId);
                if (logEntry) {
                    logEntry.lida = true;
                    logSQL(`UPDATE logs_notificacoes SET lida = TRUE WHERE id = '${logId}'; -- [SIMULADO: campo lida não é auditável]`, 'query');
                    logSQL(`Notificação '${logEntry.gatilho_regra}' marcada como lida pelo usuário '${currentUser ? currentUser.nome : 'Sistema'}'.`, 'success');
                    renderNotifications();
                }
            });
        });
    }

    // Comportamento do Drawer de Notificações
    const btnNotif = document.getElementById('btn-notifications');
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');
    const btnCloseNotif = document.getElementById('btn-close-notifications');

    if (btnNotif && drawer && overlay && btnCloseNotif) {
        btnNotif.addEventListener('click', () => {
            drawer.classList.add('open');
            overlay.classList.add('active');
        });
        
        const closeDrawer = () => {
            drawer.classList.remove('open');
            overlay.classList.remove('active');
        };

        btnCloseNotif.addEventListener('click', closeDrawer);
        overlay.addEventListener('click', closeDrawer);
    }

    function refreshAllUI() {
        // Garante que alertas de contratos vencendo são atualizados em tempo real antes de renderizar
        checkContratoVencendoNotifications();

        renderExecutiveDashboard();
        renderAccessModule();
        renderEventsModule();
        renderMarketingModule();
        renderProductsModule();
        renderProductsSupplyModule();
        renderSportsModule();
        renderFinanceModule();
        renderParceriasModule();
        renderLegalModule();
        renderNotifications();
        
        // Atualiza a reatividade do calendário do dashboard
        renderDashboardCalendar();
    }
// Bind global para comentários contextuais em qualquer módulo
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.ctx-comments-trigger');
      if (!btn || !currentUser) return;

      const entityType = btn.dataset.entityType;
      const entityId   = btn.dataset.entityId;
      const container  = document.getElementById(`ctx-${entityType}-${entityId}`);

      if (container && typeof ChatModule !== 'undefined') {
        const isVisible = container.innerHTML !== '' && container.style.display !== 'none';
        if (isVisible) {
          container.innerHTML = '';
          container.style.display = 'none';
        } else {
          container.style.display = 'block';
          await ChatModule.renderContextualCommentPanel(entityType, entityId, container);
        }
      }
    });

    // Auto-resize do textarea de chat
    document.addEventListener('input', (e) => {
      if (e.target.id === 'chat-input' || e.target.classList.contains('ctx-comment-input')) {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
      }
    });
    // Inicialização da Fase 5 (Abas e Badge)
    setupTabs();
    setupConnectionBadge();

    // Startup system logs (executados uma vez no carregamento)
    logSQL('SGBD Iniciado. PostgreSQL v16.1 (Debian) em x86_64-pc-linux-gnu.', 'success');
    logSQL('Executando scripts do schema.sql...', 'success');
    logSQL('Compilando triggers.sql: 7 Regras de Negócio rigidamente asseguradas na camada de dados.', 'success');

    // --- CRON SIMULADO: CONTRATO_VENCENDO (Dispara ao abrir o painel) ---
    // Simula o job diário que verifica contratos vencendo em 30 dias.
    function checkContratoVencendoNotifications() {
        const hoje = new Date();
        const limite30Dias = new Date(hoje);
        limite30Dias.setDate(hoje.getDate() + 30);

        DB.documentos_contratos.forEach(dc => {
            if (!dc.data_vencimento) return;
            const venc = new Date(dc.data_vencimento);
            const diffDays = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 30) {
                // Gera notificação apenas se ainda não existe uma para este contrato hoje
                const jaNotificado = DB.logs_notificacoes.some(l =>
                    l.gatilho_regra === 'CONTRATO_VENCENDO' &&
                    l.erro_detalhe && l.erro_detalhe.includes(dc.id) &&
                    l.data_envio.startsWith(hoje.toISOString().substring(0, 10))
                );
                if (!jaNotificado) {
                    const parceiro = DB.parceiros_patrocinadores.find(p => p.id === dc.parceiro_id);
                    DB.logs_notificacoes.push({
                        id: 'log_' + Date.now() + '_' + dc.id,
                        usuario_id: 'u1',
                        tipo_notificacao: 'Sistema',
                        gatilho_regra: 'CONTRATO_VENCENDO',
                        destinatario_email: 'presidencia@atleticalup.com.br',
                        status_entrega: 'ENVIADO',
                        data_envio: hoje.toISOString().replace('T', ' ').substring(0, 16),
                        erro_detalhe: `[doc:${dc.id}] Contrato "${dc.titulo}"${parceiro ? ` (${parceiro.nome_empresa})` : ''} vence em ${diffDays} dia(s), em ${dc.data_vencimento}.`,
                        lida: false
                    });
                    logSQL(`CRON CONTRATO_VENCENDO: Alerta gerado para o contrato '${dc.titulo}' (vence em ${diffDays} dia(s)).`, 'trigger');
                }
            }
        });
    }


// ================================================================
// MÓDULO: COMUNICAÇÃO — Chat Interno (Modo Mockup)
// ================================================================

// ── 1. DADOS MOCKUP ─────────────────────────────────────────────
// Estrutura OBRIGATÓRIA: todo objeto deve ter o campo `messages`

function buildChatFromDB() {
    if (!DB.chat_conversations || !window.currentUser) return [];

    // Conversas privadas são filtradas por chat_participants.
    // Conversas de grupo (type === 'Grupo') são visíveis a todos.
    const myConvIds = new Set(
        (DB.chat_participants || [])
            .filter(p => p.user_id === window.currentUser.id)
            .map(p => p.conversation_id)
    );

    const visibleConvs = DB.chat_conversations.filter(conv =>
        conv.type === 'Grupo' || myConvIds.has(conv.id)
    );

    return visibleConvs.map(conv => {
        const msgs = (DB.chat_messages || []).filter(m => m.conversation_id === conv.id)
            .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
            .map(m => {
                const isMe = window.currentUser && m.sender_id === window.currentUser.id;
                const senderUser = DB.usuarios.find(u => u.id === m.sender_id);
                return {
                    id: m.id,
                    senderId: isMe ? 'me' : m.sender_id,
                    senderName: isMe ? 'Eu' : (senderUser ? senderUser.nome : 'Usuário'),
                    text: m.body,
                    time: new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                };
            });
        const lastMsg = msgs[msgs.length - 1];
        return {
            id: conv.id,
            name: conv.name,
            role: conv.type,
            avatar: null,
            lastMessage: lastMsg ? lastMsg.text : 'Sem mensagens',
            timestamp: lastMsg ? lastMsg.time : '',
            unread: 0,
            messages: msgs
        };
    });
}

// ── 2. ESTADO INTERNO ────────────────────────────────────────────
let chatState = {
  selectedConversationId: null,
  conversations: [],
  filteredConversations: [],
};

// ── 3. INICIALIZAÇÃO ─────────────────────────────────────────────
function initChatModule() {
  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];

  // Gerenciamento correto do ciclo de vida do canal
  if (window._chatChannel) {
      supabase.removeChannel(window._chatChannel);
      window._chatChannel = null;
      console.log('[Chat Realtime Lifecycle] Canal anterior removido para evitar duplicidade.');
  }

  window._chatChannel = supabase.channel('chat-realtime')

    // ── Novas mensagens ──
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const newMsg = payload.new;
        if (DB.chat_messages.find(m => m.id === newMsg.id)) return; // Failsafe deduplication
        
        console.log('[Chat Realtime] Nova mensagem recebida:', newMsg.id);
        DB.chat_messages.push(newMsg);
        
        // Re-processa e atualiza a UI inteiramente orientada pelo banco
        chatState.conversations = buildChatFromDB();
        chatState.filteredConversations = [...chatState.conversations];
        
        if (chatState.selectedConversationId) {
            openConversation(chatState.selectedConversationId); // Atualiza mensagens abertas
        } else {
            renderConversationList(chatState.filteredConversations); // Atualiza sidebar
        }
    })

    // ── Novas conversas (recebimento passivo) ──
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_conversations' }, payload => {
        const newConv = payload.new;
        if (!DB.chat_conversations.find(c => c.id === newConv.id)) {
            console.log('[Chat Realtime] Nova conversa detectada:', newConv.id);
            DB.chat_conversations.push(newConv);
            chatState.conversations = buildChatFromDB();
            chatState.filteredConversations = [...chatState.conversations];
            renderConversationList(chatState.filteredConversations);
        }
    })

    // ── Novo participante (gatilho de consistência) ──
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_participants' }, async payload => {
        const newPart = payload.new;
        const exists = DB.chat_participants.find(
            p => p.conversation_id === newPart.conversation_id && p.user_id === newPart.user_id
        );
        if (!exists) {
            console.log('[Chat Realtime] Novo participante detectado:', newPart.user_id);
            (DB.chat_participants = DB.chat_participants || []).push(newPart);
        }

        // Self-healing: Se o participante for o usuário atual, garante que temos a conversa em memória
        if (window.currentUser && newPart.user_id === window.currentUser.id) {
            const convExists = DB.chat_conversations.find(c => c.id === newPart.conversation_id);
            if (!convExists) {
                console.warn('[Chat Consistency] Recebeu participante mas a conversa ainda não chegou. Buscando fallback...');
                const { data } = await supabase.from('chat_conversations').select('*').eq('id', newPart.conversation_id).single();
                if (data && !DB.chat_conversations.find(c => c.id === data.id)) {
                    DB.chat_conversations.push(data);
                }
            }
            chatState.conversations = buildChatFromDB();
            chatState.filteredConversations = [...chatState.conversations];
            renderConversationList(chatState.filteredConversations);
        }
    })

    // ── Auditoria de Lifecycle do Realtime ──
    .subscribe((status, err) => {
        console.log(`[Chat Realtime Lifecycle] Transição de estado: ${status}`, err ? err : '');
        if (status === 'SUBSCRIBED') {
            console.log('[Chat Realtime Lifecycle] ✅ Conexão estabelecida. Escutando eventos de forma atômica.');
        } else if (status === 'CHANNEL_ERROR') {
            console.error('[Chat Realtime Lifecycle] ❌ Erro de canal. O motor do Supabase recusou a conexão (Verifique RLS/Publication).');
        } else if (status === 'CLOSED') {
            console.warn('[Chat Realtime Lifecycle] 🔌 Canal fechado.');
        } else if (status === 'TIMED_OUT') {
            console.warn('[Chat Realtime Lifecycle] ⏳ Conexão expirou. O SupabaseJS iniciará reconnect automático.');
        }
    });

  renderConversationList(chatState.filteredConversations);
  bindChatEvents();
}

// ── 4. RENDER DA LISTA DE CONVERSAS ──────────────────────────────
function renderConversationList(conversations) {
  const loadingEl  = document.getElementById('chat-loading-state');
  const emptyEl    = document.getElementById('chat-empty-state');
  const listEl     = document.getElementById('conversations-list');

  // Guarda defensiva: se elementos não existem, o módulo não está ativo
  if (!listEl) return;

  // Oculta o loading spinner
  if (loadingEl) loadingEl.style.display = 'none';

  if (!conversations || conversations.length === 0) {
    listEl.style.display  = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = 'block';

  listEl.innerHTML = conversations.map(conv => {
    const initials  = (conv.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const isActive  = conv.id === chatState.selectedConversationId;
    const unreadBadge = conv.unread > 0
      ? `<span class="conv-unread-badge">${conv.unread}</span>`
      : '';

    return `
      <li
        class="conversation-item ${isActive ? 'active' : ''}"
        data-conv-id="${conv.id}"
        role="button"
        tabindex="0"
        aria-label="Conversa com ${conv.name}"
      >
        <div class="conv-avatar">${initials}</div>
        <div class="conv-info">
          <div class="conv-top">
            <span class="conv-name">${conv.name ?? 'Usuário'}</span>
            <span class="conv-time">${conv.timestamp ?? ''}</span>
          </div>
          <div class="conv-bottom">
            <span class="conv-last-msg">${conv.lastMessage ?? ''}</span>
            ${unreadBadge}
          </div>
        </div>
      </li>
    `;
  }).join('');
}

// ── 5. ABRIR CONVERSA (o ponto crítico que causava tela preta) ───
function openConversation(conversationId) {
    console.log('[CHAT] openConversation chamada:', conversationId);
  // Busca com segurança
  const conv = chatState.conversations.find(c => c.id === conversationId);

  if (!conv) {
    console.error('[Chat] openConversation: conversa não encontrada →', conversationId);
    return;
  }

  // Atualiza estado
  chatState.selectedConversationId = conversationId;

  // Marca conversa como lida
  conv.unread = 0;

  // Re-renderiza a lista para atualizar o item ativo e remover badge
  renderConversationList(chatState.filteredConversations);

  // Referências aos elementos do painel direito
  const noSelectionEl = document.getElementById('chat-no-selection');
  const activeAreaEl  = document.getElementById('chat-active-area');
  const headerBarEl   = document.getElementById('chat-header-bar');
  const messagesBodyEl = document.getElementById('chat-messages-body');

    console.log('[CHAT] Elementos encontrados:', {
      noSelectionEl,
      activeAreaEl,
      headerBarEl,
      messagesBodyEl
});

  // Guarda defensiva: verifica se todos os elementos existem
  if (!noSelectionEl || !activeAreaEl || !headerBarEl || !messagesBodyEl) {
    console.error('[Chat] openConversation: elementos do DOM não encontrados. Verifique os IDs no HTML.');
    return;
  }

  // Alterna visibilidade: oculta placeholder, mostra área de chat
  noSelectionEl.style.display = 'none';
  activeAreaEl.style.display  = 'flex';

console.log('[CHAT] Displays após alteração:', {
  noSelection: noSelectionEl.style.display,
  activeArea: activeAreaEl.style.display
});

  // Renderiza o header da conversa
  const initials = (conv.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  headerBarEl.innerHTML = `
    <div class="chat-header-info">
      <div class="conv-avatar conv-avatar--sm">${initials}</div>
      <div class="chat-header-text">
        <strong>${conv.name ?? 'Usuário'}</strong>
        <small>${conv.role ?? ''}</small>
      </div>
    </div>
    <div class="chat-header-actions">
      <button class="btn-icon btn-chat-options" id="btn-chat-options" title="Mais opções"><i class="fas fa-ellipsis-v"></i></button>
    </div>
  `;

    // Listener do botão "..." — menu de opções da conversa
  const optBtn = document.getElementById('btn-chat-options');
  if (optBtn) {
    optBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var existingMenu = document.getElementById('chat-options-menu');
      if (existingMenu) { existingMenu.remove(); return; }
      var menu = document.createElement('div');
      menu.id = 'chat-options-menu';
      menu.className = 'chat-options-menu';
      menu.innerHTML =
        '<button class="chat-option-item" data-action="clear"><i class="fas fa-trash-alt"></i> Limpar conversa</button>' +
        '<button class="chat-option-item" data-action="mute"><i class="fas fa-bell-slash"></i> Silenciar notificações</button>';
      var rect = optBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top  = (rect.bottom + 6) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      document.body.appendChild(menu);
      menu.querySelector('[data-action="clear"]').addEventListener('click', function() {
        var c = chatState.conversations.find(function(x) { return x.id === chatState.selectedConversationId; });
        if (c) { c.messages = []; c.lastMessage = ''; }
        menu.remove();
        openConversation(chatState.selectedConversationId);
        renderConversationList(chatState.filteredConversations);
      });
      menu.querySelector('[data-action="mute"]').addEventListener('click', function() {
        menu.remove();
        var toast = document.createElement('div');
        toast.className = 'chat-toast';
        toast.textContent = 'Notificações silenciadas (simulado).';
        document.body.appendChild(toast);
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
      });
      setTimeout(function() {
        document.addEventListener('click', function closeMenu() {
          var m = document.getElementById('chat-options-menu');
          if (m) m.remove();
          document.removeEventListener('click', closeMenu);
        });
      }, 50);
    });
  }

  // Renderiza mensagens com optional chaining e fallback de array vazio
  const messages = conv?.messages ?? [];

  // Limpa o container antes de construir novo conteúdo
  messagesBodyEl.innerHTML = '';

  if (messages.length === 0) {
    // Estado vazio: usa HTML estático sem dados do usuário — seguro sem textContent
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'chat-empty-messages';
    emptyDiv.innerHTML = '<i class="fas fa-comment-dots"></i><p>Nenhuma mensagem ainda. Inicie a conversa!</p>';
    messagesBodyEl.appendChild(emptyDiv);
  } else {
    // Iteração segura: texto do usuário (msg.text e msg.time) injetado exclusivamente via
    // .textContent, impedindo que HTML ou scripts embutidos sejam interpretados pelo browser.
    messages.forEach(msg => {
      const wrapper = document.createElement('div');
      wrapper.className = `chat-msg ${msg.senderId === 'me' ? 'msg-sent' : 'msg-received'}`;

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = msg.text ?? ''; // SAFE: não interpreta HTML

      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = msg.time ?? ''; // SAFE: não interpreta HTML

      wrapper.appendChild(bubble);
      wrapper.appendChild(time);
      messagesBodyEl.appendChild(wrapper);
    });
  }

  // Scroll automático para a última mensagem
  messagesBodyEl.scrollTop = messagesBodyEl.scrollHeight;
}

// ── 6. ENVIAR MENSAGEM ────────────────────────────────────────────
async function sendMessage() {
  const inputEl = document.getElementById('chat-input-field');
  const sendBtn = document.getElementById('btn-send-message');
  const text    = inputEl?.value?.trim();

  if (!text) return;
  if (!chatState.selectedConversationId) {
      console.warn('[Chat Event] Tentativa de envio sem conversa selecionada.');
      return;
  }
  if (!window.currentUser) {
      console.warn('[Chat Event] Usuário não autenticado.');
      return;
  }

  const newMsg = {
    id: crypto.randomUUID(),
    conversation_id: chatState.selectedConversationId,
    sender_id: window.currentUser.id,
    body: text,
    sent_at: new Date().toISOString()
  };

  // 1. UI State: Limpa o input e bloqueia envio adicional (evitar duplo clique)
  inputEl.value = '';
  if (sendBtn) sendBtn.disabled = true;

  // 2. Persistência Exclusiva (Arquitetura Distribuída)
  console.log('[Chat Event] Preparando payload para envio:', JSON.stringify(newMsg, null, 2));
  console.log('[Chat Event] Aguardando confirmação transacional do Supabase...');
  
  const { data, error } = await supabase.from('chat_messages').insert(newMsg).select();
  
  if (sendBtn) sendBtn.disabled = false;

  if (error) {
      console.error('[Chat Event] ❌ Falha crítica ao persistir mensagem. Erro completo:', error);
      alert('Erro ao enviar mensagem. Tente novamente.');
      inputEl.value = text; // Rollback UI
  } else {
      console.log('[Chat Event] ✅ Mensagem salva! Resposta do Supabase:', data);
      console.log('[Chat Event] Aguardando o eco do Realtime para renderizar na tela.');
  }
}
// ================================================================
// EXPORTAÇÃO DO MÓDULO DE CHAT
// ================================================================

const ChatModule = {
  init() {
    initChatModule();
  },

  destroy() {
    // Remove o canal do Supabase corretamente (evita vazamento de memória e subscriptions órfãs)
    if (window._chatChannel) {
        supabase.removeChannel(window._chatChannel);
        window._chatChannel = null;
        console.log('[Chat Realtime Lifecycle] Canal removido ao sair do módulo (Cleanup).');
    }
    chatState.selectedConversationId = null;
  },

  openConversation,

  sendMessage() {
    sendMessage();
  },

  async renderContextualCommentPanel(entityType, entityId, container) {
    if (!container) return;

    container.innerHTML = `
      <div class="ctx-comments-panel">
        <h4>Comentários</h4>
        <p>Funcionalidade em desenvolvimento.</p>
      </div>
    `;
  }
};
// ── 7. BIND DE EVENTOS ───────────────────────────────────────────
function bindChatEvents() {
  // Delegação de evento na lista (evita rebind em cada render)
  const listEl = document.getElementById('conversations-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.conversation-item');
      if (item) {
        openConversation(item.dataset.convId);
      }
    });

    // Acessibilidade: Enter/Space também abre
    listEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('.conversation-item');
        if (item) {
          e.preventDefault();
          openConversation(item.dataset.convId);
        }
      }
    });
  }

  // Botão enviar
  const sendBtn = document.getElementById('btn-send-message');
  if (sendBtn) {
      // Remove listener anterior clonando o node para evitar acúmulo de binds no SPA
      const newSendBtn = sendBtn.cloneNode(true);
      sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
      newSendBtn.addEventListener('click', sendMessage);
  }

  // Enter no input
  const inputField = document.getElementById('chat-input-field');
  if (inputField) {
      const newInputField = inputField.cloneNode(true);
      inputField.parentNode.replaceChild(newInputField, inputField);
      newInputField.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
          }
      });
  }

  // Busca de conversas
  const searchInput = document.getElementById('chat-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      chatState.filteredConversations = chatState.conversations.filter(c =>
        c.name.toLowerCase().includes(query) ||
        (c.lastMessage ?? '').toLowerCase().includes(query)
      );
      renderConversationList(chatState.filteredConversations);
    });
  }
}

// ================================================================
// MÓDULO: NOVA CONVERSA — Modal de seleção de usuário
// ================================================================
// Arquitetura isolada para futura integração Supabase.
// Para integrar, substitua apenas createConversation() por:
//   const { data } = await supabase
//     .from('chat_conversations')
//     .insert({ participant_a: currentUser.id, participant_b: targetUser.id })
//     .select().single();

let newChatState = { selectedUserId: null };

function openNewChatModal() {
  newChatState.selectedUserId = null;
  const overlay  = document.getElementById('new-chat-overlay');
  const searchEl = document.getElementById('new-chat-search');
  const startBtn = document.getElementById('btn-start-conversation');
  if (!overlay) return;
  if (searchEl) searchEl.value = '';
  if (startBtn) startBtn.disabled = true;
  renderNewChatUserList('');
  overlay.classList.add('active');
  setTimeout(function() { if (searchEl) searchEl.focus(); }, 80);
}

function closeNewChatModal() {
  const overlay = document.getElementById('new-chat-overlay');
  if (overlay) overlay.classList.remove('active');
  newChatState.selectedUserId = null;
}

function renderNewChatUserList(query) {
  const listEl  = document.getElementById('new-chat-user-list');
  const emptyEl = document.getElementById('new-chat-empty');
  if (!listEl) return;

  const q = (query || '').toLowerCase().trim();
  // Usa window.DB / window.currentUser para garantir acesso independente de escopo
  var _DB = window.DB || DB;
  var _currentUser = window.currentUser || currentUser;
  const users = (_DB.usuarios || []).filter(function(u) {
    if (!u.status) return false;
    if (_currentUser && u.id === _currentUser.id) return false;
    if (!q) return true;
    return (
      u.nome.toLowerCase().indexOf(q) !== -1 ||
      u.cargo.toLowerCase().indexOf(q) !== -1 ||
      u.diretoria.toLowerCase().indexOf(q) !== -1
    );
  });

  if (users.length === 0) {
    listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  listEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = users.map(function(u) {
    const existingConv = chatState.conversations.find(function(c) { return c.participantId === u.id; });
    const parts = u.nome.split(' ');
    const initials = parts.slice(0, 2).map(function(w) { return w[0] || ''; }).join('');
    const isSelected = newChatState.selectedUserId === u.id;
    const diretoriaLabel = u.diretoria !== 'Nenhuma' ? u.diretoria : 'Geral';
    const existingBadge = existingConv
      ? '<span class="new-chat-badge-existing"><i class="fas fa-comments"></i> Existente</span>'
      : '';
    return (
      '<div class="new-chat-user-item' + (isSelected ? ' selected' : '') + '"' +
        ' data-user-id="' + u.id + '" tabindex="0" role="option" aria-selected="' + isSelected + '">' +
        '<div class="new-chat-avatar">' + initials + '</div>' +
        '<div class="new-chat-user-info">' +
          '<span class="new-chat-user-name">' + u.nome + '</span>' +
          '<span class="new-chat-user-meta">' + u.cargo + ' · ' + diretoriaLabel + '</span>' +
        '</div>' +
        existingBadge +
      '</div>'
    );
  }).join('');

  listEl.querySelectorAll('.new-chat-user-item').forEach(function(item) {
    function selectUser() {
      newChatState.selectedUserId = item.dataset.userId;
      listEl.querySelectorAll('.new-chat-user-item').forEach(function(el) {
        el.classList.toggle('selected', el.dataset.userId === newChatState.selectedUserId);
      });
      const startBtn = document.getElementById('btn-start-conversation');
      if (startBtn) startBtn.disabled = false;
    }
    item.addEventListener('click', selectUser);
    item.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectUser(); }
    });
  });
}

// ── createConversation: criação atômica via Stored Procedure (RPC) ──
async function createConversation(targetUser) {
  if (!window.currentUser) return null;

  // Verifica duplicata localmente primeiro para evitar request de rede atoa
  const myConvIds = new Set(
      (DB.chat_participants || [])
          .filter(p => p.user_id === window.currentUser.id)
          .map(p => p.conversation_id)
  );
  const theirConvIds = new Set(
      (DB.chat_participants || [])
          .filter(p => p.user_id === targetUser.id)
          .map(p => p.conversation_id)
  );
  const existingId = [...myConvIds].find(id => {
      const conv = DB.chat_conversations.find(c => c.id === id);
      return conv && conv.type === 'Privado' && theirConvIds.has(id);
  });
  if (existingId) {
      console.log('[Chat RPC] Reutilizando conversa privada existente (Local Cache):', existingId);
      return existingId;
  }

  console.log('[Chat RPC] Iniciando transação atômica para criação de conversa...');
  
  // Executa RPC Atômica. O Supabase fará tudo num único bloco BEGIN/COMMIT.
  const { data: convId, error } = await supabase.rpc('create_private_conversation', {
      user1_id: window.currentUser.id,
      user2_id: targetUser.id,
      user1_name: window.currentUser.nome,
      user2_name: targetUser.nome
  });

  if (error) {
      console.error('[Chat RPC] ❌ Falha crítica na transação:', error);
      alert('Não foi possível iniciar a conversa devido a um erro de integridade do sistema.');
      return null;
  }

  console.log('[Chat RPC] ✅ Transação concluída. Conversa:', convId);

  // Força uma resincronização do DB local para garantir que possuímos a 
  // conversa e os participantes recém criados antes de tentar renderizar a interface
  // (caso o Realtime ainda não tenha processado em background).
  await syncDBFromSupabase();
  
  chatState.conversations = buildChatFromDB();
  chatState.filteredConversations = [...chatState.conversations];

  return convId;
}

// ── bindNewChatModalEvents: registra todos os listeners do modal ──
function bindNewChatModalEvents() {
  var btnNew = document.getElementById('btn-new-chat');
  if (btnNew) btnNew.addEventListener('click', openNewChatModal);

  var btnClose = document.getElementById('btn-close-new-chat');
  if (btnClose) btnClose.addEventListener('click', closeNewChatModal);

  var btnCancel = document.getElementById('btn-cancel-new-chat');
  if (btnCancel) btnCancel.addEventListener('click', closeNewChatModal);

  var overlay = document.getElementById('new-chat-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeNewChatModal();
    });
  }

  var searchEl = document.getElementById('new-chat-search');
  if (searchEl) {
    searchEl.addEventListener('input', function(e) {
      renderNewChatUserList(e.target.value);
    });
  }

  var btnStart = document.getElementById('btn-start-conversation');
  if (btnStart) {
    btnStart.addEventListener('click', async function() {
      if (!newChatState.selectedUserId) return;
      var targetUser = (window.DB || DB).usuarios.find(u => u.id === newChatState.selectedUserId);
      if (!targetUser) return;

      // Desabilita botão para evitar double-click race conditions
      btnStart.disabled = true;
      const originalText = btnStart.innerText;
      btnStart.innerText = 'Iniciando...';

      try {
        // createConversation é assíncrona (persiste no Supabase e bloqueia duplicatas)
        const convId = await createConversation(targetUser);
        if (!convId) return;

        closeNewChatModal();
        renderConversationList(chatState.filteredConversations);
        openConversation(convId);
      } catch (err) {
        console.error('[Chat] Erro ao criar conversa:', err);
      } finally {
        // Restaura o botão independentemente de sucesso ou falha
        btnStart.disabled = false;
        btnStart.innerText = originalText;
      }
    });
  }
}

    // Expoe funcoes do chat ao escopo global (garante acesso independente de closure)
    window._chatState = chatState;
    window.openNewChatModal = openNewChatModal;
    window.closeNewChatModal = closeNewChatModal;
    window.renderConversationList = renderConversationList;
    window.openConversation = openConversation;

    // Registra os listeners do modal Nova Conversa
    bindNewChatModalEvents();

}); // ← fechamento do DOMContentLoaded
