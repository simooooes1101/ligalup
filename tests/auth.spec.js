// tests/auth.spec.js
// PASSO 2 — Testes de Autenticação (Login / Logout)
//
// Objetivo: Validar os fluxos de sucesso, falha e validação de inputs vazios no formulário de login.
// Todas as rotas do Supabase (Autenticação e Sincronização de tabelas) são 100% mockadas no nível de rede.
// Para máxima performance e execução 100% offline, os recursos de CDN e fontes externas são interceptados e mockados localmente.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Carrega os dados de mock locais (fixture de banco de dados)
const mockDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'mocks/db.json'), 'utf8'));

// Seletores do formulário de login e tela principal
const SELECTORS = {
  emailInput: '#login-email',
  passwordInput: '#login-password',
  loginButton: '#btn-login',
  errorLabel: '#login-error',
  appWrapper: '#app-wrapper',
};

test.describe('Testes de Autenticação — Login', () => {

  // Setup executado antes de cada caso de teste
  test.beforeEach(async ({ page }) => {
    // 1. Mock do arquivo JavaScript do Supabase.
    // Intercepta a CDN jsdelivr e devolve a biblioteca instalada localmente no node_modules.
    // Isso evita timeouts de rede lenta e permite testes offline rápidos.
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', async (route) => {
      const localPath = path.join(__dirname, '../node_modules/@supabase/supabase-js/dist/umd/supabase.js');
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: fs.readFileSync(localPath, 'utf8'),
      });
    });

    // 2. Mock de recursos de terceiros (Font Awesome e Google Fonts).
    // Devolve CSS vazio para evitar que o navegador trave na carga de ativos secundários.
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });

    await page.route('https://fonts.googleapis.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });

    await page.route('https://fonts.gstatic.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });

    // 3. Mock da API REST de sincronização (syncDBFromSupabase)
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      const tableName = url.split('/rest/v1/')[1]?.split('?')[0];

      if (tableName && mockDb[tableName]) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDb[tableName]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });
  });

  test('01 — Login bem-sucedido com Supabase Auth e transição para o painel principal', async ({ page }) => {
    // Mock do endpoint de autenticação do Supabase (Retorna Token 200)
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-jwt-token-abcdef',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token-123456',
          user: {
            id: 'test-user-presidencia-001', // UUID correspondente ao Ed Carlos no db.json
            email: 'presidencia@atleticalup.com.br',
            email_confirmed_at: new Date().toISOString(),
          }
        }),
      });
    });

    // Navega
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Preenche credenciais corretas
    await page.fill(SELECTORS.emailInput, 'presidencia@atleticalup.com.br');
    await page.fill(SELECTORS.passwordInput, 'lup123_strategy');

    // Clica em enviar
    await page.click(SELECTORS.loginButton);

    // Assert: O painel principal do app deve se tornar visível
    const appWrapper = page.locator(SELECTORS.appWrapper);
    await expect(appWrapper).toBeVisible();

    // Assert: A tela de login deve sumir
    const loginScreen = page.locator('#login-screen');
    await expect(loginScreen).toBeHidden();
  });

  test('02 — Falha no login por credenciais incorretas exibe mensagem amigável de erro', async ({ page }) => {
    // Mock do endpoint do Supabase retornando erro 400 (Bad Request)
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'E-mail ou senha inválidos no Supabase.'
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Preenche credenciais inválidas que também farão a lógica de fallback (localAuth) falhar
    await page.fill(SELECTORS.emailInput, 'inexistente@atleticalup.com.br');
    await page.fill(SELECTORS.passwordInput, 'senha_errada');

    await page.click(SELECTORS.loginButton);

    // Assert: O elemento de erro deve se tornar visível e conter a mensagem de erro
    const errorLabel = page.locator(SELECTORS.errorLabel);
    await expect(errorLabel).toBeVisible();
    await expect(errorLabel).toHaveText(/E-mail ou senha inválidos/i);

    // Assert: O painel do app deve permanecer oculto
    const appWrapper = page.locator(SELECTORS.appWrapper);
    await expect(appWrapper).toBeHidden();
  });

  test('03 — Tentativa de submissão com campos vazios (Auditoria: novalidate ativo chama a API)', async ({ page }) => {
    let apiCalled = false;

    // Monitora se o endpoint de autenticação foi invocado
    await page.route('**/auth/v1/token*', async (route) => {
      apiCalled = true;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_request',
          error_description: 'E-mail ou senha inválidos no Supabase.'
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Clica diretamente no login com campos vazios
    await page.click(SELECTORS.loginButton);

    // NOTA DE AUDITORIA:
    // O formulário de login no index.html possui o atributo 'novalidate', o que desabilita 
    // a validação nativa de HTML5 (required). Além disso, a função submit em app.js não realiza
    // validação prévia de strings vazias, disparando a requisição de rede.
    // Portanto, o teste espera que a API seja chamada (apiCalled === true) e que a UI exiba o erro correspondente.
    expect(apiCalled).toBe(true);

    // Assert: O elemento de erro deve se tornar visível
    const errorLabel = page.locator(SELECTORS.errorLabel);
    await expect(errorLabel).toBeVisible();
    await expect(errorLabel).toHaveText(/E-mail ou senha inválidos/i);

    // Assert: O painel principal do app deve continuar oculto
    const appWrapper = page.locator(SELECTORS.appWrapper);
    await expect(appWrapper).toBeHidden();
  });

});
