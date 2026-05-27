// ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// CONFIGURAÇÃO DO POOL DO BANCO DE DADOS POSTGRESQL (db.js)
// ============================================================================

const { Pool } = require('pg');
require('dotenv').config();

// Inicialização do pool de conexões com PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('⚡ PostgreSQL Pool: Nova conexão estabelecida com sucesso.');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL Pool: Erro crítico inesperado de conexão:', err);
});

/**
 * Executa uma query SQL simples sem sessão do usuário (ex: leituras gerais)
 */
const query = (text, params) => pool.query(text, params);

/**
 * Executa uma query ou série de queries dentro de uma transação, associando o ID do usuário
 * logado no banco de dados. Isso garante o funcionamento dos triggers de permissão (ex: RN-EV-01, RN-ESP-01).
 * 
 * @param {string} userId - UUID do usuário logado na requisição (extraído do JWT)
 * @param {string} sqlText - O comando SQL que se deseja rodar
 * @param {Array} params - Vetor de parâmetros para a query preparada
 * @returns {Promise<Object>} Resultado da query
 */
const queryWithSession = async (userId, sqlText, params = []) => {
  const client = await pool.connect();
  try {
    // Inicia transação atômica
    await client.query('BEGIN');

    // Configura a variável local de sessão do PostgreSQL
    // Isso é capturado no Postgres via: current_setting('app.current_user_id')
    if (userId) {
      await client.query('SELECT set_config($1, $2, true);', ['app.current_user_id', userId.toString()]);
    }

    // Executa a query principal do usuário
    const res = await client.query(sqlText, params);

    // Commit da transação
    await client.query('COMMIT');
    return res;
  } catch (error) {
    // Caso de erro ou restrição disparada por trigger (ex: chk_estoque_positivo)
    // Desfaz toda a operação no banco (ROLLBACK)
    await client.query('ROLLBACK');
    console.error('❌ SQL Transaction Error (Rollback disparado):', error.message);
    throw error; // Repassa o erro para o controller formatar
  } finally {
    // Libera a conexão de volta ao pool
    client.release();
  }
};

module.exports = {
  pool,
  query,
  queryWithSession,
};
