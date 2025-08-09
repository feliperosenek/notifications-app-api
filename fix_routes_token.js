require('dotenv').config();
const { Client } = require('pg');

console.log('🔧 Corrigindo campo token na tabela routes...\n');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

async function fixRoutesToken() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados\n');

        // Verificar estrutura atual da coluna token
        console.log('📊 Verificando estrutura atual da coluna token...');
        const currentStructure = await client.query(`
            SELECT column_name, is_nullable, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'routes' AND column_name = 'token'
        `);
        
        if (currentStructure.rows.length > 0) {
            const column = currentStructure.rows[0];
            console.log(`📋 Estado atual da coluna token:`);
            console.log(`  - Nome: ${column.column_name}`);
            console.log(`  - Tipo: ${column.data_type}`);
            console.log(`  - Permite NULL: ${column.is_nullable === 'YES' ? 'SIM' : 'NÃO'}`);
            console.log('');
        }

        // Alterar a coluna token para permitir valores nulos
        console.log('🔧 Alterando coluna token para permitir valores nulos...');
        await client.query('ALTER TABLE routes ALTER COLUMN token DROP NOT NULL');
        console.log('✅ Coluna token alterada com sucesso\n');

        // Verificar a alteração
        console.log('📊 Verificando alteração...');
        const newStructure = await client.query(`
            SELECT column_name, is_nullable, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'routes' AND column_name = 'token'
        `);
        
        if (newStructure.rows.length > 0) {
            const column = newStructure.rows[0];
            console.log(`📋 Novo estado da coluna token:`);
            console.log(`  - Nome: ${column.column_name}`);
            console.log(`  - Tipo: ${column.data_type}`);
            console.log(`  - Permite NULL: ${column.is_nullable === 'YES' ? 'SIM' : 'NÃO'}`);
            console.log('');
        }

        // Adicionar comentário
        console.log('📝 Adicionando comentário na coluna...');
        await client.query(`
            COMMENT ON COLUMN routes.token IS 'Token Firebase para envio de notificações (opcional)'
        `);
        console.log('✅ Comentário adicionado');

        console.log('\n🎉 Correção concluída com sucesso!');
        console.log('\n📋 Agora você pode:');
        console.log('1. Criar rotas sem token Firebase');
        console.log('2. Adicionar tokens posteriormente');
        console.log('3. Usar o endpoint /database/set-route sem erro');

    } catch (error) {
        console.error('\n❌ Erro durante a correção:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

fixRoutesToken();
