// ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// IN-MEMORY DATABASE & ENGINE SIMULATOR (app.js) - MVP v2.0
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------------
    // 1. ESTADO DO BANCO DE DADOS (IN-MEMORY DB)
    // ------------------------------------------------------------------------
    const DB = {
        usuarios: [
            { id: 'u1', nome: 'Eduardo Carolo', email: 'presidencia@atleticalup.com.br', cargo: 'Master', diretoria: 'Presidência', status: true },
            { id: 'u2', nome: 'Barthô da Tesouraria', email: 'financeiro@atleticalup.com.br', cargo: 'Diretor', diretoria: 'Tesouraria', status: true },
            { id: 'u3', nome: 'Mariana do Mkt', email: 'marketing@atleticalup.com.br', cargo: 'Diretor', diretoria: 'Marketing', status: true },
            { id: 'u4', nome: 'Guilherme do Esporte', email: 'esportes@atleticalup.com.br', cargo: 'Diretor', diretoria: 'Esportes', status: true },
            { id: 'u5', nome: 'Lucas do Jurídico', email: 'juridico@atleticalup.com.br', cargo: 'Diretor', diretoria: 'Jurídico', status: true },
            { id: 'u6', nome: 'Amanda Apoio', email: 'suporte@atleticalup.com.br', cargo: 'Apoio', diretoria: 'Nenhuma', status: true }
        ],
        eventos: [
            { id: 'e1', nome: 'Cervejada de Integração LUP', data_evento: '2026-06-12 18:00', local: 'Arena LUP', orcamento_previsto: 12000.00, status_aprovacao: 'Aprovado', criador_id: 'u3' },
            { id: 'e2', nome: 'InterMed São Paulo', data_evento: '2026-09-05 08:00', local: 'Olímpia - SP', orcamento_previsto: 25000.00, status_aprovacao: 'Aguardando Tesouraria', criador_id: 'u4' },
            { id: 'e3', nome: 'Treino Geral de Cheerleaders', data_evento: '2026-06-02 19:30', local: 'Ginásio B', orcamento_previsto: 350.00, status_aprovacao: 'Rascunho', criador_id: 'u1' }
        ],
        tarefas_logistica: [
            { id: 't1', evento_id: 'e1', descricao: 'Aluguel do som e iluminação', data_prazo: '2026-06-10', responsavel_id: 'u6', status: 'Concluído' },
            { id: 't2', evento_id: 'e1', descricao: 'Compra de bebidas (lotes iniciais)', data_prazo: '2026-06-11', responsavel_id: 'u2', status: 'Em Andamento' },
            { id: 't3', evento_id: 'e2', descricao: 'Aluguel do ônibus da delegação', data_prazo: '2026-08-30', responsavel_id: 'u4', status: 'Pendente' }
        ],
        modalidades: [
            { id: 'm1', nome: 'Futsal Masculino', coordenador_id: 'u4' },
            { id: 'm2', nome: 'Handebol Feminino', coordenador_id: 'u4' },
            { id: 'm3', nome: 'Cheerleading Misto', coordenador_id: 'u1' }
        ],
        atletas: [
            { id: 'a1', nome: 'Mateus Silva Ramos', ra_matricula: '22.01948-2', modalidade_id: 'm1', status_documentacao: 'Aprovado' },
            { id: 'a2', nome: 'Gabriela Mendes Costa', ra_matricula: '23.00341-9', modalidade_id: 'm2', status_documentacao: 'Pendente' },
            { id: 'a3', nome: 'Rodrigo Nogueira Souza', ra_matricula: '21.01185-5', modalidade_id: 'm1', status_documentacao: 'Rejeitado' }
        ],
        produtos: [
            { id: 'p1', nome: 'Moletom Oficial Lupus', preco_custo: 85.00, preco_venda: 160.00 },
            { id: 'p2', nome: 'Caneca Tirante LUP', preco_custo: 12.00, preco_venda: 25.00 }
        ],
        produto_variantes: [
            { id: 'pv1', produto_id: 'p1', tamanho: 'P', estoque_atual: 15 },
            { id: 'pv2', produto_id: 'p1', tamanho: 'M', estoque_atual: 24 },
            { id: 'pv3', produto_id: 'p1', tamanho: 'G', estoque_atual: 0 }, // Esgotado
            { id: 'pv4', produto_id: 'p1', tamanho: 'GG', estoque_atual: 5 },
            { id: 'pv5', produto_id: 'p2', tamanho: 'Único', estoque_atual: 150 }
        ],
        calendario_editorial: [
            { id: 'ce1', evento_id: 'e1', plataforma: 'Instagram', data_publicacao: '2026-06-01 12:00', descricao: 'Post oficial de venda de ingressos do primeiro lote', responsavel_id: 'u3' }
        ],
        lancamentos_financeiros: [
            { id: 'lf1', tipo: 'Entrada', categoria: 'Patrocínio Master', valor: 8000.00, data_competencia: '2026-05-10', status_conciliacao: true, evento_id: null, produto_id: null },
            { id: 'lf2', tipo: 'Entrada', categoria: 'Venda Moletom', valor: 3840.00, data_competencia: '2026-05-15', status_conciliacao: true, evento_id: null, produto_id: 'p1' },
            { id: 'lf3', tipo: 'Saída', categoria: 'Logística Evento', valor: 12000.00, data_competencia: '2026-05-20', status_conciliacao: false, evento_id: 'e1', produto_id: null }
        ],
        parceiros_patrocinadores: [
            { id: 'par1', nome_empresa: 'RedBull Brasil', tipo_parceria: 'Fornecimento de Energéticos', status_funil: 'Negociação' },
            { id: 'par2', nome_empresa: 'Cervejaria Local', tipo_parceria: 'Patrocínio Financeiro LUP Fest', status_funil: 'Contrato Ativo' },
            { id: 'par3', nome_empresa: 'Marca de Roupas Esportivas', tipo_parceria: 'Uniformes das Delegações', status_funil: 'Prospecção' }
        ],
        documentos_contratos: [
            { id: 'dc1', titulo: 'Termo de Parceria RedBull 2026', tipo_documento: 'Termo de Parceria', arquivo_url: '', data_vencimento: '2026-12-31', parceiro_id: 'par1' },
            { id: 'dc2', titulo: 'Contrato Assinado Cervejaria 2026', tipo_documento: 'Contrato', arquivo_url: 'https://drive.google.com/file/d/atletica-lup-contrato-cerveja-193/view', data_vencimento: '2026-11-30', parceiro_id: 'par2' }
        ],
        logs_notificacoes: [
            { id: 'log1', usuario_id: 'u3', tipo_notificacao: 'Email', gatilho_regra: 'SOLICITACAO_VERBA', destinatario_email: 'financeiro@atleticalup.com.br', status_entrega: 'ENVIADO', data_envio: '2026-05-20 10:14', erro_detalhe: null },
            { id: 'log2', usuario_id: 'u4', tipo_notificacao: 'Email', gatilho_regra: 'ATLETA_BARRADO', destinatario_email: 'esportes@atleticalup.com.br', status_entrega: 'FALHA', data_envio: '2026-05-22 15:30', erro_detalhe: 'Try/catch exception: Resend API Connection Timeout. Mailbox unavailable.' }
        ]
    };

    // Usuário Logado Inicial na Simulação (Master - Presidente)
    let currentUser = DB.usuarios[0];

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

    function showDBErrorDialog(errCode, constraintName, description) {
        const overlay = document.getElementById('error-overlay');
        document.getElementById('error-code').innerText = `PostgreSQL State: ${errCode} | Constraint: ${constraintName}`;
        document.getElementById('error-message').innerText = description;
        overlay.classList.add('active');
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
                        data_envio: new Date().toLocaleString(),
                        erro_detalhe: `Tentativa de aprovação de evento '${event.name}' por usuário não autorizado: ${user.nome} (${user.cargo} - ${user.diretoria})`
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
        }
    };

    // ------------------------------------------------------------------------
    // 3. LOGICA DA INTERFACE DE USUÁRIO (DOM MANIPULATION)
    // ------------------------------------------------------------------------

    // Tab Navigation Switcher
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.module-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.getAttribute('data-target');
            
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(targetSection).classList.add('active');
            logSQL(`Navegação: Acessou módulo '${item.innerText.trim()}'`, 'query');
        });
    });

    // Close Error Overlay Modal
    document.getElementById('btn-close-error').addEventListener('click', () => {
        document.getElementById('error-overlay').classList.remove('active');
    });

    // User Selection (RBAC Toggle)
    const rbacSelect = document.getElementById('user-rbac-select');
    rbacSelect.addEventListener('change', (e) => {
        const userId = e.target.value;
        currentUser = DB.usuarios.find(u => u.id === userId);
        
        // Update user badge in sidebar
        document.getElementById('logged-user-role').innerText = currentUser.cargo;
        document.getElementById('logged-user-dept').innerText = currentUser.diretoria !== 'Nenhuma' ? `Diretoria de ${currentUser.diretoria}` : 'Geral';
        
        logSQL(`RBAC Switch: Sessão de banco alterada. app.current_user_id = '${currentUser.id}' (${currentUser.nome})`, 'trigger');
        refreshAllUI();
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

        // Render Users list
        const userListTbody = document.querySelector('#users-table tbody');
        userListTbody.innerHTML = '';
        DB.usuarios.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${user.nome}</b></td>
                <td><code>${user.email}</code></td>
                <td><span class="badge badge-secondary">${user.cargo}</span></td>
                <td><span class="badge badge-success">${user.diretoria}</span></td>
                <td><span class="badge badge-success">${user.status ? 'Ativo' : 'Inativo'}</span></td>
            `;
            userListTbody.appendChild(tr);
        });

        // Render Logs & Audit table (with Delete attempt simulated to test RN-LOG-01)
        const logsTbody = document.querySelector('#logs-table tbody');
        logsTbody.innerHTML = '';
        DB.logs_notificacoes.slice().reverse().forEach(log => {
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
                DB_Engine.mutateAuditLog(logId, 'delete');
            });
        });
    }

    // RENDER 2: EVENTS MODULE (KANBAN BOARD)
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
                <div class="event-budget">
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

        // Populating the select dropdown for editorial calendar event list
        const calendarSelect = document.getElementById('marketing-evt-select');
        calendarSelect.innerHTML = '<option value="">Selecione um Evento...</option>';
        DB.eventos.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.innerText = `${e.nome} (${e.status_aprovacao})`;
            calendarSelect.appendChild(opt);
        });

        // Editorial Calendar render list
        const editorialList = document.getElementById('editorial-list');
        editorialList.innerHTML = '';
        DB.calendario_editorial.forEach(post => {
            const evt = DB.eventos.find(e => e.id === post.evento_id);
            const author = DB.usuarios.find(u => u.id === post.responsavel_id);
            const item = document.createElement('div');
            item.className = 'list-group-item';
            item.innerHTML = `
                <div>
                    <div class="list-group-item-title">${post.plataforma} - ${evt.nome}</div>
                    <div class="list-group-item-desc">📅 Publicação em: ${post.data_publicacao} | Responsável: ${author.nome}</div>
                    <div style="font-size:12px; margin-top:6px; color:#fff;">"${post.descricao}"</div>
                </div>
            `;
            editorialList.appendChild(item);
        });
    }

    // Event Handler: Create Event Form
    document.getElementById('form-create-event').addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('evt-nome').value;
        const data = document.getElementById('evt-data').value;
        const local = document.getElementById('evt-local').value;
        const orcamento = parseFloat(document.getElementById('evt-orcamento').value) || 0;

        const newId = 'e_' + Date.now();
        const event = {
            id: newId,
            nome: nome,
            data_evento: data.replace('T', ' '),
            local: local,
            orcamento_previsto: orcamento,
            status_aprovacao: 'Rascunho',
            criador_id: currentUser.id
        };

        DB.eventos.push(event);
        logSQL(`INSERT INTO eventos (nome, data_evento, local, orcamento_previsto, status_aprovacao, criador_id) VALUES ('${nome}', '${data}', '${local}', ${orcamento}, 'Rascunho', '${currentUser.id}');`, 'query');
        logSQL(`Event successfully created in state 'Rascunho'. Please drag or push it to 'Aguardando Tesouraria' to request funds.`, 'success');
        
        document.getElementById('form-create-event').reset();
        refreshAllUI();
    });

    // Event Handler: Create Marketing editorial calendar post (triggers RN-EV-01)
    document.getElementById('btn-add-marketing').addEventListener('click', () => {
        const evtId = document.getElementById('marketing-evt-select').value;
        const plataforma = document.getElementById('marketing-platform').value;
        const data = document.getElementById('marketing-date').value;
        const desc = document.getElementById('marketing-desc').value;

        if (!evtId || !plataforma || !data || !desc) {
            alert('Preencha todos os campos do calendário editorial!');
            return;
        }

        DB_Engine.insertCalendarioEditorial(evtId, plataforma, data.replace('T', ' '), desc);
    });

    // RENDER 3: PRODUCTS & INVENTORY
    function renderProductsModule() {
        // Tabela de Inventário
        const inventoryTbody = document.querySelector('#inventory-table tbody');
        inventoryTbody.innerHTML = '';
        
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
                <td>
                    <button class="btn btn-secondary btn-stock-add" data-var-id="${variant.id}" style="padding: 2px 6px; font-size:11px;">
                        <i class="fas fa-plus"></i> Reabastecer (+10)
                    </button>
                </td>
            `;
            inventoryTbody.appendChild(tr);
        });

        // Add 10 stock event listeners
        document.querySelectorAll('.btn-stock-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const varId = btn.getAttribute('data-var-id');
                DB_Engine.mutateProductStock(varId, 10);
            });
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

    // RENDER 4: SPORTS & ATHLETES
    function renderSportsModule() {
        // Modalidades list
        const modalitiesTbody = document.querySelector('#modalities-table tbody');
        modalitiesTbody.innerHTML = '';
        DB.modalidades.forEach(mod => {
            const manager = DB.usuarios.find(u => u.id === mod.coordenador_id);
            const countAthletes = DB.atletas.filter(a => a.modalidade_id === mod.id).length;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${mod.nome}</b></td>
                <td>${manager ? manager.nome : 'Nenhum'}</td>
                <td><span class="badge badge-secondary">${countAthletes} atletas inscritos</span></td>
            `;
            modalitiesTbody.appendChild(tr);
        });

        // Athlete rows
        const athletesTbody = document.querySelector('#athletes-table tbody');
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
                <td><span class="badge badge-secondary">${mod.nome}</span></td>
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

        // Modalidade select list in athlete enrollment form
        const modSelect = document.getElementById('enroll-mod-select');
        modSelect.innerHTML = '<option value="">Selecione...</option>';
        DB.modalidades.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.innerText = m.nome;
            modSelect.appendChild(opt);
        });
    }

    // Event Handler: Register Athlete
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

    // RENDER 5: TREASURY (FINANCE MODULE)
    function renderFinanceModule() {
        const financeTbody = document.querySelector('#ledger-table tbody');
        financeTbody.innerHTML = '';
        
        let netInflow = 0;
        let netOutflow = 0;

        DB.lancamentos_financeiros.forEach(record => {
            const tr = document.createElement('tr');
            
            if (record.tipo === 'Entrada') netInflow += record.valor;
            else netOutflow += record.valor;

            tr.innerHTML = `
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
                        ` : ''}
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
                // UPDATE status_conciliacao = TRUE
                DB_Engine.mutateFinanceRecord(lfId, 'update', { status_conciliacao: true });
            });
        });

        // Delete record button click (tests RN-FIN-01 lock)
        document.querySelectorAll('.btn-delete-lf').forEach(btn => {
            btn.addEventListener('click', () => {
                const lfId = btn.getAttribute('data-lf-id');
                DB_Engine.mutateFinanceRecord(lfId, 'delete');
            });
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

    // Event Handler: Lançamento de Estorno (Forçando correção manual - RN-FIN-01)
    document.getElementById('btn-estorno-finance').addEventListener('click', () => {
        const idToEstorno = prompt("Digite o nome ou ID do Lançamento Conciliado que deseja estornar (ex: 'lf1'):");
        if (!idToEstorno) return;

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
    });

    // RENDER 6: PARTNERS & LEGAL (GED Repositories)
    function renderLegalModule() {
        // Render Partner list cards
        const partnersList = document.getElementById('partners-list');
        partnersList.innerHTML = '';
        
        DB.parceiros_patrocinadores.forEach(partner => {
            const contracts = DB.documentos_contratos.filter(dc => dc.parceiro_id === partner.id);
            const activeContract = contracts.find(c => c.arquivo_url && c.arquivo_url.trim() !== '');

            const card = document.createElement('div');
            card.className = 'list-group-item';
            
            let statusBadge = '';
            if (partner.status_funil === 'Contrato Ativo') statusBadge = '<span class="badge badge-success">CONTRATO ATIVO</span>';
            else if (partner.status_funil === 'Arquivado') statusBadge = '<span class="badge badge-secondary">ARQUIVADO</span>';
            else statusBadge = `<span class="badge badge-warning">${partner.status_funil}</span>`;

            card.innerHTML = `
                <div style="flex-grow:1;">
                    <div class="list-group-item-title">${partner.nome_empresa}</div>
                    <div class="list-group-item-desc">🏷️ Tipo: ${partner.tipo_parceria}</div>
                    <div style="margin-top:8px;">
                        ${activeContract ? `
                            <span style="font-size:11px; color:var(--success);"><i class="fas fa-file-signature"></i> Contrato anexado: ${activeContract.titulo}</span>
                        ` : `
                            <span style="font-size:11px; color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> Nenhum contrato anexado no GED</span>
                        `}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                    ${statusBadge}
                    ${partner.status_funil !== 'Contrato Ativo' ? `
                        <button class="btn btn-secondary btn-activate-partner" data-part-id="${partner.id}" style="padding: 4px 8px; font-size:11px; margin-top:6px; background:var(--success-glow); color:var(--success);">
                            Ativar Parceria
                        </button>
                    ` : ''}
                </div>
            `;
            
            const actBtn = card.querySelector('.btn-activate-partner');
            if (actBtn) {
                actBtn.addEventListener('click', () => {
                    DB_Engine.updatePartnerStatus(partner.id, 'Contrato Ativo');
                });
            }

            partnersList.appendChild(card);
        });

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

    // Event Handler: Upload document link to GED (fixes validation issues for partners - RN-JUR-01)
    document.getElementById('btn-add-document').addEventListener('click', () => {
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

        document.getElementById('doc-title').value = '';
        document.getElementById('doc-url').value = '';
        refreshAllUI();
    });

    // ------------------------------------------------------------------------
    // 4. BOOTSTRAP E RENDERIZADOR TOTAL
    // ------------------------------------------------------------------------
    function refreshAllUI() {
        renderExecutiveDashboard();
        renderEventsModule();
        renderProductsModule();
        renderSportsModule();
        renderFinanceModule();
        renderLegalModule();
    }

    // Startup system
    logSQL('SGBD Iniciado. PostgreSQL v16.1 (Debian) em x86_64-pc-linux-gnu.', 'success');
    logSQL('Executando scripts do schema.sql...', 'success');
    logSQL('Compilando triggers.sql: 7 Regras de Negócio rigidamente asseguradas na camada de dados.', 'success');
    
    refreshAllUI();
});
