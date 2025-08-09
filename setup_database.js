const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando configuração do banco de dados...\n');

// Função para executar comandos
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`📋 Executando: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erro: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.warn(`⚠️  Aviso: ${stderr}`);
            }
            if (stdout) {
                console.log(`✅ Sucesso: ${stdout}`);
            }
            resolve(stdout);
        });
    });
}

// Função para verificar se o arquivo existe
function checkFileExists(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Arquivo não encontrado: ${filePath}`);
        return false;
    }
    return true;
}

// Função principal
async function setupDatabase() {
    try {
        // Verificar se o arquivo schema existe
        const schemaFile = path.join(__dirname, 'database_schema.sql');
        if (!checkFileExists(schemaFile)) {
            throw new Error('Arquivo database_schema.sql não encontrado');
        }

        console.log('📁 Arquivo schema encontrado ✓\n');

        // Executar o script SQL
        console.log('🗄️  Executando schema SQL...');
        await executeCommand('psql -d notifications_app -f database_schema.sql');
        
        console.log('\n✅ Schema SQL executado com sucesso!');
        
        // Verificar se as tabelas foram criadas
        console.log('\n🔍 Verificando tabelas criadas...');
        await executeCommand('psql -d notifications_app -c "\\dt"');
        
        // Verificar estrutura das tabelas
        console.log('\n📊 Verificando estrutura das tabelas...');
        await executeCommand('psql -d notifications_app -c "\\d users"');
        await executeCommand('psql -d notifications_app -c "\\d routes"');
        await executeCommand('psql -d notifications_app -c "\\d messages"');
        
        console.log('\n🎉 Configuração do banco de dados concluída com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('1. Configure as variáveis de ambiente no arquivo .env');
        console.log('2. Execute: npm start');
        console.log('3. Teste os endpoints da API');
        
    } catch (error) {
        console.error('\n❌ Erro durante a configuração:', error.message);
        console.log('\n💡 Verifique se:');
        console.log('- PostgreSQL está instalado e rodando');
        console.log('- O banco "notifications_app" existe');
        console.log('- As credenciais estão corretas');
        process.exit(1);
    }
}

// Executar o script
setupDatabase();
