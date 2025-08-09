const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');

/**
 * GET /get-messages/:userId
 * Obtém mensagens de um usuário específico
 */
router.get('/get-messages/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'O ID do usuário é obrigatório.' });
    }

    try {
        const [messages] = await sequelize.query(
            `SELECT * FROM messages WHERE user_id = :userId ORDER BY datetime DESC`,
            { replacements: { userId } }
        );

       /* logger.message('Mensagens recuperadas', {
            userId,
            count: messages.length
        });*/

        return res.status(200).json({ success: true, messages });
    } catch (error) {
        logger.error('Erro ao recuperar mensagens', {
            error: error.message,
            userId
        });
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

/**
 * GET /get-messages-by-route/:route
 * Obtém mensagens por rota
 */
router.get('/get-messages-by-route/:route', async (req, res) => {
    const { route } = req.params;

    if (!route) {
        return res.status(400).json({ error: 'A rota é obrigatória.' });
    }

    try {
        const [messages] = await sequelize.query(
            `SELECT m.* FROM messages m 
             INNER JOIN users u ON m.user_id = u.id 
             WHERE u.route = :route 
             ORDER BY m.datetime DESC`,
            { replacements: { route } }
        );

        logger.message('Mensagens recuperadas por rota', {
            route,
            count: messages.length
        });

        return res.status(200).json({ success: true, messages });
    } catch (error) {
        logger.error('Erro ao recuperar mensagens por rota', {
            error: error.message,
            route
        });
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

module.exports = router; 