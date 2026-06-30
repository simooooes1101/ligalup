const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// 1. Update the alert message
const oldAlert = "alert(`Usuário ${nome} criado com sucesso!\\n\\nEle já aparece na tabela abaixo.\\n\\nO acesso ao sistema será liberado em instantes via sincronização com o Supabase.`);";
const newAlert = "alert(`Usuário ${nome} criado com sucesso!\\n\\nEle já aparece na tabela abaixo.\\n\\nAguarde 1 minuto para realizar o login com este novo acesso.`);";
if (code.includes(oldAlert)) {
    code = code.replace(oldAlert, newAlert);
    console.log("Alert updated successfully.");
} else {
    console.log("Could not find the old alert.");
}

// 2. Update button text
const oldBtn = "'<i class=\"fas fa-save\"></i> Salvar Membro (Gravar no Supabase)'";
const newBtn = "'<i class=\"fas fa-save\"></i> Salvar Membro'";
code = code.split(oldBtn).join(newBtn);

// 3. Update connection status badges logic
// First, find the whole block for checkBackend and updateConnectionStatus
const newCheckLogic = `
        let online = false;
        if (typeof window.supabase !== 'undefined') {
            online = true;
        }

        if (online) {
            if (badge) {
                badge.style.display = 'none'; // Esconde da tela de login
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
        }`;

// Replace inside updateConnectionStatus
const startUpdate = code.indexOf('async function updateConnectionStatus() {');
if (startUpdate > -1) {
    const endUpdate = code.indexOf('}', code.indexOf('} else {', startUpdate)) + 1;
    if (endUpdate > startUpdate) {
        const block = code.substring(startUpdate, endUpdate);
        const startInner = block.indexOf('let online = false;');
        if (startInner > -1) {
            const head = block.substring(0, startInner);
            code = code.replace(block, head + newCheckLogic.trim());
            console.log("updateConnectionStatus updated.");
        }
    }
}

// Replace inside checkBackend
const startCheck = code.indexOf('async function checkBackend() {');
if (startCheck > -1) {
    const endCheck = code.indexOf('}', code.indexOf('} else {', startCheck)) + 1;
    if (endCheck > startCheck) {
        const block = code.substring(startCheck, endCheck);
        const startInner = block.indexOf('let online = false;');
        if (startInner > -1) {
            const head = block.substring(0, startInner);
            code = code.replace(block, head + newCheckLogic.trim());
            console.log("checkBackend updated.");
        }
    }
}

fs.writeFileSync('app.js', code);
console.log('App.js patched successfully for UI changes.');
