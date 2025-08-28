const winston = require('winston');
const express = require('express');
const fs = require('fs');
const path = require('path');

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

// Função para criar nome único do arquivo de erro
const createErrorFileName = (error, metadata = {}) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const messageId = metadata.messageId || metadata.message_id || 'unknown';
    const username = metadata.username || metadata.user || metadata.route || 'unknown';
    const errorType = error?.name || 'Error';
    
    // Sanitiza o nome do arquivo
    const sanitizedUsername = username.toString().replace(/[^a-zA-Z0-9-_]/g, '_');
    const sanitizedErrorType = errorType.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    return `error_${messageId}_${sanitizedUsername}_${sanitizedErrorType}_${timestamp}.log`;
};

// Função para escrever erro em arquivo separado
const writeErrorToFile = (error, metadata = {}) => {
    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const fileName = createErrorFileName(error, metadata);
        const filePath = path.join(logsDir, fileName);
        
        const timestamp = getSaoPauloTimestamp();
        const errorInfo = {
            timestamp: timestamp,
            error: {
                name: error?.name || 'UnknownError',
                message: error?.message || 'No error message',
                stack: error?.stack || 'No stack trace',
                code: error?.code || null
            },
            metadata: {
                ...metadata,
                // Prioriza informações de mensagem e usuário
                messageId: metadata.messageId || metadata.message_id || null,
                username: metadata.username || metadata.user || metadata.route || null,
                userId: metadata.userId || metadata.user_id || null,
                route: metadata.route || null,
                platform: metadata.platform || null,
                fcmToken: metadata.token ? `${metadata.token.substring(0, 20)}...` : null
            },
            context: {
                service: 'notifications-app-api',
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
            }
        };

        const logContent = JSON.stringify(errorInfo, null, 2);
        fs.writeFileSync(filePath, logContent, 'utf8');
        
        return fileName;
    } catch (writeError) {
        console.error('Erro ao escrever arquivo de log:', writeError);
        return null;
    }
};

// Configuração do Winston - mantém logs de info mas cria arquivos separados para erros
const logger = winston.createLogger({
    level: 'info', // Mantém logs de informação
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
        // Apenas console para logs de informação
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

// Sobrescreve o método error para criar arquivo separado
const originalError = logger.error;
logger.error = function (message, metadata = {}) {
    // Se metadata contém um erro, extrai informações
    let error = null;
    if (metadata.error) {
        error = metadata.error;
    } else if (metadata.stack) {
        error = { message: metadata.message || message, stack: metadata.stack };
    } else if (metadata instanceof Error) {
        error = metadata;
    } else {
        error = { message: message, stack: new Error().stack };
    }

    // Cria arquivo separado para o erro
    const fileName = writeErrorToFile(error, metadata);
    
    // Loga no console
    originalError.call(this, message, metadata);
    
    // Retorna o nome do arquivo criado para referência
    return fileName;
};

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

// Adiciona método warning ao logger (alias para warn)
logger.warning = function (message, metadata = {}) {
    this.warn(message, { ...metadata, type: 'warning' });
};

// Adiciona método delivery ao logger
logger.delivery = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'delivery' });
};

// Adiciona método google ao logger
logger.google = function (message, metadata = {}) {
    this.info(message, { ...metadata, type: 'google' });
};

// Adiciona método para logs livres sem formatação
logger.free = function (message, metadata = {}) {
    // Log direto no console sem formatação Winston
    console.log(`[FREE LOG] ${message}`, metadata);
};

// Adiciona método raw para logs completamente brutos
logger.raw = function (message, metadata = {}) {
    // Log direto no console sem nenhuma formatação
    console.log(message, metadata);
};

// Middleware de logging
const loggerMiddleware = (req, res, next) => {
    const start = Date.now();

    // Filtrar endpoints que não devem ser logados para evitar spam
    const shouldSkipLogging = (path) => {
        const skipPatterns = [
            /^\/get-messages\/\d+$/,  // Endpoints de get-messages com ID
            /^\/sse\/.+$/,            // Conexões SSE
            /^\/messages\/get-messages\/\d+$/,  // Endpoints de mensagens com ID
            /^\/send-message$/,       // Endpoint de envio de mensagens
            /^\/send-image$/,         // Endpoint de envio de imagem
            /^\/send-audio$/          // Endpoint de envio de áudio
        ];
        
        return skipPatterns.some(pattern => pattern.test(path));
    };

    // Formata o body antes de fazer o log
    const formattedBody = formatRequestBody(req.body);

    // Log da requisição recebida (apenas para endpoints não filtrados)
    if (!shouldSkipLogging(req.path)) {
        logger.info(`${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            query: req.query,
            body: formattedBody,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
    }

    // Intercepta o envio da resposta
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // Log da resposta (apenas para endpoints não filtrados)
        if (!shouldSkipLogging(req.path)) {
            logger.info(`Response ${req.method} ${req.path}`, {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                contentLength: res.get('content-length') || 0
            });
        }
    });

    next();
};

module.exports = {
    logger,
    loggerMiddleware,
    detectQueryType,
    writeErrorToFile
};