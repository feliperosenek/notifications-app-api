const express = require('express');
const router = express.Router();
const axios = require('axios');
const sequelize = require('../config/database');
const { logger } = require('../middleware/logger');

/**
 * POST /create-task
 * Cria uma nova tarefa no ClickUp
 */
router.post('/create-task', async (req, res) => {
    const { userId, name, description, priority, tags } = req.body;

    if (!userId || !name || !description) {
        return res.status(400).json({
            error: 'Os campos userId, name e description são obrigatórios.',
        });
    }

    try {
        const [user] = await sequelize.query(
            `SELECT clickup_token, clickup_list FROM users WHERE id = :userId`,
            { replacements: { userId } }
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const { clickup_token, clickup_list } = user[0];

        if (!clickup_token || !clickup_list) {
            return res.status(400).json({
                error: 'Token ou lista do ClickUp não configurados para este usuário.',
            });
        }

        const taskData = {
            name,
            description,
            priority: priority || 3,
            tags: tags || [],
        };

        const response = await axios.post(
            `https://api.clickup.com/api/v2/list/${clickup_list}/task`,
            taskData,
            {
                headers: {
                    Authorization: clickup_token,
                    'Content-Type': 'application/json',
                },
            }
        );

        const taskUrl = response.data.url;
        
        logger.task('Tarefa criada no ClickUp', {
            userId,
            taskUrl,
            name
        });

        return res.status(201).json({
            success: true,
            message: 'Tarefa criada com sucesso.',
            taskUrl,
        });
    } catch (error) {
        logger.error('Erro ao criar tarefa no ClickUp', {
            error: error.response?.data || error.message,
            userId
        });
        res.status(500).json({
            error: 'Erro ao criar tarefa no ClickUp.',
            details: error.response?.data || error.message,
        });
    }
});

module.exports = router; 