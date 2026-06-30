const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const start = code.indexOf('async function updateConnectionStatus() {');
const endMarker = '// --- Autenticação local (fallback sem backend) ---';
const end = code.indexOf(endMarker);

if (start > -1 && end > -1) {
    const newConnStatus = `async function updateConnectionStatus() {
        const badge = document.getElementById('login-db-status');
        if (!badge) return;
        const connBadge = document.getElementById('connection-status-badge');
        
        let online = false;
        if (typeof window.supabase !== 'undefined') {
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

    `;
    code = code.substring(0, start) + newConnStatus + code.substring(end);
    fs.writeFileSync('app.js', code);
    console.log('Fixed Connection Status UI');
} else {
    console.log('Failed to find markers');
}
