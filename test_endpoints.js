require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

console.log('🧪 Testando endpoints da API...\n');

async function testEndpoints() {
    try {
        console.log('1️⃣ Testando criação de usuário...');
        
        // Teste 1: Criar usuário
        const createUserResponse = await axios.post(`${API_BASE_URL}/database/create-user`, {
            firstName: 'João',
            lastName: 'Silva',
            email: 'joao.silva@exemplo.com',
            password: 'senha123'
        });
        
        console.log('✅ Usuário criado:', createUserResponse.data);
        const userId = createUserResponse.data.data.user_id;
        
        console.log('\n2️⃣ Testando configuração de rotas...');
        
        // Teste 2: Configurar rotas (sem token)
        const setRoutesResponse = await axios.post(`${API_BASE_URL}/database/set-route`, {
            user_id: userId,
            routes: [
                {
                    name: 'pessoal'
                    // token é opcional agora
                },
                {
                    name: 'trabalho',
                    token: 'fMEP...' // token opcional
                }
            ]
        });
        
        console.log('✅ Rotas configuradas:', setRoutesResponse.data);
        
        console.log('\n3️⃣ Testando verificação de rota...');
        
        // Teste 3: Verificar rota
        const checkRouteResponse = await axios.post(`${API_BASE_URL}/database/check-route`, {
            user_id: userId,
            name: 'pessoal'
        });
        
        console.log('✅ Rota verificada:', checkRouteResponse.data);
        
        console.log('\n4️⃣ Testando envio de mensagem...');
        
        // Teste 4: Enviar mensagem
        const sendMessageResponse = await axios.post(`${API_BASE_URL}/send-message`, {
            user_id: userId,
            route_name: 'pessoal',
            type: 'text',
            content: 'Olá! Esta é uma mensagem de teste.'
        });
        
        console.log('✅ Mensagem enviada:', sendMessageResponse.data);
        
        console.log('\n🎉 Todos os testes passaram com sucesso!');
        console.log('\n📋 Resumo:');
        console.log('- ✅ Criação de usuário funcionando');
        console.log('- ✅ Configuração de rotas funcionando');
        console.log('- ✅ Verificação de rota funcionando');
        console.log('- ✅ Envio de mensagem funcionando');
        
    } catch (error) {
        console.error('\n❌ Erro durante os testes:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', error.response.data);
        }
        
        process.exit(1);
    }
}

// Verificar se a API está rodando
async function checkApiStatus() {
    try {
        await axios.get(`${API_BASE_URL}/database`);
        console.log('✅ API está rodando');
        return true;
    } catch (error) {
        console.error('❌ API não está rodando. Execute: npm start');
        return false;
    }
}

async function runTests() {
    console.log('🔍 Verificando se a API está rodando...');
    const apiRunning = await checkApiStatus();
    
    if (!apiRunning) {
        return;
    }
    
    console.log('\n🚀 Iniciando testes...\n');
    await testEndpoints();
}

runTests();
