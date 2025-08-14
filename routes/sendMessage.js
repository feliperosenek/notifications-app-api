const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');
const FCMService = require('../services/fcmService');
const messageRateLimit = require('../verifications/messageRateLimit');
const { sendMessageNotification } = require('./sse');

/**
 * Função auxiliar para validar URL
 */
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Função auxiliar para validar URL de imagem
 */
function isValidImageUrl(url) {
  if (!isValidUrl(url)) return false;
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * Função auxiliar para validar URL de áudio
 */
function isValidAudioUrl(url) {
  if (!isValidUrl(url)) return false;
  
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
  const lowerUrl = url.toLowerCase();
  return audioExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * Função auxiliar para processar envio de mensagem
 */
async function processMessageSend(req, res, messageType, content, route) {
  try {
    const { message, type, category, channel, custom_attributes } = req.body;
    
    // Validações básicas - verificar campos obrigatórios
    const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
      });
    }

    // Verificar se a rota existe e buscar todos os usuários associados
    const [routeResult] = await sequelize.query(
      `SELECT r.id, r.name, r.token, r.users_id
       FROM routes r 
       WHERE r.name = :route`,
      { replacements: { route: route.trim() } }
    );

    if (routeResult.length === 0) {
      return res.status(404).json({
        error: 'Rota não encontrada'
      });
    }

    const routeData = routeResult[0];

    // Buscar o dono da rota
    const [ownerResult] = await sequelize.query(
      `SELECT u.id, u.first_name, u.last_name, u.fcm_token
       FROM users u
       WHERE u.id = :owner_id`,
      { replacements: { owner_id: routeData.users_id } }
    );

    if (ownerResult.length === 0) {
      return res.status(404).json({
        error: 'Dono da rota não encontrado'
      });
    }

    const routeOwner = ownerResult[0];

    // Buscar todos os usuários associados à rota através da tabela route_users
    const [sharedUsersResult] = await sequelize.query(
      `SELECT ru.user_id, u.id, u.first_name, u.last_name, u.fcm_token
       FROM route_users ru
       JOIN users u ON ru.user_id = u.id
       WHERE ru.route_id = :route_id`,
      { replacements: { route_id: routeData.id } }
    );

    // Combinar o dono da rota com os usuários compartilhados
    const allUsers = [routeOwner, ...sharedUsersResult];

    if (allUsers.length === 0) {
      return res.status(404).json({
        error: 'Nenhum usuário encontrado para esta rota'
      });
    }

    // Array para armazenar resultados de envio para cada usuário
    const deliveryResults = [];

    // Processar envio para cada usuário da rota (incluindo o dono)
    for (const userData of allUsers) {
      try {
        // Inserir mensagem no banco para cada usuário
        const [insertResult] = await sequelize.query(
          `INSERT INTO messages (
              message, type, category, route, channel, content, custom_attributes, 
              route_id, user_id, datetime, status
          ) VALUES (
              :message, :type, :category, :route, :channel, :content, :custom_attributes,
              :route_id, :user_id, NOW(), 'active'
          ) RETURNING *`,
          {
            replacements: {
              message,
              type,
              category,
              route,
              channel,
              content: content.trim(),
              custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null,
              route_id: routeData.id,
              user_id: userData.id
            }
          }
        );

        const insertedMessage = insertResult[0];

        // Enviar notificação via FCM (se token disponível)
        let fcmResult = null;
        if (userData.fcm_token) {
          fcmResult = await FCMService.sendPushNotification(userData.fcm_token, {
            id: insertedMessage.id,
            message,
            type,
            category,
            route,
            channel,
            content,
            custom_attributes,
            user_id: userData.id
          });
        }

        // Notificar app frontend via SSE
        const sseResult = sendMessageNotification(routeData.name, insertedMessage);

        // Log do resultado para este usuário
        const fcmSuccess = fcmResult?.success || false;
        const sseSuccess = sseResult.success;
        const fullName = `${userData.first_name} ${userData.last_name}`.trim();
        
        // Determinar se é o dono da rota ou usuário compartilhado
        const isOwner = userData.id === routeData.users_id;
        const userType = isOwner ? 'owner' : 'shared';
        
        logger.delivery('Mensagem processada para usuário da rota', {
          messageId: insertedMessage.id,
          userId: userData.id,
          userName: fullName,
          userType,
          type,
          category,
          route: routeData.name,
          channel,
          fcmSuccess,
        });

        // Armazenar resultado para este usuário
        deliveryResults.push({
          userId: userData.id,
          userName: fullName,
          userType,
          messageId: insertedMessage.id,
          fcmSuccess,
          overallDelivery: fcmSuccess ? 'CONNECTED' : 'DISCONNECTED'
        });


      } catch (userError) {
        const fullName = `${userData.first_name} ${userData.last_name}`.trim();
        
        const isOwner = userData.id === routeData.users_id;
        const userType = isOwner ? 'owner' : 'shared';
        
        logger.error('Erro ao processar mensagem para usuário específico', {
          error: userError.message,
          userId: userData.id,
          userName: fullName,
          userType,
          route: routeData.name
        });

        // Adicionar resultado de erro para este usuário
        deliveryResults.push({
          userId: userData.id,
          userName: fullName,
          userType,
          error: userError.message,
          overallDelivery: 'FAILED'
        });
      }
    }

    // Log resumo final
    const successCount = deliveryResults.filter(r => r.overallDelivery === 'SUCCESS').length;
    const totalUsers = deliveryResults.length;
    
    logger.delivery('Resumo do processamento de mensagem para rota compartilhada', {
      route: routeData.name,
      routeOwner: {
        id: routeOwner.id,
        name: `${routeOwner.first_name} ${routeOwner.last_name}`.trim()
      },
      totalUsers,
      deliveryResults
    });
    
    res.json({
      success: true,
      message: 'Mensagem processada para todos os usuários da rota (incluindo o dono)',
      route: routeData.name,
      routeOwner: {
        id: routeOwner.id,
        name: `${routeOwner.first_name} ${routeOwner.last_name}`.trim()
      },
      totalUsers,
      successCount,
      failureCount: totalUsers - successCount,
      deliveryResults
    });

  } catch (error) {
    logger.error('Erro ao processar mensagem para rota compartilhada', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
}

/**
 * POST /send-message
 * Envia mensagem (ATUALIZADO conforme documentação)
 */
router.post('/', messageRateLimit, async (req, res) => {
  const { message, type, category, route, channel, content, custom_attributes } = req.body;

  // Validações obrigatórias - verificar campos obrigatórios
  const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
    });
  }

  await processMessageSend(req, res, type, content, route);
});

/**
 * POST /send-image
 * Envia mensagem com URL de imagem (NOVO endpoint conforme documentação)
 */
router.post('/send-image', messageRateLimit, async (req, res) => {
  const { message, type, category, route, channel, content, custom_attributes } = req.body;

  // Validações obrigatórias - verificar campos obrigatórios
  const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
    });
  }

  // Validação específica para imagem
  if (!isValidImageUrl(content)) {
    return res.status(400).json({
      error: 'URL da imagem deve ser HTTPS válida com extensão de imagem (.jpg, .png, .gif, etc.)'
    });
  }

  await processMessageSend(req, res, type, content, route);
});

/**
 * POST /send-audio
 * Envia mensagem com URL de áudio (NOVO endpoint conforme documentação)
 */
router.post('/send-audio', messageRateLimit, async (req, res) => {
  const { message, type, category, route, channel, content, custom_attributes } = req.body;

  // Validações obrigatórias - verificar campos obrigatórios
  const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
    });
  }

  // Validação específica para áudio
  if (!isValidAudioUrl(content)) {
    return res.status(400).json({
      error: 'URL do áudio deve ser HTTPS válida com extensão de áudio (.mp3, .wav, .ogg, etc.)'
    });
  }

  await processMessageSend(req, res, type, content, route);
});

/**
 * POST /send-message (LEGACY - mantido para compatibilidade)
 * Envia notificação com nova hierarquia de prioridade
 */
router.post('/legacy', messageRateLimit, async (req, res) => {
    try {
        const { message, category, route, type = 'info', channel = 'default', content, custom_attributes } = req.body;

        // Validação
        if (!message || !category || !route) {
            return res.status(400).json({
                error: 'Campos obrigatórios ausentes: message, category, route'
            });
        }

        // Buscar usuário e tokens
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

        // NOVA HIERARQUIA DE ENVIO
        const deliveryResults = await sendNotificationWithPriority(insertedMessage, user, req);

        // 3. SSE - Notificar app frontend sobre nova mensagem
        const sseResult = sendMessageNotification(route, insertedMessage);

        // Log do resultado
        const fcmSuccess = deliveryResults.fcm?.success || false;
        const sseSuccess = sseResult.success;
        
        logger.delivery('Mensagem processada com FCM e SSE', {
            messageId: insertedMessage.id,
            route,
            deliveryResults,
            sseResult,
            fcmSuccess,
            sseSuccess,
            pushDelivered: fcmSuccess,
            appNotified: sseSuccess,
            overallDelivery: fcmSuccess || sseSuccess ? 'SUCCESS' : 'FAILED'
        });
        
        res.json({
            success: true,
            message: 'Notificação enviada com sucesso',
            messageId: insertedMessage.id,
            delivery: deliveryResults,
            sse: sseResult,
            fcmSuccess,
            sseSuccess,
            pushDelivered: fcmSuccess,
            appNotified: sseSuccess,
            overallDelivery: fcmSuccess || sseSuccess ? 'SUCCESS' : 'FAILED'
        });

    } catch (error) {
        logger.error('Erro ao processar mensagem', {
            error: error.message,
            body: req.body
        });

        res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
});

/**
 * Função para enviar notificação com hierarquia de prioridade
 * 
 * LÓGICA DE ENVIO:
 * 1. FCM é sempre tentado primeiro (prioridade máxima)
 * 2. Se FCM falhar, tenta fallbacks (Expo/Web)
 * 3. SSE notifica app frontend sobre nova mensagem (tempo real)
 */
async function sendNotificationWithPriority(messageData, user, req) {
    const results = {
        fcm: null,
        expo: null,
        web: null
    };

    logger.message('Iniciando envio com FCM', {
        messageId: messageData.id,
        route: messageData.route,
        hasFcmToken: !!user.fcm_token,
        fcmTokenLength: user.fcm_token ? user.fcm_token.length : 0,
        fcmTokenStart: user.fcm_token ? user.fcm_token.substring(0, 10) : 'N/A',
        hasExpoToken: !!user.token_notification_android,
        hasWebToken: !!user.token_notification_web
    });

    // 1. PRIORIDADE: FCM Push (sempre funciona, mesmo com app fechado)
    if (user.fcm_token) {
        const isValidFcmToken = FCMService.isValidToken(user.fcm_token);
        
        logger.message('Verificando token FCM', {
            messageId: messageData.id,
            hasToken: !!user.fcm_token,
            tokenLength: user.fcm_token.length,
            tokenStart: user.fcm_token.substring(0, 20) + '...',
            isValidToken: isValidFcmToken,
            tokenStartsWithFmep: user.fcm_token.startsWith('fMEP')
        });

        if (isValidFcmToken) {
            try {
                logger.message('Tentando envio FCM', {
                    messageId: messageData.id,
                    token: user.fcm_token.substring(0, 20) + '...'
                });

                results.fcm = await FCMService.sendPushNotification(user.fcm_token, messageData);
                
                if (results.fcm.success) {
                    logger.message('Notificação FCM enviada com sucesso', {
                        messageId: messageData.id,
                        token: user.fcm_token.substring(0, 20) + '...'
                    });
                } else {
                    logger.warn('FCM falhou - tentando fallbacks', {
                        messageId: messageData.id,
                        fcmError: results.fcm.error,
                        fcmMessage: results.fcm.message
                    });
                }
            } catch (error) {
                logger.error('Erro ao enviar FCM', {
                    error: error.message,
                    messageId: messageData.id,
                    stack: error.stack
                });
                results.fcm = {
                    success: false,
                    error: 'FCM_EXCEPTION',
                    message: error.message
                };
            }
        } else {
            logger.warn('Token FCM inválido', {
                messageId: messageData.id,
                token: user.fcm_token.substring(0, 20) + '...',
                tokenLength: user.fcm_token.length,
                expectedStart: 'fMEP'
            });
            results.fcm = {
                success: false,
                error: 'INVALID_FCM_TOKEN',
                message: 'Token FCM inválido - deve começar com fMEP'
            };
        }
    } else {
        logger.message('FCM não disponível - sem token', {
            messageId: messageData.id,
            hasToken: !!user.fcm_token
        });
        results.fcm = {
            success: false,
            error: 'NO_FCM_TOKEN',
            message: 'Usuário não possui token FCM'
        };
    }

    // 2. FALLBACK: Expo Push (legacy, apenas se não há FCM)
    if (!user.fcm_token && user.token_notification_android) {
        try {
            logger.message('Tentando envio Expo (fallback)', {
                messageId: messageData.id,
                token: user.token_notification_android.substring(0, 20) + '...'
            });

            results.expo = await sendExpoPushNotification(user.token_notification_android, messageData);
            
            if (results.expo.success) {
                logger.message('Notificação Expo enviada (fallback)', {
                    messageId: messageData.id
                });
            } else {
                logger.warn('Expo falhou', {
                    messageId: messageData.id,
                    expoError: results.expo.response?.data?.message || results.expo.error
                });
            }
        } catch (error) {
            logger.error('Erro ao enviar Expo', {
                error: error.message,
                messageId: messageData.id
            });
            results.expo = {
                success: false,
                error: 'EXPO_EXCEPTION',
                message: error.message
            };
        }
    } else {
        logger.message('Expo não disponível', {
            messageId: messageData.id,
            hasFcmToken: !!user.fcm_token,
            hasExpoToken: !!user.token_notification_android
        });
    }

    // 4. FALLBACK: Web Push (se aplicável)
    if (user.token_notification_web) {
        try {
            logger.message('Tentando envio Web Push', {
                messageId: messageData.id
            });

            results.web = await sendWebPushNotification(user.token_notification_web, messageData);
            
            if (results.web.success) {
                logger.message('Notificação Web enviada (fallback)', {
                    messageId: messageData.id
                });
            } else {
                logger.warn('Web Push falhou', {
                    messageId: messageData.id,
                    webError: results.web.error
                });
            }
        } catch (error) {
            logger.error('Erro ao enviar Web Push', {
                error: error.message,
                messageId: messageData.id
            });
            results.web = {
                success: false,
                error: 'WEBPUSH_EXCEPTION',
                message: error.message
            };
        }
    } else {
        logger.message('Web Push não disponível', {
            messageId: messageData.id,
            hasWebToken: !!user.token_notification_web
        });
    }

    // Log resumo final
    const successCount = Object.values(results).filter(r => r && r.success).length;
    const fcmSuccess = results.fcm?.success || false;
    
    logger.message('Resumo do envio', {
        messageId: messageData.id,
        successCount,
        totalMethods: 3,
        results: {
            fcm: fcmSuccess,
            expo: results.expo?.success || false,
            web: results.web?.success || false
        }
    });

    return results;
}

/**
 * Função legacy para Expo Push (mantida para compatibilidade)
 */
async function sendExpoPushNotification(token, messageData) {
    try {
        // Validar token Expo
        if (!token || !token.startsWith('ExponentPushToken[')) {
            return {
                success: false,
                error: 'INVALID_EXPO_TOKEN',
                message: 'Token Expo inválido'
            };
        }

        const message = {
            to: token,
            sound: 'default',
            title: `${messageData.type.toUpperCase()} - ${messageData.message}`,
            body: messageData.content,
            data: {
                messageId: messageData.id,
                type: messageData.type,
                category: messageData.category,
                route: messageData.route,
                channel: messageData.channel,
                content: messageData.content,
                customAttributes: messageData.custom_attributes,
                userId: messageData.user_id,
                datetime: messageData.datetime,
                status: messageData.status
            }
        };

        logger.message('Enviando notificação Expo', {
            messageId: messageData.id,
            token: token.substring(0, 20) + '...'
        });

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        const result = await response.json();

        // Tratar erros específicos do Expo
        if (result.data?.status === 'error') {
            const errorMessage = result.data.message;
            
            if (errorMessage.includes('FCM server key')) {
                return {
                    success: false,
                    error: 'EXPO_FCM_CREDENTIALS_ERROR',
                    message: 'Expo não consegue acessar credenciais FCM. Configure as credenciais no Expo Dashboard.',
                    response: result
                };
            }
            
            if (errorMessage.includes('InvalidCredentials')) {
                return {
                    success: false,
                    error: 'EXPO_INVALID_CREDENTIALS',
                    message: 'Credenciais Expo inválidas',
                    response: result
                };
            }
        }

        return {
            success: result.data?.status === 'ok',
            response: result
        };

    } catch (error) {
        return {
            success: false,
            error: 'EXPO_NETWORK_ERROR',
            message: error.message
        };
    }
}

/**
 * Função para Web Push (implementação básica)
 */
async function sendWebPushNotification(token, messageData) {
    try {
        // Implementação básica de Web Push
        // Em produção, você precisaria configurar VAPID keys e usar uma biblioteca como web-push
        
        logger.message('Web Push não implementado - usando fallback', {
            messageId: messageData.id,
            token: token.substring(0, 20) + '...'
        });

        return {
            success: false,
            error: 'Web Push não implementado',
            message: 'Web Push requer configuração adicional com VAPID keys'
        };

    } catch (error) {
        return {
            success: false,
            error: 'WEBPUSH_ERROR',
            message: error.message
        };
    }
}

module.exports = router; 