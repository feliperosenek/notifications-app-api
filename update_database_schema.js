require('dotenv').config();
const { Client } = require('pg');

console.log('🚀 Atualizando schema do banco de dados conforme documentação...\n');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

async function updateDatabaseSchema() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados\n');

        // 1. Criar tabela routes
        console.log('🛣️  Criando tabela routes...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                token VARCHAR(500) NOT NULL,
                users_id INTEGER NOT NULL,
                bearer_token VARCHAR(500),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Tabela routes criada\n');

        // 2. Adicionar campo routes (JSONB) na tabela users se não existir
        console.log('👥 Verificando campo routes na tabela users...');
        const routesColumnExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'routes'
            )
        `);
        
        if (!routesColumnExists.rows[0].exists) {
            console.log('➕ Adicionando campo routes na tabela users...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN routes JSONB DEFAULT '[]'
            `);
            console.log('✅ Campo routes adicionado\n');
        } else {
            console.log('✅ Campo routes já existe\n');
        }

        // 3. Adicionar campo name na tabela users se não existir
        console.log('👥 Verificando campo name na tabela users...');
        const nameColumnExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'name'
            )
        `);
        
        if (!nameColumnExists.rows[0].exists) {
            console.log('➕ Adicionando campo name na tabela users...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN name VARCHAR(255)
            `);
            console.log('✅ Campo name adicionado\n');
        } else {
            console.log('✅ Campo name já existe\n');
        }

        // 4. Adicionar campo created_at na tabela users se não existir
        console.log('👥 Verificando campo created_at na tabela users...');
        const createdAtColumnExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'created_at'
            )
        `);
        
        if (!createdAtColumnExists.rows[0].exists) {
            console.log('➕ Adicionando campo created_at na tabela users...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN created_at TIMESTAMP DEFAULT NOW()
            `);
            console.log('✅ Campo created_at adicionado\n');
        } else {
            console.log('✅ Campo created_at já existe\n');
        }

        // 5. Adicionar campo updated_at na tabela users se não existir
        console.log('👥 Verificando campo updated_at na tabela users...');
        const updatedAtColumnExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'updated_at'
            )
        `);
        
        if (!updatedAtColumnExists.rows[0].exists) {
            console.log('➕ Adicionando campo updated_at na tabela users...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN updated_at TIMESTAMP DEFAULT NOW()
            `);
            console.log('✅ Campo updated_at adicionado\n');
        } else {
            console.log('✅ Campo updated_at já existe\n');
        }

        // 6. Alterar estrutura da tabela messages conforme documentação
        console.log('💬 Atualizando estrutura da tabela messages...');
        
        // Verificar se o campo route_id existe
        const routeIdColumnExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'messages' 
                AND column_name = 'route_id'
            )
        `);
        
        if (!routeIdColumnExists.rows[0].exists) {
            console.log('➕ Adicionando campo route_id na tabela messages...');
            await client.query(`
                ALTER TABLE messages 
                ADD COLUMN route_id INTEGER
            `);
            console.log('✅ Campo route_id adicionado\n');
        } else {
            console.log('✅ Campo route_id já existe\n');
        }

        // 7. Criar índices para melhor performance (apenas os que fazem sentido)
        console.log('📊 Criando índices...');
        
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_routes_name ON routes(name)',
            'CREATE INDEX IF NOT EXISTS idx_routes_users_id ON routes(users_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_route_id ON messages(route_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)'
        ];
        
        for (const index of indexes) {
            await client.query(index);
        }
        console.log('✅ Índices criados\n');

        // 8. Criar trigger para atualizar updated_at automaticamente
        console.log('🔄 Criando trigger para updated_at...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `);
        
        // Verificar se o trigger já existe
        const triggerExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM pg_trigger 
                WHERE tgname = 'update_users_updated_at'
            )
        `);
        
        if (!triggerExists.rows[0].exists) {
            await client.query(`
                CREATE TRIGGER update_users_updated_at 
                BEFORE UPDATE ON users
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
            `);
        }
        
        const routesTriggerExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM pg_trigger 
                WHERE tgname = 'update_routes_updated_at'
            )
        `);
        
        if (!routesTriggerExists.rows[0].exists) {
            await client.query(`
                CREATE TRIGGER update_routes_updated_at 
                BEFORE UPDATE ON routes
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
            `);
        }
        console.log('✅ Triggers criados\n');

        // 9. Verificar estrutura final
        console.log('🔍 Verificando estrutura final...');
        
        const finalTables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'routes', 'messages')
            ORDER BY table_name
        `);
        
        console.log('📊 Tabelas finais:');
        finalTables.rows.forEach(row => {
            console.log(`- ${row.table_name}`);
        });
        console.log('');

        // Verificar estrutura da tabela users
        const finalUsersStructure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('👥 Estrutura final da tabela users:');
        finalUsersStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });
        console.log('');

        // Verificar estrutura da tabela routes
        const finalRoutesStructure = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'routes' 
            ORDER BY ordinal_position
        `);
        
        console.log('🛣️  Estrutura final da tabela routes:');
        finalRoutesStructure.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });
        console.log('');

        console.log('🎉 Schema atualizado com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('1. Execute: npm start');
        console.log('2. Teste os endpoints da API');
        console.log('3. Use os exemplos do README_API.md');

    } catch (error) {
        console.error('\n❌ Erro durante a atualização:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

updateDatabaseSchema();
