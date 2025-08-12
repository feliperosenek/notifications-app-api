require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger, loggerMiddleware } = require('./middleware/logger');

// Configuração do servidor
const app = express();
const server = require('http').createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de logging global
app.use(loggerMiddleware);

// Configuração do banco de dados
const sequelize = require('./config/database');

// Disponibilizar sequelize para as rotas e middlewares
app.set('sequelize', sequelize);

// Rota raiz para capturar callbacks do Google OAuth que vêm para "/"
app.get('/', (req, res) => {
    const { code, state, scope, error, error_description } = req.query;
    
    // Se tem parâmetros do Google OAuth, redirecionar para o callback correto
    if (code || error) {
        logger.info('🔄 Redirecionando callback do Google de / para /auth/google-callback', {
            hasCode: !!code,
            hasError: !!error,
            state,
            codePreview: code ? code.substring(0, 20) + '...' : null
        });
        
        // Redirecionar mantendo os parâmetros
        const queryString = new URLSearchParams(req.query).toString();
        return res.redirect(`/auth/google-callback?${queryString}`);
    }
    
    // Página inicial simples
    res.send(`
        <html>
            <head>
                <title>Notifications API</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .api-info { background: #e3f2fd; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .endpoint { background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔔 Notifications API</h1>
                    <p>API de notificações com suporte a Google OAuth 2.0</p>
                    
                    <div class="api-info">
                        <h3>📋 Endpoints Disponíveis:</h3>
                        <div class="endpoint">POST /auth/login - Login tradicional</div>
                        <div class="endpoint">POST /auth/create-user - Criar usuário</div>
                        <div class="endpoint">POST /auth/google-login - Login com Google</div>
                        <div class="endpoint">GET /auth/google-callback - Callback Google OAuth</div>
                        <div class="endpoint">POST /auth/verify-token - Verificar JWT</div>
                        <div class="endpoint">POST /auth/refresh-token - Renovar JWT</div>
                        <div class="endpoint">POST /auth/logout - Logout</div>
                        
                        <h4>📧 Endpoints de Email:</h4>
                        <div class="endpoint">POST /email/request-local-password - Solicitar definição de senha</div>
                        <div class="endpoint">POST /email/request-password-reset - Solicitar redefinição de senha</div>
                        <div class="endpoint">POST /email/set-password - Definir nova senha</div>
                        <div class="endpoint">POST /email/reset-password - Redefinir senha</div>
                        <div class="endpoint">GET /email/verify-token - Verificar validade do token</div>
                    </div>
                    
                    <p><small>Status: ✅ Online | Logs: ✅ Ativos</small></p>
                </div>
            </body>
        </html>
    `);
});

// Rotas
app.use('/send-message', require('./routes/sendMessage'));
app.use('/send-image', require('./routes/sendMessage')); // Novo endpoint para imagens
app.use('/send-audio', require('./routes/sendMessage')); // Novo endpoint para áudio
app.use('/messages', require('./routes/messages'));
app.use('/tokens', require('./routes/tokens'));
app.use('/webhook', require('./routes/webhooks'));
app.use('/sse', require('./routes/sse').router);
app.use('/routes', require('./routes/routes')(sequelize));
// Rotas existentes...
app.use('/auth', require('./routes/auth'));
app.use('/email', require('./routes/email')); // Rotas de email para definição/redefinição de senha
app.use('/tasks', require('./routes/tasks'));
app.use('/database', require('./routes/database')(sequelize));

// Tratamento de erros
app.use((error, req, res, next) => {
    logger.error('Erro não tratado', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });

    res.status(500).json({
        error: 'Erro interno do servidor'
    });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Servidor iniciado na porta ${PORT}`);
    logger.info('Sistema de notificações com FCM nativo ativo');
    logger.info('Novos endpoints implementados: /send-image, /send-audio');
});

module.exports = { app, server, sequelize }; 