const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const { Expo } = require('expo-server-sdk');
require('dotenv').config()


const expo = new Expo();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Permitir qualquer origem
    methods: ['GET', 'POST'],
  },
});

// Middlewares
app.use(cors());
app.use(express.json());

// Configuração do Sequelize
const sequelize = new Sequelize('railway', 'postgres', 'VaGnIdrpgcKBJmAyBEyAyOrlxwJClYOz', {
  host: 'autorack.proxy.rlwy.net',
  dialect: 'postgres',
  port: 45376,
  logging: false, // Desativa logs de SQL no console
});

// Testar conexão com o banco de dados
sequelize
  .authenticate()
  .then(() => {
    console.log('Conexão com o banco de dados estabelecida com sucesso.');
  })
  .catch((err) => {
    console.error('Erro ao conectar ao banco de dados:', err);
  });

  const clientsByRoute = {};

// WebSocket - Quando um cliente se conecta
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  // Associar o cliente a uma rota
  socket.on('set-route', async (route) => {
    console.log(`Evento set-route recebido do cliente ${socket.id} com rota: ${route}`);

    try {
      // Verificar se a rota existe no banco de dados
      const [result] = await sequelize.query(
        `SELECT id FROM users WHERE route = :route`,
        { replacements: { route } }
      );

      // Log do resultado da consulta
      console.log(`Resultado da consulta ao banco para a rota ${route}:`, result);

      if (result.length === 0) {
        console.log(`Rota ${route} não encontrada no banco de dados.`);
        socket.emit('route-error', { error: 'Rota não encontrada.' });
        return;
      }

      console.log(`Rota ${route} validada para o cliente ${socket.id}.`);

      // Mapeia o cliente para a rota
      if (!clientsByRoute[route]) {
        clientsByRoute[route] = [];
      }

      // Verificar se o cliente já está associado à rota para evitar duplicidade
      if (!clientsByRoute[route].includes(socket.id)) {
        clientsByRoute[route].push(socket.id);
        console.log(`Cliente ${socket.id} associado à rota ${route}.`);
      } else {
        console.log(`Cliente ${socket.id} já estava associado à rota ${route}.`);
      }

      // Confirmação para o cliente
      socket.emit('route-set', { success: true, route });
    } catch (error) {
      console.error('Erro ao verificar rota no banco de dados:', error);
      socket.emit('route-error', { error: 'Erro ao verificar rota no banco de dados.' });
    }
  });

  // Gerenciar desconexões
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);

    // Remove o cliente de todas as rotas
    for (const route in clientsByRoute) {
      const initialLength = clientsByRoute[route].length;

      // Remove o cliente da rota
      clientsByRoute[route] = clientsByRoute[route].filter((id) => id !== socket.id);

      if (clientsByRoute[route].length < initialLength) {
        console.log(`Cliente ${socket.id} removido da rota ${route}.`);
      }

      // Remove a rota se não houver mais clientes conectados
      if (clientsByRoute[route].length === 0) {
        console.log(`Nenhum cliente restante na rota ${route}, removendo rota.`);
        delete clientsByRoute[route];
      }
    }
  });
});

app.post('/send-message', async (req, res) => {
  const { message, category, route, type, channel, content, custom_attributes } = req.body;

  if (!message || !category || !route) {
    return res.status(400).json({ error: 'Mensagem, categoria e rota são obrigatórias.' });
  }

  try {
    // Verificar se a rota existe no banco de dados
    const [result] = await sequelize.query(
      `SELECT id, token_notification FROM users WHERE route = :route`,
      { replacements: { route } }
    );

    if (result.length === 0) {
      console.log(`Rota ${route} não encontrada no banco de dados.`);
      return res.status(404).json({ error: 'Rota não encontrada.' });
    }

    const userId = result[0].id; // Obtém o ID do usuário associado

    // Inserir a mensagem no banco de dados diretamente via SQL
    const [insertResult] = await sequelize.query(
      `INSERT INTO messages (
        message, type, category, route, channel, content, custom_attributes, user_id, datetime, status
      ) VALUES (
        :message, :type, :category, :route, :channel, :content, :custom_attributes, :user_id, NOW(), 'active'
      ) RETURNING *`, // Retorna o registro inserido
      {
        replacements: {
          message,
          type: type || 'info', // Tipo padrão
          category,
          route,
          channel: channel || 'default', 
          content,
          custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null, // Serializa os atributos personalizados
          user_id: userId,
        },
      }
    );

    const insertedMessage = insertResult[0]; // Mensagem registrada no banco
    const pushToken = result[0].token_notification

    // Verificar se há clientes conectados à rota especificada
    if (clientsByRoute[route]) {
      clientsByRoute[route].forEach((socketId) => {
        io.to(socketId).emit('new-message', insertedMessage); // Envia a mensagem para os clientes conectados
      });

      console.log(`Mensagem enviada para a rota ${route}:`, insertedMessage);

    } else if (pushToken && Expo.isExpoPushToken(pushToken)) {
      // Enviar notificação push se não houver WebSocket conectado
      const notifications = [{
        to: pushToken,
        sound: 'default',
        title: `${type} - ${message}`,
        body: content,
        data: { custom_attributes },
      }];

      // Dividir notificações em chunks para envio
      try {
        const ticket = await expo.sendPushNotificationsAsync(notifications);
        console.log('Notificação enviada:', ticket);
      } catch (error) {
        console.error('Erro ao enviar notificação push:', error);
      }
    } else {
      console.log(`Nenhum cliente conectado na rota ${route} e sem token push válido.`);
    }


    return res.status(200).json({
      success: true,
      message: 'Mensagem enviada e registrada com sucesso.',
      data: insertedMessage,
    });
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.get('/get-messages/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'O ID do usuário é obrigatório.' });
  }

  try {
    // Consultar mensagens pelo ID do usuário
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


app.post('/database/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  try {
    // Verifica se o email existe
    const [user] = await sequelize.query(
      `SELECT * FROM users WHERE email = :email`,
      { replacements: { email } }
    );

    if (user.length === 0) {
      return res.status(404).json({ error: 'Email não encontrado.' });
    }

    const userRecord = user[0]; // Pega o registro do usuário

    // Compara a senha informada com a senha criptografada no banco
    const passwordMatch = await bcrypt.compare(password, userRecord.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Retorna sucesso com os dados do usuário (sem senha)
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
    console.error('Erro ao verificar login:', error);
    res.status(500).json({ error: 'Erro ao verificar login.' });
  }
});


app.post('/database/create-user', async (req, res) => {
  const { firstName, lastName, email, password } = req.body; // Recebe os dados do cliente

  try {
    // Verifica se o email já existe no banco
    const [existingUser] = await sequelize.query(
      `SELECT * FROM users WHERE email = :email`,
      { replacements: { email } }
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado.' });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insere o novo usuário no banco
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

      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso.',
        data: newUser,
      });
    }

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário.', details: error.message });
  }
});

// Verifica a rota do usuário
app.post('/database/check-route', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
  }

  try {
    const [result] = await sequelize.query(
      `SELECT route FROM users WHERE id = :userId`,
      { replacements: { userId } }
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.status(200).json({ success: true, route: result[0].route });
  } catch (error) {
    console.error('Erro ao verificar rota:', error);
    res.status(500).json({ error: 'Erro ao verificar rota.' });
  }
});

// Verifica se uma rota já existe
app.post('/database/check-route-availability', async (req, res) => {
  const { route } = req.body;

  if (!route) {
    return res.status(400).json({ error: 'A rota é obrigatória.' });
  }

  try {
    const [result] = await sequelize.query(
      `SELECT id FROM users WHERE route = :route`,
      { replacements: { route } }
    );

    if (result.length > 0) {
      return res.status(400).json({ error: 'Rota já em uso.' });
    }

    res.status(200).json({ success: true, available: true });
  } catch (error) {
    console.error('Erro ao verificar disponibilidade da rota:', error);
    res.status(500).json({ error: 'Erro ao verificar disponibilidade da rota.' });
  }
});

// Configura uma nova rota para o usuário
app.post('/database/set-route', async (req, res) => {
  var { userId, route } = req.body;

  if (!userId || !route) {
    return res.status(400).json({ error: 'ID do usuário e rota são obrigatórios.' });
  }

  route = route.toLowerCase()

  try {
    await sequelize.query(
      `UPDATE users SET route = :route WHERE id = :userId`,
      { replacements: { route, userId } }
    );

    res.status(200).json({ success: true, message: 'Rota configurada com sucesso.' });
  } catch (error) {
    console.error('Erro ao configurar rota:', error);
    res.status(500).json({ error: 'Erro ao configurar rota.' });
  }
});


// Rota para executar comandos SQL diretamente
app.post('/database', async (req, res) => {
  const { query } = req.body; // Recebe a query SQL no corpo da requisição
  console.log(query)
  if (!query) {
    return res.status(400).json({ error: 'A consulta SQL é obrigatória.' });
  }

  try {
    const [results] = await sequelize.query(query);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Erro ao executar consulta SQL:', error);
    res.status(500).json({ error: 'Erro ao executar consulta SQL.', details: error.message });
  }
});

const axios = require('axios');

app.post('/create-task', async (req, res) => {
  const { userId, name, description, priority, tags } = req.body;

  // Verifica se os parâmetros necessários foram fornecidos
  if (!userId || !name || !description) {
    return res.status(400).json({
      error: 'Os campos userId, name e description são obrigatórios.',
    });
  }

  try {
    // Busca o token e a lista do ClickUp no banco de dados
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

    // Configura os dados da tarefa
    const taskData = {
      name,
      description,
      priority: priority || 3, // Prioridade padrão caso não seja fornecida
      tags: tags || [], // Tags padrão como array vazio
    };

    // Envia a solicitação para a API do ClickUp
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

    // Retorna a URL da tarefa criada
    const taskUrl = response.data.url;
    return res.status(201).json({
      success: true,
      message: 'Tarefa criada com sucesso.',
      taskUrl,
    });
  } catch (error) {
    console.error('Erro ao criar tarefa no ClickUp:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Erro ao criar tarefa no ClickUp.',
      details: error.response?.data || error.message,
    });
  }
});



// Inicia o servidor
server.listen(process.env.PORT, '0.0.0.0', () => {
  console.log('Servidor rodando na porta'+process.env.PORT);
});
