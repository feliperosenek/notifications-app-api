const express = require('express');
const router = express.Router();
const { logger } = require('../middleware/logger');
const FCMService = require('../services/fcmService');
const sequelize = require('../config/database');

/**
 * POST /webhook/send-message
 * WebHook para envio de notificações por sistemas externos
 */
router.post('/send-message', async (req, res) => {
    try {
        // Validação de autenticação do WebHook
        const webhookSecret = req.headers['x-webhook-secret'];
        if (!webhookSecret || webhookSecret !== process.env.WEBHOOK_SECRET) {
            return res.status(401).json({
                error: 'WebHook não autorizado'
            });
        }

        const { 
            message, 
            category, 
            route, 
            type = 'info', 
            channel = 'default', 
            content, 
            custom_attributes,
            priority = 'normal' // normal, high, urgent
        } = req.body;

        // Validação
        if (!message || !category || !route) {
            return res.status(400).json({
                error: 'Campos obrigatórios ausentes: message, category, route'
            });
        }

        // Buscar usuário
        const [userResult] = await sequelize.query(
            `SELECT id, fcm_token, token_notification_android, token_notification_web 
             FROM users WHERE route = :route`,
            { replacements: { route } }
        );

        if (userResult.length === 0) {
            return res.status(404).json({
                error: 'Usuário não encontrado'
            });
        }

        const user = userResult[0];

        // Inserir mensagem no banco
        const [insertResult] = await sequelize.query(
            `INSERT INTO messages (
                message, type, category, route, channel, content, 
                custom_attributes, user_id, datetime, status
            ) VALUES (
                :message, :type, :category, :route, :channel, :content,
                :custom_attributes, :user_id, NOW(), 'active'
            ) RETURNING *`,
            {
                replacements: {
                    message,
                    type,
                    category,
                    route,
                    channel,
                    content: content || '',
                    custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null,
                    user_id: user.id
                }
            }
        );

        const insertedMessage = insertResult[0];

        // Enviar notificação via FCM (prioridade para WebHooks)
        let deliveryResult = null;
        
        if (user.fcm_token && FCMService.isValidToken(user.fcm_token)) {
            deliveryResult = await FCMService.sendPushNotification(user.fcm_token, insertedMessage);
        }

        logger.message('WebHook processado', {
            messageId: insertedMessage.id,
            route,
            priority,
            deliveryResult
        });

        res.json({
            success: true,
            message: 'WebHook processado com sucesso',
            messageId: insertedMessage.id,
            delivery: deliveryResult
        });

    } catch (error) {
        logger.error('Erro ao processar WebHook', {
            error: error.message,
            body: req.body,
            headers: req.headers
        });

        res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * POST /webhook/bulk-send
 * WebHook para envio em massa
 */
router.post('/bulk-send', async (req, res) => {
    try {
        // Validação de autenticação
        const webhookSecret = req.headers['x-webhook-secret'];
        if (!webhookSecret || webhookSecret !== process.env.WEBHOOK_SECRET) {
            return res.status(401).json({
                error: 'WebHook não autorizado'
            });
        }

        const { messages } = req.body;

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: 'Array de mensagens é obrigatório'
            });
        }

        const results = [];

        for (const messageData of messages) {
            try {
                const { message, category, route, type = 'info', content, custom_attributes } = messageData;

                if (!message || !category || !route) {
                    results.push({
                        success: false,
                        error: 'Campos obrigatórios ausentes',
                        data: messageData
                    });
                    continue;
                }

                // Buscar usuário
                const [userResult] = await sequelize.query(
                    `SELECT id, fcm_token FROM users WHERE route = :route`,
                    { replacements: { route } }
                );

                if (userResult.length === 0) {
                    results.push({
                        success: false,
                        error: 'Usuário não encontrado',
                        route
                    });
                    continue;
                }

                const user = userResult[0];

                // Inserir mensagem
                const [insertResult] = await sequelize.query(
                    `INSERT INTO messages (
                        message, type, category, route, channel, content, 
                        custom_attributes, user_id, datetime, status
                    ) VALUES (
                        :message, :type, :category, :route, 'default', :content,
                        :custom_attributes, :user_id, NOW(), 'active'
                    ) RETURNING *`,
                    {
                        replacements: {
                            message,
                            type,
                            category,
                            route,
                            content: content || '',
                            custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null,
                            user_id: user.id
                        }
                    }
                );

                const insertedMessage = insertResult[0];

                // Enviar FCM
                let deliveryResult = null;
                if (user.fcm_token && FCMService.isValidToken(user.fcm_token)) {
                    deliveryResult = await FCMService.sendPushNotification(user.fcm_token, insertedMessage);
                }

                results.push({
                    success: true,
                    messageId: insertedMessage.id,
                    route,
                    delivery: deliveryResult
                });

            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    data: messageData
                });
            }
        }

        logger.message('WebHook bulk processado', {
            totalMessages: messages.length,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length
        });

        res.json({
            success: true,
            results,
            summary: {
                total: messages.length,
                success: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            }
        });

    } catch (error) {
        logger.error('Erro ao processar WebHook bulk', {
            error: error.message,
            body: req.body
        });

        res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
});

module.exports = router; 