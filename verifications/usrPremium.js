const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Configuração do Sequelize
const sequelize = new Sequelize('railway', 'postgres', 'VaGnIdrpgcKBJmAyBEyAyOrlxwJClYOz', {
  host: 'autorack.proxy.rlwy.net',
  dialect: 'postgres',
  port: 45376,
  logging: false,
});

/**
 * Verifica se um usuário é premium e retorna o UUID do premium
 * @param {number} userId - ID do usuário a ser verificado
 * @returns {Promise<{isPremium: boolean, premiumId: string|null}>} - Objeto contendo status do premium e UUID
 */
async function usrPremium(userId) {
  try {
    // Consulta o usuário no banco de dados
    const [user] = await sequelize.query(
      `SELECT premium FROM users WHERE id = :userId`,
      { replacements: { userId } }
    );

    if (user.length === 0) {
      return {
        isPremium: false,
        premiumId: null
      };
    }

    const premiumId = user[0].premium;

    // Verifica se o premium é um UUID válido
    const isValidUUID = uuidv4.validate(premiumId);

    return {
      isPremium: isValidUUID,
      premiumId: isValidUUID ? premiumId : null
    };

  } catch (error) {
    console.error('Erro ao verificar status premium do usuário:', error);
    throw new Error('Erro ao verificar status premium do usuário');
  }
}

module.exports = usrPremium; 