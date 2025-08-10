const winston = require('winston');
const express = require('express');

// Mapeamento de cores para tipos de requisição
const queryTypeColors = {
    SELECT: 'green',
    INSERT: 'blue',
    UPDATE: 'yellow',
    DELETE: 'red',
    message: 'green',
    query: 'magenta',
    user: 'blue',
    route: 'green',
    warn: 'red',
    delivery: 'cyan',
    google: 'blue',
    info: 'white'
};

// Função para formatar o body da requisição
const formatRequestBody = (body) => {
    if (body && body.query) {
        // Remove quebras de linha extras e espaços em branco
        body.query = body.query.replace(/\s+/g, ' ').trim();
    }
    return body;
};

// Função para detectar o tipo de consulta SQL
const detectQueryType = (query) => {
    if (!query) return 'Message';
    const firstWord = query.trim().split(' ')[0].toUpperCase();
    return firstWord;
};

// Função para obter timestamp em UTC-3
const getSaoPauloTimestamp = () => {
    const date = new Date();
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
};

// Configuração do Winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'notifications-app-api' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.printf(({ level, message, ...metadata }) => {
                    const timestamp = getSaoPauloTimestamp();
                    const queryType = metadata.body?.query ? detectQueryType(metadata.body.query) : (metadata.type || level);
                    const color = queryTypeColors[queryType] || queryTypeColors[queryType.toLowerCase()] || 'white';
                    const colorCode = color === 'white' ? '37' : 
                                    color === 'green' ? '32' : 
                                    color === 'blue' ? '34' : 
                                    color === 'yellow' ? '33' : 
                                    color === 'magenta' ? '35' : 
                                    '31';
                    return `\x1b[${colorCode}m${queryType}\x1b[0m: ${message} ${JSON.stringify(metadata, null, 2)}`;
                })
            )
        })
    ]
});



// Adiciona método message ao logger
logger.message = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'message' });
};

// Adiciona método query ao logger
logger.query = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'query' });
};

// Adiciona método user ao logger
logger.user = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'user' });
};

// Adiciona método route ao logger
logger.route = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'route' });
};

// Adiciona método task ao logger
logger.task = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'task' });
};

// Adiciona método warn ao logger
const originalWarn = logger.warn;
logger.warn = function (message, metadata = {}) {
    originalWarn.call(this, message, { ...metadata, type: 'warn' });
};

// Adiciona método delivery ao logger
logger.delivery = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'delivery' });
};

// Adiciona método google ao logger
logger.google = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'google' });
};

// Middleware de logging
const loggerMiddleware = (req, res, next) => {
    const start = Date.now();

    // Formata o body antes de fazer o log
    const formattedBody = formatRequestBody(req.body);

    // Log da requisição recebida
    logger.info(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query,
        body: formattedBody,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    // Intercepta o envio da resposta
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        logger.info(`Response ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('content-length') || 0
        });
    });

    next();
};

module.exports = {
    logger,
    loggerMiddleware,
    detectQueryType
};