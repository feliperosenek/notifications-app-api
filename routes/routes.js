const express = require('express');
const router = express.Router();
const { logger, loggerMiddleware } = require('../middleware/logger');
router.use(loggerMiddleware);

const injectDependencies = (sequelize) => {

  router.post('/check-route', async (req, res) => {
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
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      res.status(200).json({ success: true, route: result[0].route });
    } catch (error) {
      console.error('Erro ao verificar rota:', error);
      res.status(500).json({ error: 'Erro ao verificar rota.' });
    }
  });

  router.post('/check-route-availability', async (req, res) => {
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

  router.post('/set-route', async (req, res) => {
    var { userId, route } = req.body;

    if (!userId || !route) {
      return res.status(400).json({ error: 'ID do usuário e rota são obrigatórios.' });
    }

    route = route.toLowerCase();

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

  router.post('/add-route-to-user', async (req, res) => {
    const { email, routeId } = req.body;
    if (!email || !routeId) {
      return res.status(400).json({ error: 'Email e ID da rota são obrigatórios.' });
    }

    logger.user('Adicionando rota ao usuário', { email, routeId });
    
    try {
 
      // Verificar se o email existe no banco
      const [userResult] = await sequelize.query(
        `SELECT id, routes FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (userResult.length === 0) {
        return res.status(404).json({ error: 'Email não encontrado no banco de dados.' });
      }

      const user = userResult[0];
      let userRoutes = user.routes || [];

      // Verificar se a rota já existe no array
      if (userRoutes.includes(routeId)) {
        return res.status(400).json({ error: 'Esta rota já está associada ao usuário.' });
      }

      // Verificar se a rota existe na tabela routes
      const [existingRoute] = await sequelize.query(
        `SELECT id, users_id FROM routes WHERE id = :routeId`,
        { replacements: { routeId } }
      );

      if (existingRoute.length === 0) {
        return res.status(404).json({ error: 'Rota não encontrada na tabela routes.' });
      }

      const route = existingRoute[0];

      // Adicionar a nova rota ao array do usuário
      userRoutes.push(routeId);

      // Atualizar o campo routes do usuário
      await sequelize.query(
        `UPDATE users SET routes = :routes WHERE id = :userId`,
        { 
          replacements: { 
            routes: JSON.stringify(userRoutes), 
            userId: user.id 
          } 
        }
      );

      // Criar relacionamento na tabela route_users
      await sequelize.query(
        `INSERT INTO route_users (route_id, user_id) VALUES (:routeId, :userId)`,
        { replacements: { routeId, userId: user.id } }
      );

      res.status(200).json({ 
        success: true, 
        message: 'Rota adicionada com sucesso ao usuário e usuário associado à rota.',
        userId: user.id,
        routes: userRoutes,
        relationshipCreated: {
          routeId: routeId,
          userId: user.id,
          table: 'route_users'
        }
      });

    } catch (error) {
      console.error('Erro ao adicionar rota ao usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor ao processar a solicitação.' });
    }
  });

  // NOVO ENDPOINT: Buscar usuários por ID da rota
  router.get('/get-users-by-route/:routeId', async (req, res) => {
    const { routeId } = req.params;
        
    if (!routeId) {
      return res.status(400).json({ error: 'ID da rota é obrigatório.' });
    }

    logger.route('Buscando usuários por ID da rota', { routeId });
    
    try {
      // Consultar a tabela route_users para encontrar todos os usuários associados à rota
      const [usersResult] = await sequelize.query(
        `SELECT ru.user_id, u.id, u.first_name, u.last_name, u.email, u.route, u.created_at
         FROM route_users ru
         JOIN users u ON ru.user_id = u.id
         WHERE ru.route_id = :routeId`,
        { replacements: { routeId } }
      );
      logger.raw('Resultado da consulta de usuários por rota', { usersResult, routeId });
      if (usersResult.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: 'Nenhum usuário encontrado para esta rota.',
          routeId: routeId,
          users: [],
          count: 0
        });
      }

      res.status(200).json({ 
        success: true, 
        message: 'Usuários encontrados com sucesso.',
        routeId: routeId,
        users: usersResult,
        count: usersResult.length
      });

    } catch (error) {
      console.error('Erro ao buscar usuários por rota:', error);
      logger.error('Erro ao buscar usuários por rota', { error: error.message, routeId });
      res.status(500).json({ error: 'Erro interno do servidor ao buscar usuários.' });
    }
  });

  // NOVO ENDPOINT: Remover rota compartilhada do usuário
  router.delete('/remove-route-from-user', async (req, res) => {
    const { email, routeId } = req.body;
    
    if (!email || !routeId) {
      return res.status(400).json({ error: 'Email e ID da rota são obrigatórios.' });
    }

    logger.user('Removendo rota compartilhada do usuário', { email, routeId });
    
    try {
      // Verificar se o email existe no banco
      const [userResult] = await sequelize.query(
        `SELECT id, routes FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (userResult.length === 0) {
        return res.status(404).json({ error: 'Email não encontrado no banco de dados.' });
      }

      const user = userResult[0];
      let userRoutes = user.routes || [];

      // Verificar se a rota existe no array do usuário
      if (!userRoutes.includes(routeId)) {
        return res.status(400).json({ error: 'Esta rota não está associada ao usuário.' });
      }

      // Remover a rota do array
      userRoutes = userRoutes.filter(route => route !== routeId);

      // Atualizar o campo routes do usuário
      await sequelize.query(
        `UPDATE users SET routes = :routes WHERE id = :userId`,
        { 
          replacements: { 
            routes: JSON.stringify(userRoutes), 
            userId: user.id 
          } 
        }
      );

      // Remover o relacionamento da tabela route_users
      await sequelize.query(
        `DELETE FROM route_users WHERE route_id = :routeId AND user_id = :userId`,
        { replacements: { routeId, userId: user.id } }
      );

      res.status(200).json({ 
        success: true, 
        message: 'Rota compartilhada removida com sucesso.',
        userId: user.id,
        removedRouteId: routeId,
        updatedRoutes: userRoutes,
        count: userRoutes.length
      });

    } catch (error) {
      console.error('Erro ao remover rota compartilhada:', error);
      logger.error('Erro ao remover rota compartilhada', { error: error.message, email, routeId });
      res.status(500).json({ error: 'Erro interno do servidor ao remover rota compartilhada.' });
    }
  });

  return router;
};

module.exports = injectDependencies; 