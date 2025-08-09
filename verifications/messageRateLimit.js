const messageCache = new Map();

const messageRateLimit = async (req, res, next) => {
  try {
    const { route } = req.body;
    
    if (!route) {
      return res.status(400).json({ error: 'Rota é obrigatória' });
    }

    // Busca a rota e o usuário através do nome da rota
    const [routes] = await req.app.get('sequelize').query(
      `SELECT r.id as route_id, r.name, u.id as user_id, u.premium, u.message_count 
       FROM routes r 
       JOIN users u ON r.users_id = u.id 
       WHERE r.name = :route`,
      { replacements: { route } }
    );

    if (routes.length === 0) {
      return res.status(404).json({ error: 'Rota não encontrada' });
    }

    const routeData = routes[0];
    
    // Se o usuário for premium, permite passar
    if (routeData.premium) {
      return next();
    }

    // Verifica o limite total de mensagens
    if (routeData.message_count >= 25) {
      return res.status(403).json({
        error: 'Limite de 25 mensagens atingido. Para ter acesso ilimitado, contrate o premium.'
      });
    }

    const userId = routeData.user_id;
    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 60000ms = 1 minuto

    // Inicializa ou limpa mensagens antigas do cache
    if (!messageCache.has(userId)) {
      messageCache.set(userId, []);
    }

    // Remove mensagens mais antigas que 1 minuto
    const userMessages = messageCache.get(userId).filter(
      timestamp => timestamp > oneMinuteAgo
    );

    // Verifica se excedeu o limite
    if (userMessages.length >= 5) {
      return res.status(429).json({
        error: 'Limite de 5 mensagens excedido. Aguarde 1 minuto ou atualize para premium.'
      });
    }

    // Adiciona nova mensagem ao cache
    userMessages.push(now);
    messageCache.set(userId, userMessages);

    // Atualiza o message_count do usuário
    await req.app.get('sequelize').query(
      `UPDATE users SET message_count = message_count + 1 WHERE id = :userId`,
      { replacements: { userId } }
    );

    next();
  } catch (error) {
    console.error('Erro ao verificar limite de mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

module.exports = messageRateLimit; 