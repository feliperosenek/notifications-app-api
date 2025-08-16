const sgMail = require('@sendgrid/mail');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');

// Configuração do SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Email remetente
const FROM_EMAIL = 'pass@easynotificationspost.dev';

class EmailService {
    /**
     * Gera token JWT para definição/redefinição de senha
     * @param {string} email - Email do usuário
     * @param {string} type - Tipo de token ('set' ou 'reset')
     * @returns {string} Token JWT
     */
    generatePasswordToken(email, type) {
        const payload = {
            email,
            type,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutos
        };
        
        return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', { algorithm: 'HS256' });
    }

    /**
     * Verifica se o token é válido e não expirou
     * @param {string} token - Token JWT
     * @returns {object|null} Payload do token ou null se inválido
     */
    verifyPasswordToken(token) {
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            
            // Verifica se o token não expirou (redundante com JWT, mas para garantir)
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
                logger.warn('Token de senha expirado', { email: payload.email, type: payload.type });
                return null;
            }
            
            return payload;
        } catch (error) {
            logger.error('Erro ao verificar token de senha', { error: error.message });
            return null;
        }
    }

    /**
     * Envia email para definição de senha
     * @param {string} email - Email do usuário
     * @param {string} token - Token JWT
     * @returns {Promise<boolean>} Sucesso do envio
     */
    async sendSetPasswordEmail(email, token) {
        try {
            const deeplinkUrl = `myapp://set-password?token=${token}&email=${encodeURIComponent(email)}`;
            const redirectUrl = `https://api.easynotificationspost.dev/email/redirect/password/${token}?email=${encodeURIComponent(email)}`;
            const httpsUrl = `https://api.easynotificationspost.dev/set-password?token=${token}&email=${encodeURIComponent(email)}`;
            const fallbackUrl = `https://api.easynotificationspost.dev/fallback?action=set-password&token=${token}&email=${encodeURIComponent(email)}`;
            const resetUrl = redirectUrl;
            
            // Log dos URLs gerados para debug
            logger.info('URLs gerados para email de definição de senha', {
                email,
                deeplinkUrl,
                redirectUrl,
                httpsUrl,
                fallbackUrl,
                resetUrl,
                token: token.substring(0, 20) + '...'
            });
            
            const msg = {
                to: email,
                from: FROM_EMAIL,
                subject: 'Defina sua senha - EasyNotifications',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Defina sua senha</title>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }
                            .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        </style>

                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🔐 Defina sua senha</h1>
                            </div>
                            <div class="content">
                                <p>Olá!</p>
                                <p>Você solicitou a definição de uma senha para sua conta no EasyNotifications.</p>
                                <p>Clique no botão abaixo para definir sua senha:</p>
                                
                                <div style="text-align: center;">
                                    <a href="${redirectUrl}" style="text-decoration: none; color: white; display: inline-block; background: #007bff; padding: 12px 24px; border-radius: 5px; margin: 20px 0; font-weight: bold;">Definir Senha</a>
                                </div>
                                <div style="text-align: center; margin-top: 15px;">
                                    <a href="${redirectUrl}" style="text-decoration: none; color: white; display: inline-block; background: #28a745; padding: 10px 20px; border-radius: 5px; margin: 10px 0; font-weight: bold; font-size: 14px;">📱 Abrir no App</a>
                                </div>
                                <div style="text-align: center; margin-top: 15px;">
                                    <a href="${redirectUrl}" style="color: #007bff; text-decoration: underline; font-size: 16px;">🔗 Clique aqui se o botão não funcionar</a>
                                </div>
                                <div style="text-align: center; margin-top: 10px;">
                                    <p style="font-size: 14px; color: #666;">URL: ${redirectUrl}</p>
                                </div>
                                
                                <div class="warning">
                                    <strong>⚠️ Importante:</strong>
                                    <ul>
                                        <li>Este link é válido por apenas <strong>15 minutos</strong></li>
                                        <li>Se você não solicitou esta ação, ignore este email</li>
                                        <li>Nunca compartilhe este link com outras pessoas</li>
                                    </ul>
                                </div>
                                
                                <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
                                <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 3px;">
                                    ${resetUrl}
                                </p>
                                <p><strong>📱 Nota:</strong> Este link abrirá em seu navegador e redirecionará para o aplicativo EasyNotifications.</p>
                            </div>
                            <div class="footer">
                                <p>Este é um email automático, não responda a esta mensagem.</p>
                                <p>EasyNotifications - Sistema de Notificações Inteligente</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            await sgMail.send(msg);
            logger.info('Email de definição de senha enviado com sucesso', { email });
            return true;
        } catch (error) {
            logger.error('Erro ao enviar email de definição de senha', { error: error.message, email });
            return false;
        }
    }

    /**
     * Envia email para redefinição de senha
     * @param {string} email - Email do usuário
     * @param {string} token - Token JWT
     * @returns {Promise<boolean>} Sucesso do envio
     */
    async sendResetPasswordEmail(email, token) {
        try {
            const deeplinkUrl = `myapp://reset-password?token=${token}&email=${encodeURIComponent(email)}`;
            const redirectUrl = `https://api.easynotificationspost.dev/email/redirect/password/${token}?email=${encodeURIComponent(email)}`;
            const httpsUrl = `https://api.easynotificationspost.dev/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
            const fallbackUrl = `https://api.easynotificationspost.dev/fallback?action=reset-password&token=${token}&email=${encodeURIComponent(email)}`;
            const resetUrl = redirectUrl;
            
            // Log dos URLs gerados para debug
            logger.info('URLs gerados para email de redefinição de senha', {
                email,
                deeplinkUrl,
                redirectUrl,
                httpsUrl,
                fallbackUrl,
                resetUrl,
                token: token.substring(0, 20) + '...'
            });
            
            const msg = {
                to: email,
                from: FROM_EMAIL,
                subject: 'Redefina sua senha - EasyNotifications',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Redefina sua senha</title>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }
                            .button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        </style>

                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🔑 Redefina sua senha</h1>
                            </div>
                            <div class="content">
                                <p>Olá!</p>
                                <p>Você solicitou a redefinição de senha para sua conta no EasyNotifications.</p>
                                <p>Clique no botão abaixo para redefinir sua senha:</p>
                                
                                <div style="text-align: center;">
                                    <a href="${redirectUrl}" style="text-decoration: none; color: white; display: inline-block; background: #dc3545; padding: 12px 24px; border-radius: 5px; margin: 20px 0; font-weight: bold;">Redefinir Senha</a>
                                </div>
                                <div style="text-align: center; margin-top: 15px;">
                                    <a href="${redirectUrl}" style="text-decoration: none; color: white; display: inline-block; background: #28a745; padding: 10px 20px; border-radius: 5px; margin: 10px 0; font-weight: bold; font-size: 14px;">📱 Abrir no App</a>
                                </div>
                                <div style="text-align: center; margin-top: 15px;">
                                    <a href="${redirectUrl}" style="color: #dc3545; text-decoration: underline; font-size: 16px;">🔗 Clique aqui se o botão não funcionar</a>
                                </div>
                                <div style="text-align: center; margin-top: 10px;">
                                    <p style="font-size: 14px; color: #666;">URL: ${redirectUrl}</p>
                                </div>
                                
                                <div class="warning">
                                    <strong>⚠️ Importante:</strong>
                                    <ul>
                                        <li>Este link é válido por apenas <strong>15 minutos</strong></li>
                                        <li>Se você não solicitou esta ação, ignore este email</li>
                                        <li>Nunca compartilhe este link com outras pessoas</li>
                                    </ul>
                                </div>
                                
                                <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
                                <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 3px;">
                                    ${resetUrl}
                                </p>
                                <p><strong>📱 Nota:</strong> Este link abrirá em seu navegador e redirecionará para o aplicativo EasyNotifications.</p>
                            </div>
                            <div class="footer">
                                <p>Este é um email automático, não responda a esta mensagem.</p>
                                <p>EasyNotifications - Sistema de Notificações Inteligente</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            await sgMail.send(msg);
            logger.info('Email de redefinição de senha enviado com sucesso', { email });
            return true;
        } catch (error) {
            logger.error('Erro ao enviar email de redefinição de senha', { error: error.message, email });
            return false;
        }
    }

    /**
     * Verifica se o usuário existe no banco
     * @param {string} email - Email do usuário
     * @returns {Promise<boolean>} Usuário existe
     */
    async userExists(email) {
        try {
            const [user] = await sequelize.query(
                `SELECT id FROM users WHERE email = :email`,
                { replacements: { email } }
            );
            return user.length > 0;
        } catch (error) {
            logger.error('Erro ao verificar existência do usuário', { error: error.message, email });
            return false;
        }
    }

    /**
     * Verifica se o usuário já tem senha definida
     * @param {string} email - Email do usuário
     * @returns {Promise<boolean>} Usuário tem senha
     */
    async userHasPassword(email) {
        try {
            const [user] = await sequelize.query(
                `SELECT pass FROM users WHERE email = :email`,
                { replacements: { email } }
            );
            
            if (user.length === 0) return false;
            
            // Verifica se o campo pass não é null e não está vazio
            return user[0].pass && user[0].pass.trim() !== '';
        } catch (error) {
            logger.error('Erro ao verificar senha do usuário', { error: error.message, email });
            return false;
        }
    }
}

module.exports = EmailService;
