require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('🚀 Executando schema SQL com configurações do projeto...\n');

// Configurações do banco de dados
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

console.log('📋 Configurações do banco:');
console.log(`- Host: ${dbConfig.host}`);
console.log(`- Port: ${dbConfig.port}`);
console.log(`- Database: ${dbConfig.database}`);
console.log(`- User: ${dbConfig.user}`);
console.log('');

// Função para executar o schema SQL
async function executeSchema() {
    const client = new Client(dbConfig);
    
    try {
        // Conectar ao banco
        console.log('🔌 Conectando ao banco de dados...');
        await client.connect();
        console.log('✅ Conectado com sucesso!\n');

        // Ler o arquivo SQL
        const schemaFile = path.join(__dirname, 'database_schema.sql');
        if (!fs.existsSync(schemaFile)) {
            throw new Error('Arquivo database_schema.sql não encontrado');
        }

        const sqlContent = fs.readFileSync(schemaFile, 'utf8');
        console.log('📁 Arquivo schema lido ✓\n');

        // Executar o SQL
        console.log('🗄️  Executando schema SQL...');
        await client.query(sqlContent);
        console.log('✅ Schema SQL executado com sucesso!\n');

        // Verificar tabelas criadas
        console.log('🔍 Verificando tabelas criadas...');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'routes', 'messages')
            ORDER BY table_name
        `);
        
        console.log('📊 Tabelas encontradas:');
        tablesResult.rows.forEach(row => {
            console.log(`- ${row.table_name}`);
        });
        console.log('');

        // Verificar estrutura das tabelas
        console.log('📋 Estrutura das tabelas:');
        
        // Users
        const usersStructure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        console.log('\n👥 Tabela users:');
        usersStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });

        // Routes
        const routesStructure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'routes' 
            ORDER BY ordinal_position
        `);
        console.log('\n🛣️  Tabela routes:');
        routesStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });

        // Messages
        const messagesStructure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position
        `);
        console.log('\n💬 Tabela messages:');
        messagesStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });

        console.log('\n🎉 Schema executado com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('1. Execute: npm start');
        console.log('2. Teste os endpoints da API');
        console.log('3. Use os exemplos do README_API.md');

    } catch (error) {
        console.error('\n❌ Erro durante a execução:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 PostgreSQL não está rodando. Inicie o serviço:');
            console.log('- Windows: net start postgresql');
            console.log('- Linux/Mac: sudo service postgresql start');
        } else if (error.code === '28P01') {
            console.log('\n💡 Credenciais incorretas. Verifique:');
            console.log('- DB_USER e DB_PASSWORD no arquivo .env');
        } else if (error.code === '3D000') {
            console.log('\n💡 Banco de dados não existe. Crie:');
            console.log(`- createdb ${dbConfig.database}`);
        }
        
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Executar o script
executeSchema();
