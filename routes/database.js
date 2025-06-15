const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { loggerMiddleware, logger, detectQueryType } = require('../middleware/logger');

// Aplica o middleware de logs
router.use(loggerMiddleware);

const injectDependencies = (sequelize) => {
  // Rota de login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    logger.user('Tentativa de login', { email });

    if (!email || !password) {
      logger.warn('Tentativa de login sem email ou senha');
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
      logger.query('Executando consulta de login', { email });
      const [user] = await sequelize.query(
        `SELECT * FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (user.length === 0) {
        logger.warn('Email não encontrado', { email });
        return res.status(404).json({ error: 'Email não encontrado.' });
      }

      const userRecord = user[0];
      const passwordMatch = await bcrypt.compare(password, userRecord.password);

      if (!passwordMatch) {
        logger.warn('Senha incorreta', { email });
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      logger.user('Login bem-sucedido', { userId: userRecord.id, email });
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
      logger.error('Erro ao verificar login', { error: error.message, email });
      res.status(500).json({ error: 'Erro ao verificar login.' });
    }
  });

  // Rota para criar usuário
  router.post('/create-user', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    logger.user('Tentativa de criação de usuário', { email });

    try {
      logger.query('Verificando email existente', { email });
      const [existingUser] = await sequelize.query(
        `SELECT * FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (existingUser.length > 0) {
        logger.warn('Tentativa de criar usuário com email já existente', { email });
        return res.status(400).json({ error: 'Email já cadastrado.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      logger.query('Criando novo usuário', { email });
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

      logger.user('Usuário criado com sucesso', { userId: newUser[0].id, email });
      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso.',
        data: newUser,
      });
    } catch (error) {
      logger.error('Erro ao criar usuário', { error: error.message, email });
      res.status(500).json({ error: 'Erro ao criar usuário.', details: error.message });
    }
  });

  // Rota para verificar rota do usuário
  router.post('/check-route', async (req, res) => {
    const { userId } = req.body;
    logger.route('Verificação de rota do usuário', { userId });

    if (!userId) {
      logger.warn('Tentativa de verificar rota sem userId');
      return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
    }

    try {
      logger.query('Consultando rota do usuário', { userId });
      const [result] = await sequelize.query(
        `SELECT route FROM users WHERE id = :userId`,
        { replacements: { userId } }
      );

      if (result.length === 0) {
        logger.warn('Rota não encontrada', { userId });
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      logger.route('Rota encontrada', { userId, route: result[0].route });
      res.status(200).json({ success: true, route: result[0].route });
    } catch (error) {
      logger.error('Erro ao verificar rota', { error: error.message, userId });
      res.status(500).json({ error: 'Erro ao verificar rota.' });
    }
  });

  // Rota para verificar disponibilidade da rota
  router.post('/check-route-availability', async (req, res) => {
    const { route } = req.body;
    logger.route('Verificação de disponibilidade de rota', { route });

    if (!route) {
      logger.warn('Tentativa de verificar disponibilidade sem rota');
      return res.status(400).json({ error: 'A rota é obrigatória.' });
    }

    try {
      logger.query('Verificando disponibilidade da rota', { route });
      const [result] = await sequelize.query(
        `SELECT id FROM users WHERE route = :route`,
        { replacements: { route } }
      );

      if (result.length > 0) {
        logger.warn('Rota já em uso', { route });
        return res.status(400).json({ error: 'Rota já em uso.' });
      }

      logger.route('Rota disponível', { route });
      res.status(200).json({ success: true, available: true });
    } catch (error) {
      logger.error('Erro ao verificar disponibilidade da rota', { error: error.message, route });
      res.status(500).json({ error: 'Erro ao verificar disponibilidade da rota.' });
    }
  });

  // Rota para configurar rota do usuário
  router.post('/set-route', async (req, res) => {
    let { userId, route } = req.body;
    logger.route('Tentativa de configurar rota', { userId, route });

    if (!userId || !route) {
      logger.warn('Tentativa de configurar rota sem userId ou route');
      return res.status(400).json({ error: 'ID do usuário e rota são obrigatórios.' });
    }

    route = route.toLowerCase();

    try {
      logger.query('Atualizando rota do usuário', { userId, route });
      await sequelize.query(
        `UPDATE users SET route = :route WHERE id = :userId`,
        { replacements: { route, userId } }
      );

      logger.route('Rota configurada com sucesso', { userId, route });
      res.status(200).json({ success: true, message: 'Rota configurada com sucesso.' });
    } catch (error) {
      logger.error('Erro ao configurar rota', { error: error.message, userId, route });
      res.status(500).json({ error: 'Erro ao configurar rota.' });
    }
  });

  // Rota para consultas SQL genéricas
  router.post('/', async (req, res) => {
    const { query } = req.body;
    logger.query('Execução de consulta SQL', { query });
    
    if (!query) {
      logger.warn('Tentativa de executar consulta SQL sem query');
      return res.status(400).json({ error: 'A consulta SQL é obrigatória.' });
    }

    try {
      const [results] = await sequelize.query(query);
      const queryType = detectQueryType(query);
      logger.query('Consulta SQL executada com sucesso', { queryType });
      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('Erro ao executar consulta SQL', { error: error.message, query });
      res.status(500).json({ error: 'Erro ao executar consulta SQL.', details: error.message });
    }
  });

  return router;
};

module.exports = injectDependencies; 