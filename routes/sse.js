const express = require('express');
const router = express.Router();
const { logger } = require('../middleware/logger');

// Armazenar conexões SSE por rota
const sseClients = new Map();

/**
 * GET /sse/:route
 * Estabelece conexão SSE para receber notificações de novas mensagens
 */
router.get('/:route', (req, res) => {
    const { route } = req.params;
    
    logger.message('Nova conexão SSE estabelecida', {
        route,
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });

    // Configurar headers para SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Enviar mensagem inicial de conexão
    res.write(`data: ${JSON.stringify({
        type: 'connection',
        message: 'Conexão SSE estabelecida',
        route,
        timestamp: new Date().toISOString()
    })}\n\n`);

    // Enviar heartbeat a cada 30 segundos para manter conexão ativa
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
        })}\n\n`);
    }, 30000);

    // Gerar ID único para este cliente
    const clientId = `${route}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Armazenar conexão
    if (!sseClients.has(route)) {
        sseClients.set(route, new Map());
    }
    sseClients.get(route).set(clientId, res);

    logger.message('Cliente SSE registrado', {
        route,
        clientId,
        totalClientsForRoute: sseClients.get(route).size,
        totalRoutes: sseClients.size
    });

    // Limpar quando cliente desconectar
    req.on('close', () => {
        clearInterval(heartbeat);
        
        const routeClients = sseClients.get(route);
        if (routeClients) {
            routeClients.delete(clientId);
            
            // Remover rota se não há mais clientes
            if (routeClients.size === 0) {
                sseClients.delete(route);
            }
        }

        logger.message('Cliente SSE desconectado', {
            route,
            clientId,
            remainingClientsForRoute: routeClients ? routeClients.size : 0,
            totalRoutes: sseClients.size
        });
    });

    // Tratar erros
    req.on('error', (error) => {
        logger.error('Erro na conexão SSE', {
            error: error.message,
            route,
            clientId
        });
        clearInterval(heartbeat);
    });
});

/**
 * Função para enviar notificação de nova mensagem para todos os clientes de uma rota
 */
function sendMessageNotification(route, messageData) {
    const routeClients = sseClients.get(route);
    
    if (!routeClients || routeClients.size === 0) {
        logger.message('Nenhum cliente SSE conectado para rota', {
            route,
            messageId: messageData.id
        });
        return {
            success: false,
            clientsCount: 0,
            message: 'Nenhum cliente SSE conectado'
        };
    }

    const notification = {
        type: 'new-message',
        message: 'Nova mensagem disponível',
        route,
        messageId: messageData.id,
        timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    const failedClients = [];

    routeClients.forEach((client, clientId) => {
        try {
            client.write(`data: ${JSON.stringify(notification)}\n\n`);
            sentCount++;
        } catch (error) {
            logger.error('Erro ao enviar notificação SSE', {
                error: error.message,
                route,
                clientId,
                messageId: messageData.id
            });
            failedClients.push(clientId);
        }
    });

    // Remover clientes que falharam
    failedClients.forEach(clientId => {
        routeClients.delete(clientId);
    });

    logger.message('Notificação SSE enviada', {
        route,
        messageId: messageData.id,
        sentCount,
        failedCount: failedClients.length,
        totalClients: routeClients.size
    });

    return {
        success: sentCount > 0,
        clientsCount: sentCount,
        failedCount: failedClients.length,
        message: `Notificação enviada para ${sentCount} clientes`
    };
}

/**
 * GET /sse/status
 * Endpoint para verificar status das conexões SSE
 */
router.get('/status/connections', (req, res) => {
    const status = {
        totalRoutes: sseClients.size,
        totalClients: 0,
        routes: {}
    };

    sseClients.forEach((clients, route) => {
        status.routes[route] = {
            clientsCount: clients.size,
            clientIds: Array.from(clients.keys())
        };
        status.totalClients += clients.size;
    });

    res.json({
        success: true,
        status,
        timestamp: new Date().toISOString()
    });
});

module.exports = { router, sendMessageNotification }; 