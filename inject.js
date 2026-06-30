const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const replacements = [
    {
        name: 'saveUsuario',
        regex: /saveUsuario:\s*function\(data\)\s*\{[\s\S]*?(?=refreshAllUI\(\);)/,
        inject: `            // Sincroniza com Supabase no background
            if (id) {
                supabase.from('usuarios').upsert({
                    id: data.id, nome: data.nome, email: data.email, cargo: data.cargo, diretoria: data.diretoria, status: data.status, avatar: data.avatar
                }).then(({error}) => { if(error) console.error('Erro DB usuários:', error); });
            } else {
                // Criação por master - tenta usar o Auth no background, sem deslogar
                const tempSupabase = window.supabase.createClient('https://ruytftiztkrkvniqqmjj.supabase.co', 'sb_publishable_70qktfjIX0DcfY2O-YM3Fw_fZbjUkEc', { auth: { persistSession: false, autoRefreshToken: false } });
                tempSupabase.auth.signUp({ email: data.email, password: data.password }).then((res) => {
                    const uid = res.data?.user?.id || newId; // Usa o ID gerado pelo Auth se sucesso
                    supabase.from('usuarios').upsert({
                        id: uid, nome: data.nome, email: data.email, cargo: data.cargo, diretoria: data.diretoria, status: true
                    }).then(({error:e2}) => { if(e2) console.error('Erro DB usuários:', e2); });
                });
            }
            `
    },
    {
        name: 'updateEventStatus',
        regex: /event\.status_aprovacao\s*=\s*newStatus;\s*logSQL\(\`Event status committed: '\$\{oldStatus\}' -> '\$\{newStatus\}'\`,\s*'success'\);/,
        inject: `\n            supabase.from('eventos').update({status_aprovacao: newStatus}).eq('id', eventId).then(({error}) => { if(error) console.error(error); });`
    }
];

replacements.forEach(r => {
    code = code.replace(r.regex, (match) => {
        return match + r.inject;
    });
});

fs.writeFileSync('app.js', code);
console.log('Injecoes no DB_Engine concluidas!');
