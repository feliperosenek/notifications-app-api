const { logger } = require('./logger');

// Armazenamento em memória para rate limiting
// Em produção, considere usar Redis ou similar
const rateLimitStore = new Map();

/**
 * Middleware de rate limiting para rotas de email
 * @param {Object} options - Opções de configuração
 * @param {number} options.maxRequests - Máximo de requisições permitidas
 * @param {number} options.windowMs - Janela de tempo em milissegundos
 * @param {string} options.keyGenerator - Função para gerar chave única (email ou IP)
 * @returns {Function} Middleware Express
 */
function createRateLimiter(options = {}) {
    const {
        maxRequests = 3,
        windowMs = 60 * 60 * 1000, // 1 hora por padrão
        keyGenerator = 'email'
    } = options;

    return (req, res, next) => {
        try {
            let key;
            
            if (keyGenerator === 'email') {
                // Rate limiting por email
                const { email } = req.body;
                if (!email) {
                    return res.status(400).json({ error: 'Email é obrigatório para esta rota' });
                }
                key = `email:${email}`;
            } else {
                // Rate limiting por IP
                key = `ip:${req.ip || req.connection.remoteAddress}`;
            }

            const now = Date.now();
            const windowStart = now - windowMs;

            // Limpar registros antigos
            if (rateLimitStore.has(key)) {
                const requests = rateLimitStore.get(key).filter(timestamp => timestamp > windowStart);
                rateLimitStore.set(key, requests);
            }

            // Verificar se excedeu o limite
            if (rateLimitStore.has(key) && rateLimitStore.get(key).length >= maxRequests) {
                const oldestRequest = rateLimitStore.get(key)[0];
                const timeToReset = Math.ceil((oldestRequest + windowMs - now) / 1000);

                logger.warn('Rate limit excedido', {
                    key,
                    maxRequests,
                    windowMs,
                    timeToReset,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });

                return res.status(429).json({
                    error: 'Muitas tentativas. Tente novamente mais tarde.',
                    retryAfter: timeToReset
                });
            }

            // Adicionar nova requisição
            if (!rateLimitStore.has(key)) {
                rateLimitStore.set(key, []);
            }
            rateLimitStore.get(key).push(now);

            // Adicionar headers de rate limit
            const remaining = Math.max(0, maxRequests - rateLimitStore.get(key).length);
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': remaining,
                'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
            });

            next();
        } catch (error) {
            logger.error('Erro no rate limiter', { error: error.message });
            next();
        }
    };
}

/**
 * Rate limiter específico para rotas de email (3 por hora por email)
 */
const emailRateLimiter = createRateLimiter({
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hora
    keyGenerator: 'email'
});

/**
 * Rate limiter para IP (10 por hora por IP)
 */
const ipRateLimiter = createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hora
    keyGenerator: 'ip'
});

/**
 * Rate limiter combinado (aplica ambos os limites)
 */
const combinedRateLimiter = (req, res, next) => {
    // Primeiro aplica o limite por IP
    ipRateLimiter(req, res, (err) => {
        if (err) return next(err);
        
        // Depois aplica o limite por email
        emailRateLimiter(req, res, next);
    });
};

module.exports = {
    createRateLimiter,
    emailRateLimiter,
    ipRateLimiter,
    combinedRateLimiter
};
