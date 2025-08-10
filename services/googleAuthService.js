const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');

// Inicializar cliente OAuth2 do Google
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verificar e validar ID Token do Google
 * @param {string} idToken - Token ID recebido do Google
 * @returns {Object} Dados do usuário extraídos do token
 */
async function verifyGoogleToken(idToken) {
    try {
        logger.google('🔍 Iniciando verificação do token Google', { 
            tokenPreview: idToken.substring(0, 20) + '...',
            tokenLength: idToken.length
        });

        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        
        const userData = {
            googleId: payload.sub,
            email: payload.email,
            firstName: payload.given_name || '',
            lastName: payload.family_name || '',
            profilePicture: payload.picture,
            isVerified: payload.email_verified || false,
            locale: payload.locale || 'pt-BR'
        };

        logger.google('✅ Token Google verificado com sucesso', { 
            email: userData.email,
            googleId: userData.googleId,
            isVerified: userData.isVerified,
            locale: userData.locale
        });

        return userData;
    } catch (error) {
        logger.error('Erro ao verificar token Google', { 
            error: error.message,
            tokenPreview: idToken ? idToken.substring(0, 20) + '...' : 'undefined'
        });
        throw new Error('Token do Google inválido ou expirado');
    }
}

/**
 * Buscar usuário por Google ID
 * @param {string} googleId - ID do usuário no Google
 * @returns {Object|null} Dados do usuário ou null se não encontrado
 */
async function findUserByGoogleId(googleId) {
    try {
        const users = await sequelize.query(
            `SELECT * FROM users WHERE google_id = :googleId`,
            { 
                replacements: { googleId },
                type: sequelize.QueryTypes.SELECT 
            }
        );
        
        return users.length > 0 ? users[0] : null;
    } catch (error) {
        logger.error('Erro ao buscar usuário por Google ID', { 
            error: error.message, 
            googleId 
        });
        throw error;
    }
}

/**
 * Buscar usuário por email
 * @param {string} email - Email do usuário
 * @returns {Object|null} Dados do usuário ou null se não encontrado
 */
async function findUserByEmail(email) {
    try {
        const users = await sequelize.query(
            `SELECT * FROM users WHERE email = :email`,
            { 
                replacements: { email },
                type: sequelize.QueryTypes.SELECT 
            }
        );
        
        return users.length > 0 ? users[0] : null;
    } catch (error) {
        logger.error('Erro ao buscar usuário por email', { 
            error: error.message, 
            email 
        });
        throw error;
    }
}

/**
 * Criar novo usuário com dados do Google
 * @param {Object} userData - Dados do usuário do Google
 * @returns {Object} Dados do usuário criado
 */
async function createGoogleUser(userData) {
    try {
        logger.info('Criando novo usuário Google', { 
            email: userData.email,
            googleId: userData.googleId 
        });

        const newUser = await sequelize.query(
            `INSERT INTO users (
                first_name, 
                last_name, 
                email, 
                google_id, 
                profile_picture, 
                auth_provider, 
                is_verified, 
                created_at, 
                updated_at
            )
             VALUES (
                :firstName, 
                :lastName, 
                :email, 
                :googleId, 
                :profilePicture, 
                'google', 
                :isVerified, 
                NOW(), 
                NOW()
            )
             RETURNING *`,
            {
                replacements: {
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    email: userData.email,
                    googleId: userData.googleId,
                    profilePicture: userData.profilePicture,
                    isVerified: userData.isVerified
                },
                type: sequelize.QueryTypes.INSERT
            }
        );
        
        // Para INSERT com RETURNING, o resultado está em newUser[0]
        const createdUser = newUser[0][0];
        
        logger.user('Usuário Google criado com sucesso', {
            userId: createdUser.id,
            email: userData.email,
            authProvider: 'google'
        });

        return createdUser;
    } catch (error) {
        logger.error('Erro ao criar usuário Google', { 
            error: error.message,
            email: userData.email 
        });
        throw error;
    }
}

/**
 * Vincular conta Google a usuário existente
 * @param {number} userId - ID do usuário existente
 * @param {string} googleId - Google ID para vincular
 * @param {string} profilePicture - URL da foto de perfil
 * @returns {Object} Dados do usuário atualizado
 */
async function linkGoogleAccount(userId, googleId, profilePicture) {
    try {
        logger.info('Vinculando conta Google a usuário existente', { 
            userId, 
            googleId 
        });

        await sequelize.query(
            `UPDATE users 
             SET google_id = :googleId, 
                 profile_picture = :profilePicture, 
                 is_verified = true,
                 updated_at = NOW()
             WHERE id = :userId`,
            {
                replacements: {
                    userId,
                    googleId,
                    profilePicture
                }
            }
        );
        
        // Buscar usuário atualizado
        const updatedUser = await findUserByGoogleId(googleId);
        
        logger.user('Conta Google vinculada com sucesso', {
            userId,
            googleId,
            email: updatedUser.email
        });

        return updatedUser;
    } catch (error) {
        logger.error('Erro ao vincular conta Google', { 
            error: error.message, 
            userId, 
            googleId 
        });
        throw error;
    }
}

/**
 * Gerar JWT token para sessão
 * @param {Object} user - Dados do usuário
 * @returns {string} JWT token
 */
function generateJWT(user) {
    try {
        const payload = {
            userId: user.id,
            email: user.email,
            authProvider: user.auth_provider,
            isVerified: user.is_verified,
            iat: Math.floor(Date.now() / 1000)
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET, { 
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
            issuer: 'notifications-app',
            audience: 'notifications-app-users'
        });

        logger.info('JWT token gerado', {
            userId: user.id,
            email: user.email,
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });

        return token;
    } catch (error) {
        logger.error('Erro ao gerar JWT token', { 
            error: error.message,
            userId: user.id 
        });
        throw error;
    }
}

/**
 * Verificar JWT token
 * @param {string} token - JWT token para verificar
 * @returns {Object} Payload decodificado do token
 */
function verifyJWT(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'notifications-app',
            audience: 'notifications-app-users'
        });

        return decoded;
    } catch (error) {
        logger.error('Erro ao verificar JWT token', { 
            error: error.message 
        });
        throw new Error('Token de sessão inválido ou expirado');
    }
}

/**
 * Processar login com Google (fluxo completo)
 * @param {string} idToken - Token ID do Google
 * @returns {Object} Resultado do login com dados do usuário e token de sessão
 */
async function processGoogleLogin(idToken) {
    try {
        logger.google('🚀 Iniciando processamento do login Google', {
            tokenPreview: idToken.substring(0, 20) + '...'
        });

        // 1. Verificar token do Google
        const googleUserData = await verifyGoogleToken(idToken);
        
        // 2. Verificar se usuário já existe por Google ID
        let user = await findUserByGoogleId(googleUserData.googleId);
        
        logger.google('🔍 Verificação de usuário por Google ID', {
            googleId: googleUserData.googleId,
            email: googleUserData.email,
            userFound: !!user
        });

        if (!user) {
            // 3. Verificar se já existe usuário com mesmo email
            const existingUser = await findUserByEmail(googleUserData.email);
            
            logger.google('🔍 Verificação de usuário por email', {
                email: googleUserData.email,
                existingUserFound: !!existingUser,
                existingUserId: existingUser?.id,
                existingUserGoogleId: existingUser?.google_id,
                existingUserAuthProvider: existingUser?.auth_provider
            });
            
            if (existingUser) {
                // 4. Vincular conta Google à conta existente
                logger.info('Vinculando conta Google a usuário existente', { 
                    userId: existingUser.id,
                    email: googleUserData.email 
                });
                
                user = await linkGoogleAccount(
                    existingUser.id, 
                    googleUserData.googleId, 
                    googleUserData.profilePicture
                );
            } else {
                // 5. Criar novo usuário
                logger.info('Criando novo usuário via Google', { 
                    email: googleUserData.email 
                });
                
                user = await createGoogleUser(googleUserData);
            }
        } else {
            // 6. Usuário Google já existe, atualizar foto de perfil se necessário
            if (user.profile_picture !== googleUserData.profilePicture) {
                await sequelize.query(
                    `UPDATE users 
                     SET profile_picture = :profilePicture, 
                         updated_at = NOW()
                     WHERE id = :userId`,
                    {
                        replacements: {
                            userId: user.id,
                            profilePicture: googleUserData.profilePicture
                        }
                    }
                );
                user.profile_picture = googleUserData.profilePicture;
            }
        }

        // 7. Gerar token de sessão
        const sessionToken = generateJWT(user);

        // 8. Retornar dados completos
        logger.google('🎉 Login Google processado com sucesso', {
            userId: user.id,
            email: user.email,
            authProvider: user.auth_provider,
            isNewUser: !user.created_at || user.created_at === user.updated_at
        });

        return {
            success: true,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                profilePicture: user.profile_picture,
                authProvider: user.auth_provider,
                isVerified: user.is_verified,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            },
            token: sessionToken
        };

    } catch (error) {
        logger.error('❌ Erro no processamento do login Google', { 
            error: error.message,
            stack: error.stack
        });
        
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    verifyGoogleToken,
    findUserByGoogleId,
    findUserByEmail,
    createGoogleUser,
    linkGoogleAccount,
    generateJWT,
    verifyJWT,
    processGoogleLogin
};
