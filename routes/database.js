const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { loggerMiddleware, logger, detectQueryType } = require('../middleware/logger');

// Aplica o middleware de logs
router.use(loggerMiddleware);

/**
 * Função para gerar token bearer automático
 */
function generateBearerToken(routeName) {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const routePrefix = routeName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `${routePrefix}_auth_${timestamp}_${randomBytes}`;
}

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

  // Rota para criar usuário (CORRIGIDA conforme solicitação)
  router.post('/create-user', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    logger.user('Tentativa de criação de usuário', { email });

    // Validações obrigatórias
    if (!firstName || !lastName || !email || !password) {
      logger.warn('Tentativa de criar usuário com campos obrigatórios ausentes', { email });
      return res.status(400).json({ 
        error: 'Campos obrigatórios: firstName, lastName, email, password' 
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn('Email inválido', { email });
      return res.status(400).json({ error: 'Formato de email inválido.' });
    }

    try {
      // Verificar se email já existe
      logger.query('Verificando email existente', { email });
      const [existingUser] = await sequelize.query(
        `SELECT id FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (existingUser.length > 0) {
        logger.warn('Tentativa de criar usuário com email já existente', { email });
        return res.status(400).json({ error: 'Email já cadastrado.' });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criar usuário
      logger.query('Criando novo usuário', { email });
      const [newUser] = await sequelize.query(
        `INSERT INTO users (first_name, last_name, email, password, created_at) 
         VALUES (:firstName, :lastName, :email, :hashedPassword, NOW()) 
         RETURNING id, first_name, last_name, email`,
        {
          replacements: {
            firstName,
            lastName,
            email,
            hashedPassword
          }
        }
      );

      const createdUser = newUser[0];
      logger.user('Usuário criado com sucesso', { userId: createdUser.id, email });
      
      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso.',
        data: {
          user_id: createdUser.id,
          firstName: createdUser.first_name,
          lastName: createdUser.last_name,
          email: createdUser.email
        }
      });

    } catch (error) {
      logger.error('Erro ao criar usuário', { error: error.message, email });
      res.status(500).json({ error: 'Erro ao criar usuário.', details: error.message });
    }
  });

  // Rota para verificar rota do usuário (ATUALIZADA conforme documentação)
  router.post('/check-route', async (req, res) => {
    const { user_id, name } = req.body;
    logger.route('Verificação de rota do usuário', { user_id, name });

    if (!user_id) {
      logger.warn('Tentativa de verificar rota sem user_id');
      return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
    }

    if (!name) {
      logger.warn('Tentativa de verificar rota sem name');
      return res.status(400).json({ error: 'Nome da rota é obrigatório.' });
    }

    try {
      // Verificar se o usuário existe
      logger.query('Verificando existência do usuário', { user_id });
      const [userResult] = await sequelize.query(
        `SELECT id, first_name, last_name FROM users WHERE id = :user_id`,
        { replacements: { user_id } }
      );

      if (userResult.length === 0) {
        logger.warn('Usuário não encontrado', { user_id });
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Verificar se a rota existe e está associada ao usuário
      logger.query('Consultando rota na tabela routes', { user_id, name });
      const [routeResult] = await sequelize.query(
        `SELECT id, name, token, users_id FROM routes 
         WHERE name = :name AND users_id = :user_id`,
        { replacements: { name: name.trim(), user_id } }
      );

      if (routeResult.length === 0) {
        logger.warn('Rota não encontrada para o usuário', { user_id, name });
        return res.status(404).json({ error: 'Rota não encontrada para este usuário.' });
      }

      const route = routeResult[0];
      logger.route('Rota encontrada', { user_id, routeId: route.id, routeName: route.name });
      
      res.status(200).json({
        success: true,
        route: {
          id: route.id,
          name: route.name,
          token: route.token,
          user_id: route.users_id
        }
      });

    } catch (error) {
      logger.error('Erro ao verificar rota', { error: error.message, user_id, name });
      res.status(500).json({ error: 'Erro ao verificar rota.' });
    }
  });

  // NOVA ROTA: Autenticação de rota (conforme documentação)
  router.patch('/auth_route', async (req, res) => {
    const { route_id } = req.body;
    logger.route('Tentativa de gerar token de autenticação', { route_id });

    if (!route_id) {
      logger.warn('Tentativa de gerar token sem route_id');
      return res.status(400).json({ error: 'ID da rota é obrigatório.' });
    }

    try {
      // Verificar se a rota existe
      logger.query('Verificando existência da rota', { route_id });
      const [routeResult] = await sequelize.query(
        `SELECT id, name FROM routes WHERE id = :route_id`,
        { replacements: { route_id } }
      );

      if (routeResult.length === 0) {
        logger.warn('Rota não encontrada', { route_id });
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      const routeName = routeResult[0].name;
      
      // Gerar token automaticamente
      const generatedToken = generateBearerToken(routeName);
      logger.info('Token bearer gerado automaticamente', { route_id, routeName, generatedToken: generatedToken.substring(0, 20) + '...' });

      // Atualizar o Bearer Token
      logger.query('Atualizando token de autenticação da rota', { route_id });
      await sequelize.query(
        `UPDATE routes SET token = :bearer_token, updated_at = NOW() 
         WHERE id = :route_id`,
        { replacements: { bearer_token: generatedToken, route_id } }
      );

      logger.route('Token de autenticação gerado com sucesso', { route_id });
      res.status(200).json({
        success: true,
        message: 'Token de autenticação gerado automaticamente.',
        route_id,
        has_token: true,
        token: generatedToken
      });

    } catch (error) {
      logger.error('Erro ao gerar token de autenticação', { error: error.message, route_id });
      res.status(500).json({ error: 'Erro ao gerar token de autenticação.' });
    }
  });

  // Rota para verificar disponibilidade de nome de rota
  router.get('/check-route-availability/:name', async (req, res) => {
    const { name } = req.params;
    logger.route('Verificação de disponibilidade de nome de rota', { name });

    if (!name) {
      logger.warn('Tentativa de verificar disponibilidade sem nome');
      return res.status(400).json({ error: 'Nome da rota é obrigatório.' });
    }

    try {
      logger.query('Verificando disponibilidade do nome de rota', { name });
      const [result] = await sequelize.query(
        `SELECT id FROM routes WHERE name = :name`,
        { replacements: { name: name.trim() } }
      );

      if (result.length > 0) {
        logger.warn('Nome de rota já em uso', { name });
        return res.status(400).json({ 
          error: 'Nome de rota já em uso.',
          available: false,
          existing_route_id: result[0].id
        });
      }

      logger.route('Nome de rota disponível', { name });
      res.status(200).json({ 
        success: true, 
        available: true,
        name: name.trim()
      });
    } catch (error) {
      logger.error('Erro ao verificar disponibilidade do nome de rota', { error: error.message, name });
      res.status(500).json({ error: 'Erro ao verificar disponibilidade do nome de rota.' });
    }
  });

  // Rota para listar rotas do usuário
  router.get('/user-routes/:user_id', async (req, res) => {
    const { user_id } = req.params;
    logger.route('Tentativa de listar rotas do usuário', { user_id });

    if (!user_id) {
      logger.warn('Tentativa de listar rotas sem user_id');
      return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
    }

    try {
      // Verificar se o usuário existe
      logger.query('Verificando existência do usuário', { user_id });
      const [userResult] = await sequelize.query(
        `SELECT id, first_name, last_name, email FROM users WHERE id = :user_id`,
        { replacements: { user_id } }
      );

      if (userResult.length === 0) {
        logger.warn('Usuário não encontrado', { user_id });
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Buscar todas as rotas do usuário
      logger.query('Buscando rotas do usuário', { user_id });
      const [routesResult] = await sequelize.query(
        `SELECT id, name, token, created_at, updated_at 
         FROM routes 
         WHERE users_id = :user_id 
         ORDER BY created_at DESC`,
        { replacements: { user_id } }
      );

      const user = userResult[0];
      logger.route('Rotas do usuário listadas com sucesso', { user_id, routeCount: routesResult.length });
      
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email
        },
        routes: routesResult.map(route => ({
          id: route.id,
          name: route.name,
          has_token: !!route.token,
          created_at: route.created_at,
          updated_at: route.updated_at
        })),
        total_routes: routesResult.length
      });

    } catch (error) {
      logger.error('Erro ao listar rotas do usuário', { error: error.message, user_id });
      res.status(500).json({ error: 'Erro ao listar rotas do usuário.' });
    }
  });

  // Rota para excluir token da rota
  router.delete('/delete-token', async (req, res) => {
    const { route_id } = req.body;
    logger.route('Tentativa de excluir token da rota', { route_id });

    if (!route_id) {
      logger.warn('Tentativa de excluir token sem route_id');
      return res.status(400).json({ error: 'ID da rota é obrigatório.' });
    }

    try {
      // Verificar se a rota existe
      logger.query('Verificando existência da rota', { route_id });
      const [routeResult] = await sequelize.query(
        `SELECT id, name, token FROM routes WHERE id = :route_id`,
        { replacements: { route_id } }
      );

      if (routeResult.length === 0) {
        logger.warn('Rota não encontrada', { route_id });
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      const route = routeResult[0];

      if (!route.token) {
        logger.warn('Rota não possui token para remover', { route_id });
        return res.status(400).json({ error: 'Rota não possui token para remover.' });
      }

      // Remover o token da rota
      logger.query('Removendo token da rota', { route_id });
      await sequelize.query(
        `UPDATE routes SET token = NULL, updated_at = NOW() WHERE id = :route_id`,
        { replacements: { route_id } }
      );

      logger.route('Token da rota removido com sucesso', { route_id, routeName: route.name });
      res.status(200).json({
        success: true,
        message: 'Token da rota removido com sucesso.',
        route_id,
        route_name: route.name
      });

    } catch (error) {
      logger.error('Erro ao remover token da rota', { error: error.message, route_id });
      res.status(500).json({ error: 'Erro ao remover token da rota.' });
    }
  });

  // Rota para editar nome da rota
  router.patch('/edit-route', async (req, res) => {
    const { route_id, new_name } = req.body;
    logger.route('Tentativa de editar nome da rota', { route_id, new_name });

    if (!route_id) {
      logger.warn('Tentativa de editar rota sem route_id');
      return res.status(400).json({ error: 'ID da rota é obrigatório.' });
    }

    if (!new_name || typeof new_name !== 'string' || new_name.trim() === '') {
      logger.warn('Tentativa de editar rota sem novo nome válido');
      return res.status(400).json({ error: 'Novo nome da rota é obrigatório e deve ser uma string válida.' });
    }

    try {
      // Verificar se a rota existe
      logger.query('Verificando existência da rota', { route_id });
      const [routeResult] = await sequelize.query(
        `SELECT id, name, users_id FROM routes WHERE id = :route_id`,
        { replacements: { route_id } }
      );

      if (routeResult.length === 0) {
        logger.warn('Rota não encontrada', { route_id });
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      const oldName = routeResult[0].name;
      const trimmedNewName = new_name.trim();

      // Verificar se o novo nome já existe (exceto para a própria rota)
      logger.query('Verificando se novo nome já existe', { newName: trimmedNewName });
      const [existingRoute] = await sequelize.query(
        `SELECT id FROM routes WHERE name = :newName AND id != :route_id`,
        { replacements: { newName: trimmedNewName, route_id } }
      );

      if (existingRoute.length > 0) {
        logger.warn('Novo nome de rota já existe', { newName: trimmedNewName });
        return res.status(400).json({ error: 'Nome de rota já existe.' });
      }

      // Atualizar o nome da rota
      logger.query('Atualizando nome da rota', { route_id, oldName, newName: trimmedNewName });
      await sequelize.query(
        `UPDATE routes SET name = :newName, updated_at = NOW() WHERE id = :route_id`,
        { replacements: { newName: trimmedNewName, route_id } }
      );

      logger.route('Nome da rota atualizado com sucesso', { route_id, oldName, newName: trimmedNewName });
      res.status(200).json({
        success: true,
        message: 'Nome da rota atualizado com sucesso.',
        route_id,
        old_name: oldName,
        new_name: trimmedNewName
      });

    } catch (error) {
      logger.error('Erro ao editar nome da rota', { error: error.message, route_id });
      res.status(500).json({ error: 'Erro ao editar nome da rota.' });
    }
  });

  // Rota para configurar rota do usuário (ATUALIZADA com lógica de create-user)
  router.post('/set-route', async (req, res) => {
    const { user_id, routes } = req.body;
    logger.route('Tentativa de configurar rotas para usuário', { user_id });

    if (!user_id) {
      logger.warn('Tentativa de configurar rotas sem user_id');
      return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
    }

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      logger.warn('Tentativa de configurar rotas sem fornecer rotas', { user_id });
      return res.status(400).json({ error: 'Pelo menos uma rota deve ser fornecida.' });
    }

    // Validar cada rota
    for (const route of routes) {
      if (!route.name || typeof route.name !== 'string' || route.name.trim() === '') {
        logger.warn('Rota com nome inválido', { route });
        return res.status(400).json({ error: 'Cada rota deve ter um nome válido.' });
      }
      // Token é opcional agora, então não validamos se está presente
    }

    try {
      // Verificar se o usuário existe
      logger.query('Verificando existência do usuário', { user_id });
      const [userResult] = await sequelize.query(
        `SELECT id, first_name, last_name FROM users WHERE id = :user_id`,
        { replacements: { user_id } }
      );

      if (userResult.length === 0) {
        logger.warn('Usuário não encontrado', { user_id });
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Iniciar transação
      const transaction = await sequelize.transaction();

      try {
        const createdRoutes = [];

        // Criar rotas para o usuário
        for (const route of routes) {
          logger.query('Criando rota para usuário', { user_id, routeName: route.name });
          const [newRoute] = await sequelize.query(
            `INSERT INTO routes (name, token, users_id, created_at) 
             VALUES (:name, :token, :user_id, NOW()) RETURNING id`,
            {
              replacements: {
                name: route.name.trim(),
                token: route.token ? route.token.trim() : null,
                user_id
              },
              transaction
            }
          );

          createdRoutes.push({
            id: newRoute[0].id,
            name: route.name,
            token: route.token || null
          });
        }

        // Atualizar usuário com as rotas criadas
        const routeIds = createdRoutes.map(r => r.id);
        
        // Buscar rotas existentes do usuário
        const [existingUserResult] = await sequelize.query(
          `SELECT routes FROM users WHERE id = :user_id`,
          { replacements: { user_id }, transaction }
        );
        
        let existingRoutes = [];
        if (existingUserResult.length > 0 && existingUserResult[0].routes) {
          try {
            if (typeof existingUserResult[0].routes === 'string') {
              existingRoutes = JSON.parse(existingUserResult[0].routes);
            } else if (Array.isArray(existingUserResult[0].routes)) {
              existingRoutes = existingUserResult[0].routes;
            }
            
            if (!Array.isArray(existingRoutes)) {
              existingRoutes = [];
            }
          } catch (parseError) {
            logger.warn('Erro ao fazer parse das rotas existentes, usando array vazio', { 
              user_id, 
              parseError: parseError.message 
            });
            existingRoutes = [];
          }
        }
        
        // Combinar rotas existentes com as novas
        const allRouteIds = [...existingRoutes, ...routeIds];
        
        await sequelize.query(
          `UPDATE users SET routes = :routeIds WHERE id = :user_id`,
          {
            replacements: { routeIds: JSON.stringify(allRouteIds), user_id },
            transaction
          }
        );

        // Commit da transação
        await transaction.commit();

        logger.route('Rotas configuradas com sucesso', { user_id, routeCount: createdRoutes.length });
        res.status(200).json({
          success: true,
          message: 'Rotas configuradas com sucesso.',
          data: {
            user_id,
            routes: createdRoutes
          }
        });

      } catch (error) {
        // Rollback em caso de erro
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      logger.error('Erro ao configurar rotas', { error: error.message, user_id });
      res.status(500).json({ error: 'Erro ao configurar rotas.', details: error.message });
    }
  });

  // Rota para excluir rota
  router.delete('/delete-route', async (req, res) => {
    const { route_id } = req.body;
    logger.route('Tentativa de excluir rota', { route_id });

    if (!route_id) {
      logger.warn('Tentativa de excluir rota sem route_id');
      return res.status(400).json({ error: 'ID da rota é obrigatório.' });
    }

    try {
      // Verificar se a rota existe
      logger.query('Verificando existência da rota', { route_id });
      const [routeResult] = await sequelize.query(
        `SELECT id, name, users_id FROM routes WHERE id = :route_id`,
        { replacements: { route_id } }
      );

      if (routeResult.length === 0) {
        logger.warn('Rota não encontrada', { route_id });
        return res.status(404).json({ error: 'Rota não encontrada.' });
      }

      const route = routeResult[0];
      const userId = route.users_id;

      // Iniciar transação
      const transaction = await sequelize.transaction();

      try {
        logger.query('Excluindo rota', { route_id });
        await sequelize.query(
          `DELETE FROM routes WHERE id = :route_id`,
          { replacements: { route_id }, transaction }
        );

        // Atualizar o array de rotas do usuário
        logger.query('Atualizando array de rotas do usuário', { userId });
        const [userResult] = await sequelize.query(
          `SELECT routes FROM users WHERE id = :userId`,
          { replacements: { userId }, transaction }
        );

        if (userResult.length > 0 && userResult[0].routes) {
          try {
            let currentRoutes = [];
            
            // Verificar se routes é uma string JSON válida
            if (typeof userResult[0].routes === 'string') {
              currentRoutes = JSON.parse(userResult[0].routes);
            } else if (Array.isArray(userResult[0].routes)) {
              currentRoutes = userResult[0].routes;
            }
            
            // Garantir que currentRoutes é um array
            if (!Array.isArray(currentRoutes)) {
              currentRoutes = [];
            }
            
            const updatedRoutes = currentRoutes.filter(id => id !== route_id);
            
            await sequelize.query(
              `UPDATE users SET routes = :routes WHERE id = :userId`,
              { replacements: { routes: JSON.stringify(updatedRoutes), userId }, transaction }
            );
          } catch (parseError) {
            logger.warn('Erro ao fazer parse do campo routes, resetando para array vazio', { 
              userId, 
              routesValue: userResult[0].routes,
              parseError: parseError.message 
            });
            
            // Se houver erro no parse, resetar para array vazio
            await sequelize.query(
              `UPDATE users SET routes = :routes WHERE id = :userId`,
              { replacements: { routes: JSON.stringify([]), userId }, transaction }
            );
          }
        }

        // Commit da transação
        await transaction.commit();

        logger.route('Rota excluída com sucesso', { route_id, routeName: route.name });
        res.status(200).json({
          success: true,
          message: 'Rota excluída com sucesso.',
          route_id,
          route_name: route.name
        });

      } catch (error) {
        // Rollback em caso de erro
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      logger.error('Erro ao excluir rota', { error: error.message, route_id });
      res.status(500).json({ error: 'Erro ao excluir rota.' });
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