const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');
const FCMService = require('../services/fcmService');

/**
 * Função para buscar usuário por ID
 */
async function getUserById(userId) {
    try {
        const [result] = await sequelize.query(
            `SELECT id, route, fcm_token, token_notification_android, token_notification_web, token_updated_at 
             FROM users WHERE id = :userId`,
            { replacements: { userId } }
        );
        
        return result.length > 0 ? result[0] : null;
    } catch (error) {
        logger.error('Erro ao buscar usuário por ID', {
            error: error.message,
            userId
        });
        return null;
    }
}

/**
 * POST /update-token
 * Atualiza tokens de notificação do usuário
 */
router.post('/update-token', async (req, res) => {
    try {
        const { email, fcmToken, expoToken, webToken } = req.body;

        // Log inicial da requisição
        logger.info('Iniciando atualização de tokens', {
            email,
            hasFCMToken: !!fcmToken,
            hasExpoToken: !!expoToken,
            hasWebToken: !!webToken,
            fcmTokenLength: fcmToken ? fcmToken.length : 0,
            expoTokenLength: expoToken ? expoToken.length : 0,
            webTokenLength: webToken ? webToken.length : 0,
            requestBody: req.body
        });

        if (!email) {
            logger.warn('Tentativa de atualização sem email', {
                body: req.body
            });
            return res.status(400).json({
                error: 'Email é obrigatório'
            });
        }

        // Validar token FCM se fornecido
        if (fcmToken) {
            const isValidFCM = FCMService.isValidToken(fcmToken);
            logger.debug('Validação do token FCM', {
                email,
                fcmTokenLength: fcmToken.length,
                fcmTokenStartsWith: fcmToken.substring(0, 10),
                isValid: isValidFCM
            });
            
            if (!isValidFCM) {
                logger.warn('Token FCM inválido recebido', {
                    email,
                    fcmToken: fcmToken.substring(0, 20) + '...',
                    fcmTokenLength: fcmToken.length
                });
                return res.status(400).json({
                    error: 'Token FCM inválido'
                });
            }
        }

        // Buscar usuário diretamente pelo email
        logger.debug('Buscando usuário no banco de dados', {
            email
        });
        
        const [userResult] = await sequelize.query(
            `SELECT id, route, fcm_token, token_notification_android, token_notification_web, token_updated_at
             FROM users 
             WHERE email = :email`,
            { replacements: { email } }
        );

        if (userResult.length === 0) {
            logger.warn('Usuário não encontrado para atualização de tokens', {
                email
            });
            return res.status(404).json({
                error: 'Usuário não encontrado'
            });
        }

        const userId = userResult[0].id;
        logger.debug('Usuário encontrado', {
            email,
            userId
        });

        // Atualizar tokens
        const updateFields = [];
        const replacements = { userId };

        logger.debug('Preparando campos para atualização', {
            email,
            userId,
            hasFCMToken: !!fcmToken,
            hasExpoToken: !!expoToken,
            hasWebToken: !!webToken
        });

        if (fcmToken) {
            updateFields.push('fcm_token = :fcmToken');
            replacements.fcmToken = fcmToken;
            logger.debug('Token FCM será atualizado', {
                email,
                userId,
                fcmTokenLength: fcmToken.length
            });
        }

        if (expoToken) {
            updateFields.push('token_notification_android = :expoToken');
            replacements.expoToken = expoToken;
            logger.debug('Token Expo será atualizado', {
                email,
                userId,
                expoTokenLength: expoToken.length
            });
        }

        if (webToken) {
            updateFields.push('token_notification_web = :webToken');
            replacements.webToken = webToken;
            logger.debug('Token Web será atualizado', {
                email,
                userId,
                webTokenLength: webToken.length
            });
        }

        if (updateFields.length > 0) {
            updateFields.push('token_updated_at = NOW()');
            
            const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = :userId`;
            logger.debug('Executando query de atualização', {
                email,
                userId,
                updateQuery,
                updateFields: updateFields.length
            });
            
            await sequelize.query(updateQuery, { replacements });

            logger.info('Tokens atualizados com sucesso', {
                userId,
                email,
                hasFCMToken: !!fcmToken,
                hasExpoToken: !!expoToken,
                hasWebToken: !!webToken,
                updatedFields: updateFields.length - 1 // -1 para excluir token_updated_at
            });
        } else {
            logger.warn('Nenhum token fornecido para atualização', {
                email,
                userId
            });
        }

        const response = {
            success: true,
            message: 'Tokens atualizados com sucesso',
            updatedAt: new Date().toISOString()
        };

        logger.info('Resposta de sucesso enviada', {
            email,
            userId,
            response
        });

        res.json(response);

    } catch (error) {
        logger.error('Erro ao atualizar tokens', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            email: req.body?.email
        });

        res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * GET /tokens/:route
 * Obtém tokens do usuário
 */
router.get('/tokens/:route', async (req, res) => {
    try {
        const { route } = req.params;

        const [result] = await sequelize.query(
            `SELECT u.fcm_token, u.token_notification_android, u.token_notification_web, u.token_updated_at 
             FROM users u 
             JOIN routes r ON u.id = r.users_id 
             WHERE r.name = :route`,
            { replacements: { route } }
        );

        if (result.length === 0) {
            return res.status(404).json({
                error: 'Usuário não encontrado'
            });
        }

        const tokens = result[0];

        res.json({
            success: true,
            tokens: {
                fcm: tokens.fcm_token,
                expo: tokens.token_notification_android,
                web: tokens.token_notification_web,
                updatedAt: tokens.token_updated_at
            }
        });

    } catch (error) {
        logger.error('Erro ao obter tokens', {
            error: error.message,
            route: req.params.route
        });

        res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * Endpoint para verificar tokens do usuário
 */
router.get('/check/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Buscar usuário no banco
        const user = await getUserById(userId);
        
        if (!user) {
            return res.status(404).json({
                error: 'Usuário não encontrado'
            });
        }

        // Analisar tokens
        const tokenAnalysis = {
            userId: user.id,
            fcmToken: {
                exists: !!user.fcm_token,
                length: user.fcm_token ? user.fcm_token.length : 0,
                startsWithFmep: user.fcm_token ? user.fcm_token.startsWith('fMEP') : false,
                isValid: user.fcm_token ? FCMService.isValidToken(user.fcm_token) : false,
                preview: user.fcm_token ? user.fcm_token.substring(0, 20) + '...' : null
            },
            expoToken: {
                exists: !!user.token_notification_android,
                length: user.token_notification_android ? user.token_notification_android.length : 0,
                startsWithExponent: user.token_notification_android ? user.token_notification_android.startsWith('ExponentPushToken[') : false,
                preview: user.token_notification_android ? user.token_notification_android.substring(0, 20) + '...' : null
            },
            webToken: {
                exists: !!user.token_notification_web,
                length: user.token_notification_web ? user.token_notification_web.length : 0,
                preview: user.token_notification_web ? user.token_notification_web.substring(0, 20) + '...' : null
            }
        };

        // Recomendações baseadas na análise
        const recommendations = [];
        
        if (!tokenAnalysis.fcmToken.exists) {
            recommendations.push('Usuário não possui token FCM. O app precisa gerar e enviar um token FCM válido.');
        } else if (!tokenAnalysis.fcmToken.isValid) {
            recommendations.push('Token FCM inválido. Deve começar com "fMEP" e ter pelo menos 140 caracteres.');
        }
        
        if (!tokenAnalysis.expoToken.exists) {
            recommendations.push('Usuário não possui token Expo. Pode ser usado como fallback.');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Todos os tokens parecem estar configurados corretamente.');
        }

        res.json({
            success: true,
            analysis: tokenAnalysis,
            recommendations: recommendations,
            canReceiveNotifications: tokenAnalysis.fcmToken.isValid || tokenAnalysis.expoToken.exists
        });

    } catch (error) {
        logger.error('Erro ao verificar tokens do usuário', {
            error: error.message,
            userId: req.params.userId
        });
        
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
});

/**
 * Endpoint para verificar tokens do usuário por route
 */
router.get('/check-route/:route', async (req, res) => {
    try {
        const { route } = req.params;
        
        // Buscar usuário no banco através da tabela routes
        const [userResult] = await sequelize.query(
            `SELECT u.id, u.route, u.fcm_token, u.token_notification_android, u.token_notification_web, u.token_updated_at 
             FROM users u 
             JOIN routes r ON u.id = r.users_id 
             WHERE r.name = :route`,
            { replacements: { route } }
        );
        
        if (userResult.length === 0) {
            return res.status(404).json({
                error: 'Usuário não encontrado'
            });
        }

        const user = userResult[0];

        // Analisar tokens
        const tokenAnalysis = {
            userId: user.id,
            route: user.route,
            fcmToken: {
                exists: !!user.fcm_token,
                length: user.fcm_token ? user.fcm_token.length : 0,
                startsWithFmep: user.fcm_token ? user.fcm_token.startsWith('fMEP') : false,
                isValid: user.fcm_token ? FCMService.isValidToken(user.fcm_token) : false,
                preview: user.fcm_token ? user.fcm_token.substring(0, 20) + '...' : null
            },
            expoToken: {
                exists: !!user.token_notification_android,
                length: user.token_notification_android ? user.token_notification_android.length : 0,
                startsWithExponent: user.token_notification_android ? user.token_notification_android.startsWith('ExponentPushToken[') : false,
                preview: user.token_notification_android ? user.token_notification_android.substring(0, 20) + '...' : null
            },
            webToken: {
                exists: !!user.token_notification_web,
                length: user.token_notification_web ? user.token_notification_web.length : 0,
                preview: user.token_notification_web ? user.token_notification_web.substring(0, 20) + '...' : null
            }
        };

        // Recomendações baseadas na análise
        const recommendations = [];
        
        if (!tokenAnalysis.fcmToken.exists) {
            recommendations.push('Usuário não possui token FCM. O app precisa gerar e enviar um token FCM válido.');
        } else if (!tokenAnalysis.fcmToken.isValid) {
            recommendations.push('Token FCM inválido. Deve começar com "fMEP" e ter pelo menos 140 caracteres.');
        }
        
        if (!tokenAnalysis.expoToken.exists) {
            recommendations.push('Usuário não possui token Expo. Pode ser usado como fallback.');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Todos os tokens parecem estar configurados corretamente.');
        }

        res.json({
            success: true,
            analysis: tokenAnalysis,
            recommendations: recommendations,
            canReceiveNotifications: tokenAnalysis.fcmToken.isValid || tokenAnalysis.expoToken.exists
        });

    } catch (error) {
        logger.error('Erro ao verificar tokens do usuário', {
            error: error.message,
            route: req.params.route
        });
        
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
});

module.exports = router; 