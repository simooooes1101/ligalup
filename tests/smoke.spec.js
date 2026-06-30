// tests/smoke.spec.js
// PASSO 1 — Teste de Fumaça (Smoke Test)
//
// Objetivo: verificar que a infraestrutura básica de testes está funcional.
// Valida apenas o carregamento inicial da aplicação sem qualquer interação do usuário.
// NÃO modifica nenhum arquivo de produção.

const { test, expect } = require('@playwright/test');

// ─── Constantes de Seletores ──────────────────────────────────────────────────
// Centralizamos os IDs aqui para facilitar manutenção futura.
// Se um ID mudar no index.html, ajustamos apenas neste local.
const SELECTORS = {
  loginScreen:   '#login-screen',
  loginForm:     '#login-form',
  emailInput:    '#login-email',
  passwordInput: '#login-password',
  loginButton:   '#btn-login',
};

// ─── Smoke Test Suite ─────────────────────────────────────────────────────────
test.describe('Smoke Test — Carregamento Inicial', () => {

  test('01 — A página carrega e tem o título correto', async ({ page }) => {
    // waitUntil: 'domcontentloaded' evita aguardar recursos externos (CDN Supabase,
    // Font Awesome, Google Fonts) que podem bloquear o evento 'load' por >30s.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Valida que o título da aba corresponde ao definido no index.html
    await expect(page).toHaveTitle('Atlética LUP — Plataforma de Gestão Estratégica');
  });

  test('02 — A tela de login está visível na carga inicial', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // A tela de login (#login-screen) deve estar visível por padrão
    const loginScreen = page.locator(SELECTORS.loginScreen);
    await expect(loginScreen).toBeVisible();
  });

  test('03 — O formulário de login possui os campos obrigatórios', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Valida a existência e visibilidade dos três elementos essenciais do formulário
    await expect(page.locator(SELECTORS.emailInput)).toBeVisible();
    await expect(page.locator(SELECTORS.passwordInput)).toBeVisible();
    await expect(page.locator(SELECTORS.loginButton)).toBeVisible();
  });

  test('04 — O painel principal (app-wrapper) está oculto antes do login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Antes do login, o painel da aplicação não deve estar visível para o usuário
    const appWrapper = page.locator('#app-wrapper');
    await expect(appWrapper).toBeHidden();
  });

});
