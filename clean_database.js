require('dotenv').config();
const { Client } = require('pg');

console.log('🧹 Limpando tabelas do banco de dados...\n');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

async function cleanDatabase() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados\n');

        // Verificar dados atuais
        console.log('📊 Verificando dados atuais...');
        
        const usersCount = await client.query('SELECT COUNT(*) FROM users');
        const messagesCount = await client.query('SELECT COUNT(*) FROM messages');
        const routesCount = await client.query('SELECT COUNT(*) FROM routes');
        
        console.log(`👥 Usuários: ${usersCount.rows[0].count}`);
        console.log(`💬 Mensagens: ${messagesCount.rows[0].count}`);
        console.log(`🛣️  Rotas: ${routesCount.rows[0].count}`);
        console.log('');

        // Confirmar limpeza
        console.log('⚠️  ATENÇÃO: Esta operação irá apagar TODOS os dados das tabelas!');
        console.log('📋 Tabelas que serão limpas:');
        console.log('- messages');
        console.log('- users');
        console.log('- routes (será limpa automaticamente devido à foreign key)');
        console.log('');

        // Perguntar confirmação
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise((resolve) => {
            rl.question('❓ Tem certeza que deseja continuar? (digite "SIM" para confirmar): ', (input) => {
                rl.close();
                resolve(input.trim().toUpperCase());
            });
        });

        if (answer !== 'SIM') {
            console.log('❌ Operação cancelada pelo usuário');
            return;
        }

        console.log('\n🧹 Iniciando limpeza...\n');

        // Limpar tabelas na ordem correta (devido às foreign keys)
        console.log('🗑️  Limpando tabela messages...');
        await client.query('DELETE FROM messages');
        console.log('✅ Tabela messages limpa');

        console.log('🗑️  Limpando tabela routes...');
        await client.query('DELETE FROM routes');
        console.log('✅ Tabela routes limpa');

        console.log('🗑️  Limpando tabela users...');
        await client.query('DELETE FROM users');
        console.log('✅ Tabela users limpa');

        // Verificar dados após limpeza
        console.log('\n📊 Verificando dados após limpeza...');
        
        const usersCountAfter = await client.query('SELECT COUNT(*) FROM users');
        const messagesCountAfter = await client.query('SELECT COUNT(*) FROM messages');
        const routesCountAfter = await client.query('SELECT COUNT(*) FROM routes');
        
        console.log(`👥 Usuários: ${usersCountAfter.rows[0].count}`);
        console.log(`💬 Mensagens: ${messagesCountAfter.rows[0].count}`);
        console.log(`🛣️  Rotas: ${routesCountAfter.rows[0].count}`);
        console.log('');

        // Resetar sequências (auto-increment)
        console.log('🔄 Resetando sequências...');
        await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE messages_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE routes_id_seq RESTART WITH 1');
        console.log('✅ Sequências resetadas');

        console.log('\n🎉 Limpeza concluída com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('1. Execute: npm start');
        console.log('2. Teste os novos endpoints da API');
        console.log('3. Crie novos usuários e rotas conforme necessário');

    } catch (error) {
        console.error('\n❌ Erro durante a limpeza:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

cleanDatabase();
