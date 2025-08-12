require('dotenv').config();
const sequelize = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupEmailSystem() {
    try {
        console.log('🚀 Configurando sistema de email...');
        
        // Ler o script SQL
        const sqlScript = fs.readFileSync(path.join(__dirname, 'create_password_tokens_table.sql'), 'utf8');
        
        console.log('📋 Executando script SQL para criar tabela password_tokens...');
        
        // Executar o script SQL
        await sequelize.query(sqlScript);
        
        console.log('✅ Tabela password_tokens criada com sucesso!');
        
        // Verificar se a tabela foi criada
        const [tables] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'password_tokens'
        `);
        
        if (tables.length > 0) {
            console.log('✅ Tabela password_tokens verificada no banco de dados');
            
            // Verificar estrutura da tabela
            const [columns] = await sequelize.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'password_tokens'
                ORDER BY ordinal_position
            `);
            
            console.log('📊 Estrutura da tabela password_tokens:');
            columns.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
            });
            
        } else {
            console.log('❌ Erro: Tabela password_tokens não foi criada');
        }
        
        console.log('\n🎉 Sistema de email configurado com sucesso!');
        console.log('\n📧 Endpoints disponíveis:');
        console.log('  - POST /email/request-local-password - Solicitar definição de senha');
        console.log('  - POST /email/request-password-reset - Solicitar redefinição de senha');
        console.log('  - POST /email/set-password - Definir nova senha');
        console.log('  - POST /email/reset-password - Redefinir senha');
        console.log('  - GET /email/verify-token - Verificar validade do token');
        
        console.log('\n⚠️  Lembre-se de configurar as variáveis de ambiente:');
        console.log('  - SENDGRID_API_KEY');
        console.log('  - JWT_SECRET');
        console.log('  - FROM_EMAIL');
        
    } catch (error) {
        console.error('❌ Erro ao configurar sistema de email:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('\n🔌 Conexão com banco de dados fechada');
    }
}

// Executar se o script for chamado diretamente
if (require.main === module) {
    setupEmailSystem();
}

module.exports = setupEmailSystem;
