const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Fix 1: Show Success Message and Alert on User Creation
const userCreationStart = code.indexOf(`logSQL(\`Novo membro '\${nome}' cadastrado com sucesso (ID: \${newId}).\`, 'success');`);
if (userCreationStart > -1) {
    const alertCode = `\n                alert(\`Usuário \${nome} criado com sucesso!\\n\\nEle já aparece na tabela abaixo.\\n\\nO acesso ao sistema será liberado em instantes via sincronização com o Supabase.\`);\n`;
    // Only insert if it doesn't exist
    if (!code.includes('Usuário ${nome} criado com sucesso')) {
        code = code.substring(0, userCreationStart + 86) + alertCode + code.substring(userCreationStart + 86);
        console.log('Added success alert for user creation');
    }
}

// Fix 2: Update tempSupabase to use dynamic variables
const tempSupabaseStr = "const tempSupabase = window.supabase.createClient('https://ruytftiztkrkvniqqmjj.supabase.co', 'sb_publishable_70qktfjIX0DcfY2O-YM3Fw_fZbjUkEc'";
const tempSupabaseRepl = "const tempSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY";
if (code.includes(tempSupabaseStr)) {
    code = code.replace(tempSupabaseStr, tempSupabaseRepl);
    console.log('Fixed tempSupabase hardcoded URL');
}

// Fix 3: Fix Connection Status Badge
const connStatusRegex = /async function updateConnectionStatus\(\) \{[\s\S]*?\}\n\n    \/\/ --- Autenticação local/;
const newConnStatus = `async function updateConnectionStatus() {
        const badge = document.getElementById('login-db-status');
        if (!badge) return;
        const connBadge = document.getElementById('connection-status-badge');
        
        let online = false;
        if (typeof window.supabase !== 'undefined' && window.supabaseUrl) {
            online = true;
        }

        if (online) {
            badge.className = 'login-status-badge online';
            badge.innerHTML = '<i class="fas fa-circle"></i> Supabase Conectado';
            if (connBadge) {
                connBadge.className = 'badge';
                connBadge.style.cssText = 'padding:8px 12px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);';
                connBadge.innerHTML = '<i class="fas fa-database"></i> Banco Supabase Ativo';
            }
        } else {
            badge.className = 'login-status-badge offline';
            badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Banco Local (Simulado)';
            if (connBadge) {
                connBadge.className = 'badge badge-secondary';
                connBadge.style.cssText = 'padding:8px 12px;';
                connBadge.innerHTML = '<i class="fas fa-flask"></i> Ambiente Simulado';
            }
        }
    }

    // --- Autenticação local`;

if (connStatusRegex.test(code)) {
    code = code.replace(connStatusRegex, newConnStatus);
    console.log('Fixed Connection Status UI');
}

fs.writeFileSync('app.js', code);
console.log('App.js patched for User Creation and Connection Status.');
