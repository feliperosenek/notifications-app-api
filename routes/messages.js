const express = require('express');
const router = express.Router();
const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const { messaging } = require('../firebaseAdmin');

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

// Middleware para injetar sequelize e clientsByRoute
const injectDependencies = (sequelize) => {
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

      return res.status(200).json({ success: true, messages });
    } catch (error) {
      console.error('Erro ao recuperar mensagens:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  });

  return router;
};

module.exports = injectDependencies; 