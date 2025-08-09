require('dotenv').config();
const { Client } = require('pg');

console.log('🔍 Verificando estrutura atual do banco de dados...\n');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

async function checkDatabaseStructure() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados\n');

        // Verificar tabelas existentes
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📊 Tabelas existentes:');
        tablesResult.rows.forEach(row => {
            console.log(`- ${row.table_name}`);
        });
        console.log('');

        // Verificar estrutura da tabela users
        const usersStructure = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('👥 Estrutura atual da tabela users:');
        usersStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
        });
        console.log('');

        // Verificar estrutura da tabela messages
        const messagesStructure = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position
        `);
        
        console.log('💬 Estrutura atual da tabela messages:');
        messagesStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
        });
        console.log('');

        // Verificar se a tabela routes existe
        const routesExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'routes'
            )
        `);
        
        console.log(`🛣️  Tabela routes existe: ${routesExists.rows[0].exists ? 'SIM' : 'NÃO'}`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await client.end();
    }
}

checkDatabaseStructure();
