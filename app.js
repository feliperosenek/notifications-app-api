require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./middleware/logger');

// Configuração do servidor
const app = express();
const server = require('http').createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());

// Configuração do banco de dados
const sequelize = require('./config/database');

// Disponibilizar sequelize para as rotas e middlewares
app.set('sequelize', sequelize);

// Rotas
app.use('/send-message', require('./routes/sendMessage'));
app.use('/messages', require('./routes/messages'));
app.use('/tokens', require('./routes/tokens'));
app.use('/webhook', require('./routes/webhooks'));
app.use('/sse', require('./routes/sse').router);

// Rotas existentes...
app.use('/auth', require('./routes/auth'));
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
});

module.exports = { app, server, sequelize }; 