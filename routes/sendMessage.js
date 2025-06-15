const express = require('express');
const router = express.Router();
const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const { messaging } = require('../firebaseAdmin');
const messageRateLimit = require('../verifications/messageRateLimit');
const { logger } = require('../middleware/logger');

// Função auxiliar para enviar notificação Expo
const sendExpoPushNotification = async (token, title, body, data = {}) => {
  const messageData = {
    to: token,
    sound: 'default',
    title: title,
    vibrate: true,
    icon: data.type,
    body: body,
    channelId: data.type,
  };

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageData),
  });

  const result = await response.json();
  console.log('Resposta do Expo:', result);
  return result;
};

const injectDependencies = (sequelize, clientsByRoute) => {
  router.post('/', messageRateLimit, async (req, res) => {
    const { message, category, route, type, channel, content, custom_attributes } = req.body;

    if (!message || !category || !route) {
      logger.message('Requisição inválida - campos obrigatórios ausentes', {
        body: req.body,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ error: 'Mensagem, categoria e rota são obrigatórias.' });
    }

    try {
      const [result] = await sequelize.query(
        `SELECT id, token_notification_android, token_notification_web FROM users WHERE route = :route`,
        { replacements: { route } }
      );

      if (result.length === 0) {
        logger.message(`Rota ${route} não encontrada no banco de dados.`);
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      const userId = result[0].id;
      logger.message('Usuário encontrado', { userId, route });

      const [insertResult] = await sequelize.query(
        `INSERT INTO messages (
          message, type, category, route, channel, content, custom_attributes, user_id, datetime, status
        ) VALUES (
          :message, :type, :category, :route, :channel, :content, :custom_attributes, :user_id, NOW(), 'active'
        ) RETURNING *`,
        {
          replacements: {
            message,
            type: type || 'info',
            category,
            route,
            channel: channel || 'default',
            content,
            custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null,
            user_id: userId,
          },
        }
      );

      const insertedMessage = insertResult[0];
      var pushToken = null;

      if (result[0].token_notification_android) {
        pushToken = result[0].token_notification_android;
        logger.message('Token de notificação Android encontrado', { pushToken });
      }

      if (clientsByRoute[route]) {
        clientsByRoute[route].forEach((socketId) => {
          req.app.get('io').to(socketId).emit('new-message', insertedMessage);
        });
        logger.message(`Mensagem enviada via WebSocket para a rota ${route}`, { 
          messageId: insertedMessage.id,
          socketCount: clientsByRoute[route].length
        });
      } else if (pushToken) {
        const expoResult = await sendExpoPushNotification(pushToken, type + " - " + message, content, { type });
        logger.message('Notificação Expo enviada', { 
          messageId: insertedMessage.id,
          expoResult
        });
      }

      if (!result[0].token_notification_web) {
        logger.message(`Nenhum cliente conectado na rota ${route} e sem token push válido na Web`);
      }

      return res.status(200).json({
        success: true,
        message: 'Mensagem enviada e registrada com sucesso.',
        data: insertedMessage,
      });
    } catch (error) {
      logger.error('Erro ao processar mensagem:', { 
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  });

  return router;
};

module.exports = injectDependencies; 