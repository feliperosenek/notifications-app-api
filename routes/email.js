const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const sequelize = require('../config/database');
const { logger, loggerMiddleware } = require('../middleware/logger');
const EmailService = require('../services/emailService');
const { combinedRateLimiter } = require('../middleware/rateLimiter');

// Aplica o middleware de logs
router.use(loggerMiddleware);

// Instanciar o serviço de email
const emailService = new EmailService();

/**
 * POST /request-local-password
 * Solicitar definição de senha para usuário sem senha local
 */
router.post('/request-local-password', combinedRateLimiter, async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório.' });
    }

    try {
        // Verificar se o usuário existe
        const userExists = await emailService.userExists(email);
        if (!userExists) {
            logger.warn('Tentativa de solicitar definição de senha para email inexistente', { email, ip: req.ip });
            return res.status(404).json({ error: 'Email não encontrado.' });
        }

        // Verificar se o usuário já tem senha
        const hasPassword = await emailService.userHasPassword(email);
        if (hasPassword) {
            logger.warn('Tentativa de solicitar definição de senha para usuário que já tem senha', { email, ip: req.ip });
            return res.status(400).json({ error: 'Este usuário já possui senha definida.' });
        }

        // Gerar token para definição de senha
        const token = emailService.generatePasswordToken(email, 'set');
        
        // Enviar email
        const emailSent = await emailService.sendSetPasswordEmail(email, token);
        if (!emailSent) {
            logger.error('Erro ao enviar email de definição de senha', { email });
            return res.status(500).json({ error: 'Erro ao enviar email. Tente novamente.' });
        }

        // Log de auditoria
        logger.info('Solicitação de definição de senha processada com sucesso', {
            email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            message: 'Email de definição de senha enviado com sucesso.',
            email: email
        });

    } catch (error) {
        logger.error('Erro ao processar solicitação de definição de senha', {
            error: error.message,
            email,
            ip: req.ip
        });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * POST /request-password-reset
 * Solicitar redefinição de senha para usuário que esqueceu a senha
 */
router.post('/request-password-reset', combinedRateLimiter, async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório.' });
    }

    try {
        // Verificar se o usuário existe
        const userExists = await emailService.userExists(email);
        if (!userExists) {
            logger.warn('Tentativa de solicitar redefinição de senha para email inexistente', { email, ip: req.ip });
            return res.status(404).json({ error: 'Email não encontrado.' });
        }

        // Verificar se o usuário tem senha
        const hasPassword = await emailService.userHasPassword(email);
        if (!hasPassword) {
            logger.warn('Tentativa de solicitar redefinição de senha para usuário sem senha', { email, ip: req.ip });
            return res.status(400).json({ error: 'Este usuário não possui senha definida. Use o endpoint de definição de senha.' });
        }

        // Gerar token para redefinição de senha
        const token = emailService.generatePasswordToken(email, 'reset');
        
        // Enviar email
        const emailSent = await emailService.sendResetPasswordEmail(email, token);
        if (!emailSent) {
            logger.error('Erro ao enviar email de redefinição de senha', { email });
            return res.status(500).json({ error: 'Erro ao enviar email. Tente novamente.' });
        }

        // Log de auditoria
        logger.info('Solicitação de redefinição de senha processada com sucesso', {
            email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            message: 'Email de redefinição de senha enviado com sucesso.',
            email: email
        });

    } catch (error) {
        logger.error('Erro ao processar solicitação de redefinição de senha', {
            error: error.message,
            email,
            ip: req.ip
        });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * POST /password
 * Rota unificada para definir/alterar senha usando token válido
 * Aceita tokens de qualquer tipo (set ou reset)
 */
router.post('/password', async (req, res) => {
    const { token, email, password, confirmPassword } = req.body;

    if (!token || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Token, email, senha e confirmação são obrigatórios.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'As senhas não coincidem.' });
    }

    // Validação básica de senha
    if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    try {
        // Verificar se o token é válido
        const payload = emailService.verifyPasswordToken(token);
        if (!payload) {
            return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }

        // Verificar se o email corresponde ao token
        if (payload.email !== email) {
            return res.status(400).json({ error: 'Token inválido para este email.' });
        }

        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atualizar senha no banco
        await sequelize.query(
            `UPDATE users SET password = :password WHERE email = :email`,
            { replacements: { password: hashedPassword, email } }
        );

        // Log de auditoria
        logger.info('Senha atualizada com sucesso', {
            email,
            tokenType: payload.type,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.status(200).json({
            success: true,
            message: 'Senha atualizada com sucesso.',
            email: email
        });

    } catch (error) {
        logger.error('Erro ao atualizar senha', {
            error: error.message,
            email,
            ip: req.ip
        });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * GET /verify-token
 * Verificar se o token é válido (usado pelo frontend para validar link)
 */
router.get('/verify-token', async (req, res) => {
    const { token, email, type } = req.query;

    if (!token || !email || !type) {
        return res.status(400).json({ error: 'Token, email e tipo são obrigatórios.' });
    }

    try {
        // Verificar se o token é válido
        const payload = emailService.verifyPasswordToken(token);
        if (!payload) {
            return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }

        // Verificar se o email e tipo correspondem ao token
        if (payload.email !== email || payload.type !== type) {
            return res.status(400).json({ error: 'Token inválido para este email ou tipo.' });
        }

        res.status(200).json({
            success: true,
            message: 'Token válido.',
            email: payload.email,
            type: payload.type,
            expiresAt: payload.exp
        });

    } catch (error) {
        logger.error('Erro ao verificar token', { error: error.message, email, type });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * POST /set-password
 * Definir nova senha usando token válido
 */
router.post('/set-password', async (req, res) => {
    const { token, email, password, confirmPassword } = req.body;

    if (!token || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Token, email, senha e confirmação são obrigatórios.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Senhas não coincidem.' });
    }

    // Validação de senha
    if (password.length < 8) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres.' });
    }

    try {
        // Verificar se o token é válido
        const payload = emailService.verifyPasswordToken(token);
        if (!payload) {
            return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }

        // Verificar se o email e tipo correspondem ao token
        if (payload.email !== email || payload.type !== 'set') {
            return res.status(400).json({ error: 'Token inválido para este email ou tipo.' });
        }

        // Verificar se o usuário existe
        const userExists = await emailService.userExists(email);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // Verificar se o usuário já tem senha
        const hasPassword = await emailService.userHasPassword(email);
        if (hasPassword) {
            return res.status(400).json({ error: 'Este usuário já possui senha definida.' });
        }

        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atualizar senha no banco
        await sequelize.query(
            `UPDATE users SET pass = :hashedPassword WHERE email = :email`,
            { replacements: { hashedPassword, email } }
        );

        logger.info('Senha definida com sucesso', { email, ip: req.ip });

        res.status(200).json({
            success: true,
            message: 'Senha definida com sucesso.'
        });

    } catch (error) {
        logger.error('Erro ao definir senha', { error: error.message, email });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * POST /reset-password
 * Redefinir senha usando token válido
 */
router.post('/reset-password', async (req, res) => {
    const { token, email, password, confirmPassword } = req.body;

    if (!token || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'Token, email, senha e confirmação são obrigatórios.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Senhas não coincidem.' });
    }

    // Validação de senha
    if (password.length < 8) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres.' });
    }

    try {
        // Verificar se o token é válido
        const payload = emailService.verifyPasswordToken(token);
        if (!payload) {
            return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }

        // Verificar se o email e tipo correspondem ao token
        if (payload.email !== email || payload.type !== 'reset') {
            return res.status(400).json({ error: 'Token inválido para este email ou tipo.' });
        }

        // Verificar se o usuário existe
        const userExists = await emailService.userExists(email);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // Verificar se o usuário tem senha
        const hasPassword = await emailService.userHasPassword(email);
        if (!hasPassword) {
            return res.status(400).json({ error: 'Este usuário não possui senha definida.' });
        }

        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atualizar senha no banco
        await sequelize.query(
            `UPDATE users SET pass = :hashedPassword WHERE email = :email`,
            { replacements: { hashedPassword, email } }
        );

        logger.info('Senha redefinida com sucesso', { email, ip: req.ip });

        res.status(200).json({
            success: true,
            message: 'Senha redefinida com sucesso.'
        });

    } catch (error) {
        logger.error('Erro ao redefinir senha', { error: error.message, email });
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * Rota para redirecionamento seguro do email para o app
 * Valida o token e redireciona para o deep link
 */
router.get('/redirect/:action/:token', async (req, res) => {
    try {
        const { action, token } = req.params;
        const { email } = req.query;
        
        if (!token || !email) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Erro - Parâmetros Inválidos</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .error { color: #f44336; margin-bottom: 20px; }
                            .info { color: #666; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">❌ Erro</h1>
                            <p class="info">Token ou email não fornecidos.</p>
                            <p class="info">Verifique se o link está completo.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        // Valida o token usando o EmailService
        const emailService = new EmailService();
        const payload = emailService.verifyPasswordToken(token);
        
        if (!payload) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Token Inválido ou Expirado</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .error { color: #f44336; margin-bottom: 20px; }
                            .info { color: #666; }
                            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">⏰ Token Expirado</h1>
                            <div class="warning">
                                <strong>⚠️ Este link expirou ou é inválido.</strong>
                                <p>Os links de senha são válidos por apenas 15 minutos.</p>
                            </div>
                            <p class="info">Solicite um novo link através do aplicativo.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        // Verifica se o email do token corresponde ao email da query
        if (payload.email !== email) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Email Não Confere</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .error { color: #f44336; margin-bottom: 20px; }
                            .info { color: #666; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">❌ Email Não Confere</h1>
                            <p class="info">O email do token não corresponde ao email fornecido.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        // Verifica se a ação é válida
        if (!['set-password', 'reset-password', 'password'].includes(action)) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Ação Inválida</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .error { color: #f44336; margin-bottom: 20px; }
                            .info { color: #666; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">❌ Ação Inválida</h1>
                            <p class="info">A ação solicitada não é válida.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        // Se for a ação 'password', redireciona para página web com modal
        if (action === 'password') {
            const deepLinkUrl = `myapp://password-reset?token=${token}&email=${encodeURIComponent(email)}`;
            
            // Log da tentativa de redirecionamento para app
            logger.info('Redirecionamento para app via deep link', {
                action,
                email,
                token: token.substring(0, 20) + '...',
                deepLinkUrl
            });

            // Página de redirecionamento para o app
            res.send(`
                <html>
                    <head>
                        <title>Redirecionando para o App...</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { 
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                                text-align: center; 
                                padding: 20px; 
                                background: #f8f9fa;
                                color: #333;
                                margin: 0;
                                min-height: 100vh;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            }
                            .container { 
                                max-width: 400px; 
                                margin: 0 auto; 
                                background: white; 
                                padding: 30px; 
                                border-radius: 15px; 
                                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                                border: 1px solid #e9ecef;
                            }
                            .success { 
                                color: #28a745; 
                                margin-bottom: 20px;
                                font-size: 20px;
                            }
                            .loading { 
                                display: inline-block; 
                                width: 30px; 
                                height: 30px; 
                                border: 3px solid #e9ecef; 
                                border-radius: 50%; 
                                border-top-color: #28a745; 
                                animation: spin 1s ease-in-out infinite; 
                                margin: 20px auto;
                            }
                            @keyframes spin { to { transform: rotate(360deg); } }
                            .message {
                                color: #6c757d;
                                margin: 15px 0;
                                font-size: 14px;
                            }
                            .countdown {
                                font-size: 24px;
                                font-weight: bold;
                                color: #007bff;
                                margin: 20px 0;
                            }
                            .deep-link-btn {
                                display: inline-block;
                                background: #28a745;
                                color: white;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 8px;
                                margin: 15px 0;
                                font-weight: bold;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="loading"></div>
                            <h2 class="success">✅ Link Válido!</h2>
                            <p class="message">Redirecionando para o app em <span id="countdown">5</span> segundos...</p>
                            
                            <div class="countdown" id="countdown-display">5</div>
                            
                            <p class="message">Se o redirecionamento automático não funcionar, clique no botão abaixo:</p>
                            
                            <a href="${deepLinkUrl}" class="deep-link-btn">📱 Abrir no App</a>
                            
                            <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 8px; font-size: 14px;">
                                <strong>🔗 Link direto:</strong><br>
                                <a href="${deepLinkUrl}" style="color: #007bff; word-break: break-all;">${deepLinkUrl}</a>
                            </div>
                        </div>

                        <script>
                            // Contador regressivo
                            let countdown = 5;
                            const countdownElement = document.getElementById('countdown');
                            const countdownDisplay = document.getElementById('countdown-display');
                            
                            const timer = setInterval(() => {
                                countdown--;
                                countdownElement.textContent = countdown;
                                countdownDisplay.textContent = countdown;
                                
                                if (countdown <= 0) {
                                    clearInterval(timer);
                                    // Tenta abrir o app via deep link
                                    window.location.href = '${deepLinkUrl}';
                                }
                            }, 1000);
                        </script>
                    </body>
                </html>
            `);
            return;
        }

        // Gera o deep link para o app (para ações set-password e reset-password)
        const deepLinkUrl = `myapp://${action}?token=${token}&email=${encodeURIComponent(email)}`;
        
        // Log da tentativa de redirecionamento
        logger.info('Tentativa de redirecionamento para app via deep link', {
            action,
            email,
            token: token.substring(0, 20) + '...',
            deepLinkUrl
        });

        // Página de redirecionamento com contador e fallback
        res.send(`
            <html>
                <head>
                    <title>Redirecionando para o App...</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                            text-align: center; 
                            padding: 20px; 
                            background: #f8f9fa;
                            color: #333;
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .container { 
                            max-width: 400px; 
                            margin: 0 auto; 
                            background: white; 
                            padding: 30px; 
                            border-radius: 15px; 
                            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                            border: 1px solid #e9ecef;
                        }
                        .success { 
                            color: #28a745; 
                            margin-bottom: 20px;
                            font-size: 20px;
                        }
                        .loading { 
                            display: inline-block; 
                            width: 30px; 
                            height: 30px; 
                            border: 3px solid #e9ecef; 
                            border-radius: 50%; 
                            border-top-color: #28a745; 
                            animation: spin 1s ease-in-out infinite; 
                            margin: 20px auto;
                        }
                        @keyframes spin { to { transform: rotate(360deg); } }
                        .message {
                            color: #6c757d;
                            margin: 15px 0;
                            font-size: 14px;
                        }
                        .countdown {
                            font-size: 24px;
                            font-weight: bold;
                            color: #007bff;
                            margin: 20px 0;
                        }
                        .fallback {
                            margin-top: 20px;
                            padding: 15px;
                            background: #e9ecef;
                            border-radius: 8px;
                            font-size: 14px;
                        }
                        .deep-link-btn {
                            display: inline-block;
                            background: #28a745;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 8px;
                            margin: 15px 0;
                            font-weight: bold;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="loading"></div>
                        <h2 class="success">✅ Link Válido!</h2>
                        <p class="message">Redirecionando para o app em <span id="countdown">5</span> segundos...</p>
                        
                        <div class="countdown" id="countdown-display">5</div>
                        
                        <p class="message">Se o redirecionamento automático não funcionar, clique no botão abaixo:</p>
                        
                        <a href="${deepLinkUrl}" class="deep-link-btn">📱 Abrir no App</a>
                        
                        <div class="fallback">
                            <strong>🔗 Link direto:</strong><br>
                            <a href="${deepLinkUrl}" style="color: #007bff; word-break: break-all;">${deepLinkUrl}</a>
                        </div>
                    </div>

                    <script>
                        // Contador regressivo
                        let countdown = 5;
                        const countdownElement = document.getElementById('countdown');
                        const countdownDisplay = document.getElementById('countdown-display');
                        
                        const timer = setInterval(() => {
                            countdown--;
                            countdownElement.textContent = countdown;
                            countdownDisplay.textContent = countdown;
                            
                            if (countdown <= 0) {
                                clearInterval(timer);
                                // Tenta abrir o app via deep link
                                window.location.href = '${deepLinkUrl}';
                            }
                        }, 1000);
                        
                        // Fallback: se após 6 segundos não abriu, mostra mensagem
                        setTimeout(() => {
                            if (countdown <= 0) {
                                document.querySelector('.message').innerHTML = 
                                    'Se o app não abriu automaticamente, clique no botão acima ou copie o link direto.';
                            }
                        }, 6000);
                    </script>
                </body>
            </html>
        `);

    } catch (error) {
        logger.error('Erro na rota de redirecionamento', { error: error.message, params: req.params, query: req.query });
        res.status(500).send(`
            <html>
                <head>
                    <title>Erro Interno</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .error { color: #f44336; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="error">❌ Erro Interno</h1>
                        <p>Ocorreu um erro inesperado. Tente novamente mais tarde.</p>
                    </div>
                </body>
            </html>
        `);
    }
});

module.exports = router;
