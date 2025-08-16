const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const sequelize = require('../config/database');
const { logger, loggerMiddleware } = require('../middleware/logger');
const { 
    processGoogleLogin, 
    verifyJWT, 
    generateJWT,
    findUserByEmail 
} = require('../services/googleAuthService');

// Aplica o middleware de logs
router.use(loggerMiddleware);

/**
 * POST /login
 * Autenticação de usuário
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
        const [user] = await sequelize.query(
            `SELECT * FROM users WHERE email = :email`,
            { replacements: { email } }
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'Email não encontrado.' });
        }

        const userRecord = user[0];
        const passwordMatch = await bcrypt.compare(password, userRecord.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Senha incorreta.' });
        }

        logger.user('Login realizado com sucesso', {
            userId: userRecord.id,
            email: userRecord.email
        });

        res.status(200).json({
            success: true,
            message: 'Login bem-sucedido.',
            user: {
                id: userRecord.id,
                firstName: userRecord.first_name,
                lastName: userRecord.last_name,
                email: userRecord.email,
            },
        });
    } catch (error) {
        logger.error('Erro ao verificar login', {
            error: error.message,
            email
        });
        res.status(500).json({ error: 'Erro ao verificar login.' });
    }
});

/**
 * POST /create-user
 * Criação de novo usuário
 */
router.post('/create-user', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
        const [existingUser] = await sequelize.query(
            `SELECT * FROM users WHERE email = :email`,
            { replacements: { email } }
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Email já cadastrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await sequelize.query(
            `INSERT INTO users (first_name, last_name, email, password)
             VALUES (:firstName, :lastName, :email, :hashedPassword)
             RETURNING id`,
            {
                replacements: {
                    firstName,
                    lastName,
                    email,
                    hashedPassword,
                },
            }
        );

        logger.user('Usuário criado com sucesso', {
            userId: newUser[0].id,
            email
        });

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso.',
            data: newUser,
        });
    } catch (error) {
        logger.error('Erro ao criar usuário', {
            error: error.message,
            email
        });
        res.status(500).json({ error: 'Erro ao criar usuário.', details: error.message });
    }
});

/**
 * POST /google-login
 * Autenticação com Google OAuth (ID Token)
 */
router.post('/google-login', async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ 
            success: false,
            error: 'ID Token do Google é obrigatório.' 
        });
    }

    try {
        logger.info('Iniciando login com Google', { 
            tokenPreview: idToken.substring(0, 20) + '...' 
        });

        const result = await processGoogleLogin(idToken);

        if (result.success) {
            logger.user('Login Google realizado com sucesso', {
                userId: result.user.id,
                email: result.user.email,
                authProvider: result.user.authProvider
            });

            res.status(200).json({
                success: true,
                message: 'Login com Google realizado com sucesso.',
                user: result.user,
                token: result.token
            });
        } else {
            logger.warn('Falha no login Google', { 
                error: result.error 
            });

            res.status(401).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error('Erro no endpoint de login Google', {
            error: error.message
        });
        res.status(500).json({ 
            success: false,
            error: 'Erro interno do servidor.' 
        });
    }
});

/**
 * GET /google-callback
 * Callback para Google OAuth (Authorization Code Flow) - Recebe via GET
 */
router.get('/google-callback', async (req, res) => {
    const { code, state, scope, error, error_description } = req.query;

    logger.google('📥 Callback GET recebido do Google', {
        hasCode: !!code,
        hasError: !!error,
        state,
        scope,
        codePreview: code ? code.substring(0, 20) + '...' : null,
        error: error || null,
        errorDescription: error_description || null
    });

    // Se houve erro na autorização
    if (error) {
        logger.warn('❌ Erro na autorização Google', { 
            error, 
            error_description 
        });
        
        return res.status(400).send(`
            <html>
                <head><title>Erro na Autorização</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>❌ Erro na Autorização Google</h2>
                    <p><strong>Erro:</strong> ${error}</p>
                    <p><strong>Descrição:</strong> ${error_description || 'Autorização negada pelo usuário'}</p>
                    <p><a href="/auth/google-login">Tentar novamente</a></p>
                </body>
            </html>
        `);
    }

    if (!code) {
        logger.warn('⚠️ Callback sem authorization code');
        return res.status(400).send(`
            <html>
                <head><title>Código de Autorização Ausente</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>⚠️ Código de autorização não fornecido</h2>
                    <p>O Google não enviou o código de autorização necessário.</p>
                    <p><a href="/auth/google-login">Tentar novamente</a></p>
                </body>
            </html>
        `);
    }

    try {
        // Processar login completo com authorization code
        logger.google('🔄 Processando login completo com authorization code', {
            codeLength: code.length,
            state,
            scope
        });

        // Processar authorization code usando google-auth-library
        const { OAuth2Client } = require('google-auth-library');
        const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `https://api.easynotificationspost.dev`
        );

        logger.google('🔄 Trocando authorization code por tokens', {
            clientId: process.env.GOOGLE_CLIENT_ID,
            hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
            redirectUri: `https://api.easynotificationspost.dev/auth/google-callback`
        });

        let loginResult;
        
        try {
            // Trocar authorization code por tokens
            const { tokens } = await oauth2Client.getToken(code);
            
            logger.google('✅ Tokens obtidos com sucesso', {
                hasAccessToken: !!tokens.access_token,
                hasIdToken: !!tokens.id_token,
                hasRefreshToken: !!tokens.refresh_token
            });

            if (!tokens.id_token) {
                throw new Error('ID token não recebido do Google');
            }

            // Processar login com o ID token
            loginResult = await processGoogleLogin(tokens.id_token);
            
            if (loginResult.success) {
                // Adicionar tokens do Google ao resultado
                loginResult.googleTokens = {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expiry_date
                };
            }
        } catch (tokenError) {
            logger.error('❌ Erro ao trocar authorization code', {
                error: tokenError.message,
                code: code.substring(0, 20) + '...'
            });
            
            loginResult = {
                success: false,
                error: `Erro ao processar authorization code: ${tokenError.message}`
            };
        }

        if (loginResult.success) {
            // Login bem-sucedido - redirecionar para o app via deep link
            const user = loginResult.user;
            const token = loginResult.token;
            
            logger.google('🎉 Login Google via callback concluído com sucesso', {
                userId: user.id,
                email: user.email,
                authProvider: user.authProvider
            });

            // URL do deep link para o seu app (configurável via env)
            const appScheme = process.env.APP_DEEP_LINK_SCHEME || 'notificationsapp';
            const deepLinkUrl = `myapp://login-success?user=${user.email}`;

            logger.google('🔗 Deep link gerado', {
                userId: user.id,
                email: user.email,
                deepLinkPreview: deepLinkUrl.substring(0, 100) + '...'
            });

            // Redirecionamento automático para o app via deep link
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
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="loading"></div>
                            <h2 class="success">✅ Login Realizado com Sucesso!</h2>
                            <p class="message">Redirecionando para o app...</p>
                        </div>

                        <script>
                            // Redirecionamento automático após 1 segundo
                            setTimeout(() => {
                                window.location.href = '${deepLinkUrl}';
                            }, 1000);
                        </script>
                    </body>
                </html>
            `);
        } else {
            // Erro no login
            logger.warn('❌ Falha no login Google via callback', {
                error: loginResult.error
            });

            res.status(400).send(`
                <html>
                    <head>
                        <title>Erro no Login Google</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .error { color: #f44336; }
                            .error-details { background: #ffebee; padding: 20px; border-radius: 10px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2 class="error">❌ Erro no Login Google</h2>
                            <div class="error-details">
                                <p><strong>Erro:</strong> ${loginResult.error}</p>
                                <p>Não foi possível completar o login com sua conta Google.</p>
                            </div>
                            <p><a href="/">← Voltar ao início</a></p>
                        </div>
                    </body>
                </html>
            `);
        }

    } catch (error) {
        logger.error('❌ Erro ao processar callback GET', {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).send(`
            <html>
                <head><title>Erro no Servidor</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>❌ Erro no Servidor</h2>
                    <p>Ocorreu um erro ao processar o callback do Google.</p>
                    <p><strong>Erro:</strong> ${error.message}</p>
                    <p><a href="/auth/google-login">Tentar novamente</a></p>
                </body>
            </html>
        `);
    }
});

/**
 * POST /google-callback
 * Callback para Google OAuth (Authorization Code Flow) - Recebe via POST
 */
router.post('/google-callback', async (req, res) => {
    const { code, redirect_uri, device_id, device_name } = req.body;

    if (!code) {
        return res.status(400).json({ 
            success: false,
            error: 'Código de autorização é obrigatório.' 
        });
    }

    try {
        logger.google('📥 Callback POST recebido', { 
            codePreview: code.substring(0, 20) + '...',
            redirect_uri,
            device_id 
        });

        // Processar authorization code usando google-auth-library
        const { OAuth2Client } = require('google-auth-library');
        const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri || `https://api.easynotificationspost.dev/auth/google-callback`
        );

        let loginResult;
        
        try {
            // Trocar authorization code por tokens
            const { tokens } = await oauth2Client.getToken(code);
            
            if (!tokens.id_token) {
                throw new Error('ID token não recebido do Google');
            }

            // Processar login com o ID token
            loginResult = await processGoogleLogin(tokens.id_token);
            
            if (loginResult.success) {
                // Adicionar tokens do Google ao resultado
                loginResult.googleTokens = {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expiry_date
                };
            }
        } catch (tokenError) {
            logger.error('❌ Erro ao trocar authorization code POST', {
                error: tokenError.message,
                code: code.substring(0, 20) + '...'
            });
            
            loginResult = {
                success: false,
                error: `Erro ao processar authorization code: ${tokenError.message}`
            };
        }

        if (loginResult.success) {
            logger.google('🎉 Login Google via POST callback concluído', {
                userId: loginResult.user.id,
                email: loginResult.user.email
            });

            res.status(200).json({
                success: true,
                message: 'Login com Google realizado com sucesso via authorization code.',
                user: loginResult.user,
                token: loginResult.token,
                googleTokens: loginResult.googleTokens || null,
                device_id: device_id || null
            });
        } else {
            logger.warn('❌ Falha no login Google via POST callback', {
                error: loginResult.error
            });

            res.status(400).json({
                success: false,
                error: loginResult.error
            });
        }

    } catch (error) {
        logger.error('Erro no callback Google POST', {
            error: error.message
        });
        res.status(500).json({ 
            success: false,
            error: 'Erro interno do servidor.' 
        });
    }
});

/**
 * POST /verify-token
 * Verificar se JWT token é válido
 */
router.post('/verify-token', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ 
            success: false,
            error: 'Token é obrigatório.' 
        });
    }

    try {
        const decoded = verifyJWT(token);
        
        // Buscar dados atuais do usuário
        const [user] = await sequelize.query(
            `SELECT id, first_name, last_name, email, profile_picture, auth_provider, is_verified, created_at, updated_at 
             FROM users WHERE id = :userId`,
            { replacements: { userId: decoded.userId } }
        );

        if (user.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Usuário não encontrado.' 
            });
        }

        const userRecord = user[0];

        logger.info('Token verificado com sucesso', {
            userId: userRecord.id,
            email: userRecord.email
        });

        res.status(200).json({
            success: true,
            message: 'Token válido.',
            user: {
                id: userRecord.id,
                firstName: userRecord.first_name,
                lastName: userRecord.last_name,
                email: userRecord.email,
                profilePicture: userRecord.profile_picture,
                authProvider: userRecord.auth_provider,
                isVerified: userRecord.is_verified,
                createdAt: userRecord.created_at,
                updatedAt: userRecord.updated_at
            },
            tokenInfo: {
                userId: decoded.userId,
                email: decoded.email,
                authProvider: decoded.authProvider,
                issuedAt: new Date(decoded.iat * 1000),
                expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null
            }
        });

    } catch (error) {
        logger.warn('Token inválido ou expirado', { 
            error: error.message 
        });
        
        res.status(401).json({
            success: false,
            error: 'Token inválido ou expirado.'
        });
    }
});

/**
 * POST /refresh-token
 * Renovar JWT token
 */
router.post('/refresh-token', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ 
            success: false,
            error: 'Token atual é obrigatório.' 
        });
    }

    try {
        // Verificar token atual (mesmo que expirado, vamos aceitar se não passou muito tempo)
        let decoded;
        try {
            decoded = verifyJWT(token);
        } catch (error) {
            // Se o token expirou há pouco tempo, ainda podemos renovar
            const jwt = require('jsonwebtoken');
            decoded = jwt.decode(token);
            
            if (!decoded || !decoded.userId) {
                throw new Error('Token inválido');
            }
            
            // Verificar se não passou muito tempo desde a expiração (ex: máximo 1 dia)
            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp && (now - decoded.exp) > 86400) { // 1 dia = 86400 segundos
                throw new Error('Token expirado há muito tempo');
            }
        }

        // Buscar dados atuais do usuário
        const [user] = await sequelize.query(
            `SELECT * FROM users WHERE id = :userId`,
            { replacements: { userId: decoded.userId } }
        );

        if (user.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Usuário não encontrado.' 
            });
        }

        const userRecord = user[0];

        // Gerar novo token
        const newToken = generateJWT(userRecord);

        logger.user('Token renovado com sucesso', {
            userId: userRecord.id,
            email: userRecord.email
        });

        res.status(200).json({
            success: true,
            message: 'Token renovado com sucesso.',
            token: newToken,
            user: {
                id: userRecord.id,
                firstName: userRecord.first_name,
                lastName: userRecord.last_name,
                email: userRecord.email,
                profilePicture: userRecord.profile_picture,
                authProvider: userRecord.auth_provider,
                isVerified: userRecord.is_verified
            }
        });

    } catch (error) {
        logger.warn('Falha ao renovar token', { 
            error: error.message 
        });
        
        res.status(401).json({
            success: false,
            error: 'Não foi possível renovar o token. Faça login novamente.'
        });
    }
});

/**
 * POST /logout
 * Logout do usuário
 */
router.post('/logout', async (req, res) => {
    const { token } = req.body;

    try {
        if (token) {
            // Se token foi fornecido, verificar e logar o usuário
            try {
                const decoded = verifyJWT(token);
                logger.user('Logout realizado', {
                    userId: decoded.userId,
                    email: decoded.email
                });
            } catch (error) {
                // Token inválido, mas não é erro crítico para logout
                logger.info('Logout com token inválido', { 
                    error: error.message 
                });
            }
        } else {
            logger.info('Logout sem token fornecido');
        }

        res.status(200).json({
            success: true,
            message: 'Logout realizado com sucesso.'
        });

    } catch (error) {
        logger.error('Erro no logout', {
            error: error.message
        });
        
        // Mesmo com erro, considerar logout bem-sucedido
        res.status(200).json({
            success: true,
            message: 'Logout realizado com sucesso.'
        });
    }
});

module.exports = router; 