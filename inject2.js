const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const replacements = [
    {
        regex: /saveProduct:\s*function\(prod\)\s*\{[\s\S]*?(?=refreshAllUI\(\);)/,
        inject: `            supabase.from('produtos').upsert({
                id: prod.id, nome: prod.nome, preco_custo: prod.preco_custo, 
                preco_venda: prod.preco_venda, tipo_produto: prod.tipo_produto, categoria_servico: prod.categoria_servico
            }).then(({error}) => { if(error) console.error('Erro ao salvar produto no Supabase:', error); });\n            `
    },
    {
        regex: /deleteProduct:\s*function\(id\)\s*\{[\s\S]*?DB\.produtos\.splice\(idx,\s*1\);/,
        inject: `\n            supabase.from('produtos').delete().eq('id', id).then(({error}) => { if(error) console.error('Erro ao excluir produto:', error); });`
    },
    {
        regex: /saveVariant:\s*function\(vari\)\s*\{[\s\S]*?(?=refreshAllUI\(\);)/,
        inject: `            supabase.from('produto_variantes').upsert({
                id: vari.id, produto_id: vari.produto_id, tamanho: vari.tamanho, estoque_atual: vari.estoque_atual
            }).then(({error}) => { if(error) console.error('Erro ao salvar variante:', error); });\n            `
    },
    {
        regex: /mutateProductStock:\s*function\(variantId,\s*amount\)\s*\{[\s\S]*?v\.estoque_atual\s*\+=\s*amount;/,
        inject: `\n            supabase.from('produto_variantes').update({estoque_atual: v.estoque_atual}).eq('id', variantId).then(({error}) => { if(error) console.error('Erro ao atualizar estoque:', error); });`
    },
    {
        regex: /mutateFinanceRecord:\s*function\(record,\s*action\s*=\s*'insert'\s*\|\|\s*'update'\)\s*\{[\s\S]*?(?=refreshAllUI\(\);)/,
        inject: `            supabase.from('lancamentos_financeiros').upsert({
                id: record.id, tipo: record.tipo, categoria: record.categoria, valor: record.valor,
                data_competencia: record.data_competencia, status_conciliacao: record.status_conciliacao,
                evento_id: record.evento_id, produto_id: record.produto_id
            }).then(({error}) => { if(error) console.error('Erro ao salvar lancamento:', error); });\n            `
    },
    {
        regex: /deleteFinanceRecord:\s*function\(id\)\s*\{[\s\S]*?DB\.lancamentos_financeiros\.splice\(idx,\s*1\);/,
        inject: `\n            supabase.from('lancamentos_financeiros').delete().eq('id', id).then(({error}) => { if(error) console.error('Erro ao excluir lancamento:', error); });`
    },
    {
        regex: /mutateEvent:\s*function\(evt,\s*action\)\s*\{[\s\S]*?(?=refreshAllUI\(\);)/,
        inject: `            supabase.from('eventos').upsert({
                id: evt.id, nome: evt.nome, tipo: evt.tipo, data_evento: evt.data_evento, local: evt.local,
                orcamento_previsto: evt.orcamento_previsto, status_aprovacao: evt.status_aprovacao, 
                valor_taxa_base: evt.valor_taxa_base, criador_id: evt.criador_id
            }).then(({error}) => { if(error) console.error('Erro ao salvar evento:', error); });\n            `
    },
    {
        regex: /deleteLog:\s*function\(id\)\s*\{[\s\S]*?DB\.logs_notificacoes\.splice\(idx,\s*1\);/,
        inject: `\n            supabase.from('logs_notificacoes').delete().eq('id', id).then(({error}) => { if(error) console.error('Erro ao excluir log:', error); });`
    }
];

replacements.forEach(r => {
    code = code.replace(r.regex, (match) => {
        return match + r.inject;
    });
});

fs.writeFileSync('app.js', code);
console.log('Injecoes 2 concluidas!');
