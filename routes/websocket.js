const { Server } = require('socket.io');
const { logger } = require('../middleware/logger');

const setupWebSocket = (server, sequelize) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const clientsByRoute = {};
  const clientRoutes = new Map(); // Mapa para rastrear rotas por cliente

  io.on('connection', (socket) => {
    logger.socket('Novo cliente conectado', { socketId: socket.id });

    // Associar o cliente a uma rota
    socket.on('set-route', async (route) => {
      logger.socket(`Evento set-route recebido do cliente ${socket.id}`, { route });

      try {
        // Verificar se o cliente já está associado a uma rota
        if (clientRoutes.has(socket.id)) {
          const currentRoute = clientRoutes.get(socket.id);
          if (currentRoute === route) {
            logger.socket(`Cliente ${socket.id} já está associado à rota ${route}.`);
            socket.emit('route-set', { success: true, route });
            return;
          }
          // Remove o cliente da rota anterior
          if (clientsByRoute[currentRoute]) {
            clientsByRoute[currentRoute] = clientsByRoute[currentRoute].filter(id => id !== socket.id);
            if (clientsByRoute[currentRoute].length === 0) {
              delete clientsByRoute[currentRoute];
            }
          }
        }

        // Verificar se a rota existe no banco de dados
        const [result] = await sequelize.query(
          `SELECT id FROM users WHERE route = :route`,
          { replacements: { route } }
        );

        // Log do resultado da consulta
        logger.socket(`Resultado da consulta ao banco para a rota ${route}`, { result });

        if (result.length === 0) {
          logger.socket(`Rota ${route} não encontrada no banco de dados.`);
          socket.emit('route-error', { error: 'Rota não encontrada.' });
          return;
        }

        logger.socket(`Rota ${route} validada para o cliente ${socket.id}.`);

        // Mapeia o cliente para a rota
        if (!clientsByRoute[route]) {
          clientsByRoute[route] = [];
        }

        // Verificar se o cliente já está associado à rota para evitar duplicidade
        if (!clientsByRoute[route].includes(socket.id)) {
          clientsByRoute[route].push(socket.id);
          clientRoutes.set(socket.id, route); // Atualiza o mapa de rotas do cliente
          logger.socket(`Cliente ${socket.id} associado à rota ${route}.`, {
            totalClients: clientsByRoute[route].length
          });
        } else {
          logger.socket(`Cliente ${socket.id} já estava associado à rota ${route}.`);
        }

        // Confirmação para o cliente
        socket.emit('route-set', { success: true, route });
      } catch (error) {
        logger.error('Erro ao verificar rota no banco de dados:', {
          error: error.message,
          stack: error.stack,
          route,
          socketId: socket.id
        });
        socket.emit('route-error', { error: 'Erro ao verificar rota no banco de dados.' });
      }
    });

    // Gerenciar desconexões
    socket.on('disconnect', () => {
      logger.socket('Cliente desconectado', { socketId: socket.id });

      // Remove o cliente do mapa de rotas
      const route = clientRoutes.get(socket.id);
      if (route) {
        clientRoutes.delete(socket.id);
        
        // Remove o cliente da rota
        if (clientsByRoute[route]) {
          clientsByRoute[route] = clientsByRoute[route].filter((id) => id !== socket.id);
          
          if (clientsByRoute[route].length === 0) {
            logger.socket(`Nenhum cliente restante na rota ${route}, removendo rota.`);
            delete clientsByRoute[route];
          } else {
            logger.socket(`Cliente ${socket.id} removido da rota ${route}.`, {
              remainingClients: clientsByRoute[route].length
            });
          }
        }
      }
    });
  });

  return { io, clientsByRoute };
};

module.exports = setupWebSocket; 