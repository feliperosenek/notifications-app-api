const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const injectDependencies = (sequelize) => {
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
      const [user] = await sequelize.query(
        `SELECT * FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (user.length === 0) {
        return res.status(404).json({ error: 'Email não encontrado.' });
      }

      const userRecord = user[0];
      const passwordMatch = await bcrypt.compare(password, userRecord.password);

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

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

  router.post('/create-user', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
      const [existingUser] = await sequelize.query(
        `SELECT * FROM users WHERE email = :email`,
        { replacements: { email } }
      );

      if (existingUser.length > 0) {
        return res.status(400).json({ error: 'Email já cadastrado.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

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
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      res.status(500).json({ error: 'Erro ao criar usuário.', details: error.message });
    }
  });

  return router;
};

module.exports = injectDependencies; 