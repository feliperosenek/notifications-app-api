const { messaging } = require('../firebaseAdmin');
const { logger } = require('../middleware/logger');

class FCMService {
    
    /**
     * Envia notificação push via FCM
     * @param {string} token - Token FCM do dispositivo
     * @param {Object} messageData - Dados da mensagem
     * @returns {Promise<Object>} - Resultado do envio
     */
    static async sendPushNotification(token, messageData) {
        try {
            const message = {
                token: token,
                notification: {
                    title: `${messageData.type.toUpperCase()} - ${messageData.message}`,
                    body: messageData.content
                },
                data: {
                    messageId: String(messageData.id || ''),
                    type: String(messageData.type || ''),
                    category: String(messageData.category || ''),
                    route: String(messageData.route || ''),
                    channel: String(messageData.channel || ''),
                    content: String(messageData.content || ''),
                    customAttributes: messageData.custom_attributes ? 
                        JSON.stringify(messageData.custom_attributes) : '',
                    userId: String(messageData.user_id || ''),
                    datetime: String(messageData.datetime || ''),
                    status: String(messageData.status || '')
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: messageData.type,
                        priority: 'high',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        icon: 'notification_icon',
                        color: this.getColorByType(messageData.type)
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                }
            };

            logger.message('Enviando notificação FCM', {
                token: token.substring(0, 20) + '...',
                messageId: messageData.id,
                type: messageData.type
            });

            // Log dos dados que serão enviados para debug
            logger.debug('Dados da mensagem FCM', {
                messageId: messageData.id,
                dataFields: Object.keys(message.data),
                dataValues: message.data
            });

            const response = await messaging.send(message);
            
            logger.message('Notificação FCM enviada com sucesso', {
                messageId: messageData.id,
                response: response
            });

            return {
                success: true,
                messageId: response,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Erro ao enviar notificação FCM', {
                error: error.message,
                messageId: messageData.id,
                token: token.substring(0, 20) + '...'
            });

            // Tratar erros específicos do FCM
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                return {
                    success: false,
                    error: 'INVALID_TOKEN',
                    message: 'Token FCM inválido ou não registrado'
                };
            }

            return {
                success: false,
                error: 'FCM_ERROR',
                message: error.message
            };
        }
    }

    /**
     * Envia notificação para múltiplos tokens
     * @param {Array} tokens - Array de tokens FCM
     * @param {Object} messageData - Dados da mensagem
     * @returns {Promise<Object>} - Resultado do envio
     */
    static async sendMulticastNotification(tokens, messageData) {
        try {
            const message = {
                notification: {
                    title: `${messageData.type.toUpperCase()} - ${messageData.message}`,
                    body: messageData.content
                },
                data: {
                    messageId: String(messageData.id || ''),
                    type: String(messageData.type || ''),
                    category: String(messageData.category || ''),
                    route: String(messageData.route || ''),
                    channel: String(messageData.channel || ''),
                    content: String(messageData.content || ''),
                    customAttributes: messageData.custom_attributes ? 
                        JSON.stringify(messageData.custom_attributes) : '',
                    userId: String(messageData.user_id || ''),
                    datetime: String(messageData.datetime || ''),
                    status: String(messageData.status || '')
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: messageData.type,
                        priority: 'high',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        icon: 'notification_icon',
                        color: this.getColorByType(messageData.type)
                    }
                }
            };

            const response = await messaging.sendMulticast({
                tokens: tokens,
                ...message
            });

            logger.message('Notificação FCM multicast enviada', {
                messageId: messageData.id,
                successCount: response.successCount,
                failureCount: response.failureCount
            });

            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
                responses: response.responses
            };

        } catch (error) {
            logger.error('Erro ao enviar notificação FCM multicast', {
                error: error.message,
                messageId: messageData.id
            });

            return {
                success: false,
                error: 'FCM_MULTICAST_ERROR',
                message: error.message
            };
        }
    }

    /**
     * Obtém cor baseada no tipo de notificação
     * @param {string} type - Tipo da notificação
     * @returns {string} - Cor em formato hexadecimal
     */
    static getColorByType(type) {
        const colors = {
            'info': '#007bff',
            'warning': '#ffc107',
            'error': '#dc3545',
            'success': '#28a745'
        };
        return colors[type] || '#007bff';
    }

    /**
     * Valida token FCM
     * @param {string} token - Token FCM
     * @returns {boolean} - Se o token é válido
     */
    static isValidToken(token) {
        if (!token || typeof token !== 'string' || token.length === 0) {
            return false;
        }

        // Verificar se tem pelo menos 140 caracteres (tokens FCM são longos)
        if (token.length < 140) {
            return false;
        }

        // Formato antigo: começa com 'fMEP'
        if (token.startsWith('fMEP')) {
            return true;
        }

        // Formato moderno: caracteres alfanuméricos + ':' + 'APA91b'
        // Exemplo: cYmFXBr4T5-TW3hag5wgDu:APA91b...
        const modernFormatRegex = /^[a-zA-Z0-9_-]+:APA91b/;
        if (modernFormatRegex.test(token)) {
            return true;
        }

        // Log para debug de tokens que não passam na validação
        logger.debug('Token FCM não passou na validação', {
            tokenLength: token.length,
            tokenStart: token.substring(0, 20) + '...',
            startsWithFmep: token.startsWith('fMEP'),
            matchesModernFormat: modernFormatRegex.test(token)
        });

        return false;
    }
}

module.exports = FCMService; 