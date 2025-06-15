const express = require('express');
const http = require('http');
const cors = require('cors');
const { Sequelize } = require('sequelize');
require('dotenv').config();
const { messaging } = require('./firebaseAdmin');

// Importando as rotas
const messagesRouter = require('./routes/messages');
const authRouter = require('./routes/auth');
const routesRouter = require('./routes/routes');
const tasksRouter = require('./routes/tasks');
const databaseRouter = require('./routes/database');
const sendMessageRouter = require('./routes/sendMessage');
const setupWebSocket = require('./routes/websocket');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());

// Configuração do Sequelize
const sequelize = new Sequelize('railway', 'postgres', 'VaGnIdrpgcKBJmAyBEyAyOrlxwJClYOz', {
  host: 'autorack.proxy.rlwy.net',
  dialect: 'postgres',
  port: 45376,
  logging: false,
});

// Disponibiliza o sequelize para as rotas e middlewares
app.set('sequelize', sequelize);

// Testar conexão com o banco de dados
sequelize
  .authenticate()
  .then(() => {
    console.log('Conexão com o banco de dados estabelecida com sucesso.');
  })
  .catch((err) => {
    console.error('Erro ao conectar ao banco de dados:', err);
  });

// Configurar WebSocket
const { io, clientsByRoute } = setupWebSocket(server, sequelize);

// Disponibiliza o io para as rotas
app.set('io', io);

// Registrando as rotas
app.use('/messages', messagesRouter(sequelize));
app.use('/auth', authRouter(sequelize));
app.use('/routes', routesRouter(sequelize));
app.use('/tasks', tasksRouter(sequelize));
app.use('/database', databaseRouter(sequelize));
app.use('/send-message', sendMessageRouter(sequelize, clientsByRoute));

// Inicia o servidor
server.listen(process.env.PORT, '0.0.0.0', () => {
  console.log('Servidor rodando na porta' + process.env.PORT);
}); 