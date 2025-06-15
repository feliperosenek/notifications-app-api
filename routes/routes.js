const express = require('express');
const router = express.Router();

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

  return router;
};

module.exports = injectDependencies; 