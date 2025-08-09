require('dotenv').config();
const { Client } = require('pg');
const { logger } = require('./middleware/logger');

console.log('🚀 Atualizando schema do banco para suporte Google OAuth 2.0...\n');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'notifications_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

async function updateGoogleOAuthSchema() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados\n');

        // 1. Adicionar campos para Google OAuth na tabela users
        console.log('👥 Atualizando tabela users para suporte Google OAuth...');
        
        // Verificar e adicionar campo google_id
        const googleIdExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'google_id'
            )
        `);
        
        if (!googleIdExists.rows[0].exists) {
            console.log('➕ Adicionando campo google_id...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN google_id VARCHAR(255) UNIQUE
            `);
        } else {
            console.log('✅ Campo google_id já existe');
        }

        // Verificar e adicionar campo profile_picture
        const profilePictureExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'profile_picture'
            )
        `);
        
        if (!profilePictureExists.rows[0].exists) {
            console.log('➕ Adicionando campo profile_picture...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN profile_picture VARCHAR(500)
            `);
        } else {
            console.log('✅ Campo profile_picture já existe');
        }

        // Verificar e adicionar campo auth_provider
        const authProviderExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'auth_provider'
            )
        `);
        
        if (!authProviderExists.rows[0].exists) {
            console.log('➕ Adicionando campo auth_provider...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'local'
            `);
        } else {
            console.log('✅ Campo auth_provider já existe');
        }

        // Verificar e adicionar campo is_verified
        const isVerifiedExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'is_verified'
            )
        `);
        
        if (!isVerifiedExists.rows[0].exists) {
            console.log('➕ Adicionando campo is_verified...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN is_verified BOOLEAN DEFAULT false
            `);
        } else {
            console.log('✅ Campo is_verified já existe');
        }

        // 2. Tornar o campo password opcional (para usuários do Google)
        console.log('🔑 Tornando campo password opcional...');
        try {
                         await client.query(`
                 ALTER TABLE users 
                 ALTER COLUMN password DROP NOT NULL
             `);
            console.log('✅ Campo password agora é opcional');
        } catch (error) {
            if (error.message.includes('column "password" of relation "users" is not a not-null constraint')) {
                console.log('✅ Campo password já é opcional');
            } else {
                console.log('⚠️  Aviso ao tornar password opcional:', error.message);
            }
        }

        // 3. Criar índices para performance
        console.log('📊 Criando índices para performance...');
        
        const indexes = [
            {
                name: 'idx_users_google_id',
                query: 'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
                description: 'Índice para google_id'
            },
            {
                name: 'idx_users_auth_provider',
                query: 'CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider)',
                description: 'Índice para auth_provider'
            },
            {
                name: 'idx_users_email',
                query: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
                description: 'Índice para email'
            }
        ];
        
        for (const index of indexes) {
            try {
                await client.query(index.query);
                console.log(`✅ ${index.description} criado`);
            } catch (error) {
                console.log(`⚠️  Aviso ao criar ${index.description}:`, error.message);
            }
        }

        // 4. Atualizar usuários existentes para ter auth_provider = 'local'
        console.log('🔄 Atualizando usuários existentes...');
        const updateResult = await client.query(`
            UPDATE users 
            SET auth_provider = 'local', 
                is_verified = true 
            WHERE auth_provider IS NULL OR auth_provider = ''
        `);
        console.log(`✅ ${updateResult.rowCount} usuários atualizados com auth_provider = 'local'`);

        // 5. Verificar estrutura final da tabela users
        console.log('\n🔍 Verificando estrutura final da tabela users...');
        
        const finalStructure = await client.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Estrutura final da tabela users:');
        console.log('┌─────────────────────┬─────────────────┬─────────────┬─────────────────────┐');
        console.log('│ Campo               │ Tipo            │ Nulo?       │ Padrão              │');
        console.log('├─────────────────────┼─────────────────┼─────────────┼─────────────────────┤');
        
        finalStructure.rows.forEach(col => {
            const name = col.column_name.padEnd(19);
            const type = col.data_type.padEnd(15);
            const nullable = (col.is_nullable === 'YES' ? 'SIM' : 'NÃO').padEnd(11);
            const defaultValue = (col.column_default || '').substring(0, 19).padEnd(19);
            console.log(`│ ${name} │ ${type} │ ${nullable} │ ${defaultValue} │`);
        });
        console.log('└─────────────────────┴─────────────────┴─────────────┴─────────────────────┘');

        // 6. Verificar índices criados
        console.log('\n📊 Verificando índices criados...');
        const indexesResult = await client.query(`
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE tablename = 'users' 
            AND indexname LIKE 'idx_users_%'
            ORDER BY indexname
        `);
        
        console.log('\n📋 Índices da tabela users:');
        indexesResult.rows.forEach(idx => {
            console.log(`- ${idx.indexname} (${idx.tablename})`);
        });

        console.log('\n🎉 Schema atualizado com sucesso para suporte Google OAuth 2.0!');
        console.log('\n📋 Próximos passos:');
        console.log('1. Instalar dependências: npm install google-auth-library jsonwebtoken');
        console.log('2. Configurar variáveis de ambiente no .env');
        console.log('3. Implementar rotas de autenticação Google');
        console.log('4. Testar fluxo de autenticação');

    } catch (error) {
        console.error('\n❌ Erro durante a atualização do schema:', error.message);
        console.log('\n💡 Verifique se:');
        console.log('- PostgreSQL está rodando');
        console.log('- As credenciais do banco estão corretas no .env');
        console.log('- O usuário tem permissões para alterar tabelas');
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Executar o script
updateGoogleOAuthSchema();
