// ============================================================================
// PLATAFORMA SAAS DE GESTÃO ESTRATÉGICA - ATLÉTICA UNIVERSITÁRIA
// MIDDLEWARES DE AUTENTICAÇÃO E CONTROLE DE ACESSO RBAC (auth.js)
// ============================================================================

const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Middleware para validar o token JWT de acesso e extrair o usuário da sessão
 */
const protect = (req, res, next) => {
  let token;

  // Verifica se o token foi passado no header Authorization (Bearer Token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      error: 'Erro 401: Acesso negado. Token de autenticação não fornecido no cabeçalho.'
    });
  }

  try {
    // Validação de decodificação do JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Injeta os dados decodificados do usuário na requisição
    req.user = {
      id: decoded.id,
      nome: decoded.nome,
      email: decoded.email,
      cargo: decoded.cargo,      // Master, Diretor, Coordenador, Apoio
      diretoria: decoded.diretoria // Presidência, Tesouraria, Marketing, etc.
    };

    next();
  } catch (err) {
    return res.status(401).json({
      status: 'fail',
      error: 'Erro 401: Token inválido, corrompido ou expirado. Faça login novamente.'
    });
  }
};

/**
 * Middleware para restringir acesso baseado em Cargo (RBAC Nível) e Diretoria (Pasta)
 * 
 * @param {Array<string>} allowedCargos - Lista de cargos autorizados (ex: ['Master', 'Diretor'])
 * @param {Array<string>} allowedDiretorias - Opcional. Lista de pastas/diretorias autorizadas (ex: ['Tesouraria'])
 */
const restrictTo = (allowedCargos = [], allowedDiretorias = []) => {
  return (req, res, next) => {
    // 1. O cargo 'Master' (Presidência Geral) ignora qualquer restrição de pasta e possui acesso pleno
    if (req.user.cargo === 'Master') {
      return next();
    }

    // 2. Valida o Cargo do Usuário
    if (allowedCargos.length > 0 && !allowedCargos.includes(req.user.cargo)) {
      return res.status(403).json({
        status: 'fail',
        error: `Erro 403 (Proibido): Seu cargo '${req.user.cargo}' não possui privilégios para executar esta operação.`
      });
    }

    // 3. Valida a Diretoria (Pasta específica de trabalho)
    if (allowedDiretorias.length > 0 && !allowedDiretorias.includes(req.user.diretoria)) {
      return res.status(403).json({
        status: 'fail',
        error: `Erro 403 (Acesso Restrito): Operação restrita à Diretoria de ${allowedDiretorias.join('/')}. Sua diretoria: ${req.user.diretoria}.`
      });
    }

    next();
  };
};

module.exports = {
  protect,
  restrictTo,
};
