const { Sequelize } = require('sequelize');

// Verificar se todas as variáveis de ambiente necessárias estão definidas
const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias não definidas: ${missingVars.join(', ')}`);
}

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'postgres',
        port: parseInt(process.env.DB_PORT),
        logging: false,
    }
);

module.exports = sequelize; 