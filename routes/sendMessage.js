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
 * Função auxiliar para validar e processar o campo content
 */
function validateAndProcessContent(content) {
  if (typeof content === 'string') {
    return { isValid: true, processedContent: content.trim() };
  }
  
  if (typeof content === 'object' || Array.isArray(content)) {
    try {
      const jsonString = JSON.stringify(content);
      return { 
        isValid: true, 
        processedContent: jsonString,
        wasConverted: true,
        originalType: Array.isArray(content) ? 'array' : 'object'
      };
    } catch (error) {
      return { 
        isValid: false, 
        error: 'Não foi possível converter o objeto/array para string JSON'
      };
    }
  }
  
  if (content === null || content === undefined) {
    return { isValid: false, error: 'Campo content não pode ser null ou undefined' };
  }
  
  // Para outros tipos (number, boolean), converter para string
  return { 
    isValid: true, 
    processedContent: String(content),
    wasConverted: true,
    originalType: typeof content
  };
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
          try {
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
          } catch (fcmError) {
            logger.error('Erro ao enviar notificação FCM', {
              error: fcmError.message,
              messageId: insertedMessage.id,
              userId: userData.id,
              userName: `${userData.first_name} ${userData.last_name}`.trim(),
              token: userData.fcm_token ? userData.fcm_token.substring(0, 20) + '...' : 'N/A'
            });
            
            fcmResult = {
              success: false,
              error: 'FCM_EXCEPTION',
              message: fcmError.message
            };
          }
        }

        // Notificar app frontend via SSE
        sendMessageNotification(routeData.name, insertedMessage);

        // Preparar dados consolidados para este usuário
        const fullName = `${userData.first_name} ${userData.last_name}`.trim();
        const isOwner = userData.id === routeData.users_id;
        const userType = isOwner ? 'owner' : 'shared';
        const fcmSuccess = fcmResult?.success || false;

        // Armazenar resultado consolidado para este usuário
        deliveryResults.push({
          userId: userData.id,
          userName: fullName,
          userType,
          messageId: insertedMessage.id,
          fcm: {
            success: fcmSuccess,
            error: fcmResult?.error || null,
            message: fcmResult?.message || null,
            hasToken: !!userData.fcm_token
          },
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

    // Log resumo final consolidado
    const successCount = deliveryResults.filter(r => r.overallDelivery === 'CONNECTED').length;
    const totalUsers = deliveryResults.length;
    
    // Log consolidado para análise
    logger.delivery('New Message!', {
      route: routeData.name,
      routeOwner: {
        id: routeOwner.id,
        name: `${routeOwner.first_name} ${routeOwner.last_name}`.trim()
      },
      totalUsers,
      successCount,
      failureCount: totalUsers - successCount,
      deliveryResults,
      summary: {
        fcm: {
          total: totalUsers,
          success: deliveryResults.filter(r => r.fcm?.success).length,
          failed: deliveryResults.filter(r => r.fcm && !r.fcm.success).length,
          noToken: deliveryResults.filter(r => !r.fcm?.hasToken).length
        }
      }
    });
    
    // Retorno original da API
    res.json({
      success: true,
      route: routeData.name,
      routeOwner: {
        id: routeOwner.id,
        name: `${routeOwner.first_name} ${routeOwner.last_name}`.trim()
      },
      totalUsers,
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

  // Validação e processamento do campo content
  const contentValidation = validateAndProcessContent(content);
  if (!contentValidation.isValid) {
    return res.status(400).json({
      error: contentValidation.error
    });
  }

  // Log removido - será consolidado no final

  await processMessageSend(req, res, type, contentValidation.processedContent, route);
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

  // Validação e processamento do campo content
  const contentValidation = validateAndProcessContent(content);
  if (!contentValidation.isValid) {
    return res.status(400).json({
      error: contentValidation.error
    });
  }

  // Log removido - será consolidado no final

  // Validação específica para imagem (usar o content processado)
  if (!isValidImageUrl(contentValidation.processedContent)) {
    return res.status(400).json({
      error: 'URL da imagem deve ser HTTPS válida com extensão de imagem (.jpg, .png, .gif, etc.)'
    });
  }

  await processMessageSend(req, res, type, contentValidation.processedContent, route);
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

  // Validação e processamento do campo content
  const contentValidation = validateAndProcessContent(content);
  if (!contentValidation.isValid) {
    return res.status(400).json({
      error: contentValidation.error
    });
  }

  // Log removido - será consolidado no final

  // Validação específica para áudio (usar o content processado)
  if (!isValidAudioUrl(contentValidation.processedContent)) {
    return res.status(400).json({
      error: 'URL do áudio deve ser HTTPS válida com extensão de áudio (.mp3, .wav, .ogg, etc.)'
    });
  }

  await processMessageSend(req, res, type, contentValidation.processedContent, route);
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
        sendMessageNotification(route, insertedMessage);

        // Log consolidado do resultado
        const fcmSuccess = deliveryResults.fcm?.success || false;
        
        logger.delivery('Mensagem processada', {
            messageId: insertedMessage.id,
            route,
            deliveryResults,
            overallDelivery: fcmSuccess ? 'SUCCESS' : 'FAILED'
        });
        
        res.json({
            success: true,
            message: 'Notificação enviada com sucesso',
            messageId: insertedMessage.id,
            delivery: deliveryResults,
            overallDelivery: fcmSuccess ? 'SUCCESS' : 'FAILED'
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

    // Log removido - será consolidado no final

    // 1. PRIORIDADE: FCM Push (sempre funciona, mesmo com app fechado)
    if (user.fcm_token) {
        const isValidFcmToken = FCMService.isValidToken(user.fcm_token);
        
        // Log removido - será consolidado no final

        if (isValidFcmToken) {
            try {
                // Log removido - será consolidado no final

                results.fcm = await FCMService.sendPushNotification(user.fcm_token, messageData);
                
                if (results.fcm.success) {
                    // Log removido - será consolidado no final
                } else {
                    // Log removido - será consolidado no final
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
            // Log removido - será consolidado no final
            results.fcm = {
                success: false,
                error: 'INVALID_FCM_TOKEN',
                message: 'Token FCM inválido - deve começar com fMEP'
            };
        }
    } else {
        // Log removido - será consolidado no final
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
        // Log removido - será consolidado no final
    }

    // 4. FALLBACK: Web Push (se aplicável)
    if (user.token_notification_web) {
        try {
            // Log removido - será consolidado no final

            results.web = await sendWebPushNotification(user.token_notification_web, messageData);
            
            if (results.web.success) {
                // Log removido - será consolidado no final
            } else {
                // Log removido - será consolidado no final
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
        // Log removido - será consolidado no final
    }

    // Log resumo final
    const successCount = Object.values(results).filter(r => r && r.success).length;
    const fcmSuccess = results.fcm?.success || false;
    
    // Log removido - será consolidado no final

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

        // Log removido - será consolidado no final

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