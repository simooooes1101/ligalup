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

        // Simula INSERT de Usuário / UPDATE de Usuário (sem exclusão)
        saveUsuario: function(data) {
            const { id, nome, email, password, cargo, diretoria, status } = data;

            if (id) {
                // Edição de usuário existente
                const user = DB.usuarios.find(u => u.id === id);
                if (!user) { alert('Usuário não encontrado!'); return false; }

                logSQL(`UPDATE usuarios SET nome='${nome}', email='${email}', cargo='${cargo}', diretoria='${diretoria}', status=${status} WHERE id='${id}';`, 'query');
                user.nome = nome;
                user.email = email;
                user.cargo = cargo;
                user.diretoria = diretoria;
                user.status = status;
                if (password) {
                    user.senha = password;
                    user.password_hash = `[HASH de '${password}']`;
                }
                logSQL(`Usuário '${nome}' atualizado com sucesso (ID: ${id}). Status: ${status ? 'Ativo' : 'Inativo'}.`, 'success');
            } else {
                // Criação de novo usuário
                const emailExists = DB.usuarios.find(u => u.email === email);
                if (emailExists) {
                    showDBErrorDialog('23505 (Unique Violation)', 'usuarios.email', `O e-mail '${email}' já está em uso por outro membro da diretoria.`);
                    return false;
                }
                if (!password) {
                    alert('É obrigatório definir uma senha para novos usuários!');
                    return false;
                }
                const newId = 'u_' + Date.now();
                DB.usuarios.push({ id: newId, nome, email, cargo, diretoria, status: true, senha: password, password_hash: `[HASH de '${password}']`, avatar: null });
                logSQL(`INSERT INTO usuarios (nome, email, cargo, diretoria, status) VALUES ('${nome}', '${email}', '${cargo}', '${diretoria}', true);`, 'query');
                logSQL(`Novo membro '${nome}' cadastrado com sucesso (ID: ${newId}).`, 'success');

                // Atualiza o seletor RBAC com novo usuário
                const rbacSelect = document.getElementById('user-rbac-select');
                const newOpt = document.createElement('option');
                newOpt.value = newId;
                newOpt.innerText = `${nome} (${cargo} / ${diretoria})`;
                rbacSelect.appendChild(newOpt);
            }

            refreshAllUI();
            return true;
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