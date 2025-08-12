const axios = require('axios');

// Configuração base para os testes
const BASE_URL = 'http://localhost:3200';
const TEST_EMAIL = 'feliperosenek@gmail.com';

// Função para fazer requisições HTTP
async function makeRequest(method, endpoint, data = null) {
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data || error.message, 
            status: error.response?.status || 500 
        };
    }
}

// Função para testar endpoint de solicitação de definição de senha
async function testRequestLocalPassword() {
    console.log('\n🧪 Testando endpoint: POST /email/request-local-password');
    
    const result = await makeRequest('POST', '/email/request-local-password', {
        email: TEST_EMAIL
    });

    if (result.success) {
        console.log('✅ Sucesso:', result.data);
    } else {
        console.log('❌ Erro:', result.error);
    }
    
    return result;
}

// Função para testar endpoint de solicitação de redefinição de senha
async function testRequestPasswordReset() {
    console.log('\n🧪 Testando endpoint: POST /email/request-password-reset');
    
    const result = await makeRequest('POST', '/email/request-password-reset', {
        email: TEST_EMAIL
    });

    if (result.success) {
        console.log('✅ Sucesso:', result.data);
    } else {
        console.log('❌ Erro:', result.error);
    }
    
    return result;
}

// Função para testar endpoint de verificação de token
async function testVerifyToken() {
    console.log('\n🧪 Testando endpoint: GET /email/verify-token');
    
    const result = await makeRequest('GET', '/email/verify-token', {
        token: 'invalid-token',
        email: TEST_EMAIL,
        type: 'set'
    });

    if (result.success) {
        console.log('✅ Sucesso:', result.data);
    } else {
        console.log('❌ Erro:', result.error);
    }
    
    return result;
}

// Função para testar endpoint de definição de senha
async function testSetPassword() {
    console.log('\n🧪 Testando endpoint: POST /email/set-password');
    
    const result = await makeRequest('POST', '/email/set-password', {
        token: 'invalid-token',
        email: TEST_EMAIL,
        password: 'Test123!',
        confirmPassword: 'Test123!'
    });

    if (result.success) {
        console.log('✅ Sucesso:', result.data);
    } else {
        console.log('❌ Erro:', result.error);
    }
    
    return result;
}

// Função para testar endpoint de redefinição de senha
async function testResetPassword() {
    console.log('\n🧪 Testando endpoint: POST /email/reset-password');
    
    const result = await makeRequest('POST', '/email/reset-password', {
        token: 'invalid-token',
        email: TEST_EMAIL,
        password: 'Test123!',
        confirmPassword: 'Test123!'
    });

    if (result.success) {
        console.log('✅ Sucesso:', result.data);
    } else {
        console.log('❌ Erro:', result.error);
    }
    
    return result;
}

// Função principal para executar todos os testes
async function runAllTests() {
    console.log('🚀 Iniciando testes dos endpoints de email...');
    console.log(`📍 URL base: ${BASE_URL}`);
    console.log(`📧 Email de teste: ${TEST_EMAIL}`);
    
    try {
        // Testar todos os endpoints
        await testRequestLocalPassword();
        await testRequestPasswordReset();
        await testVerifyToken();
        await testSetPassword();
        await testResetPassword();
        
        console.log('\n🎉 Todos os testes foram executados!');
        console.log('\n📝 Notas:');
        console.log('  - Os testes com tokens inválidos devem retornar erro (comportamento esperado)');
        console.log('  - Para testes completos, use tokens válidos gerados pelos endpoints de solicitação');
        console.log('  - Verifique os logs do servidor para mais detalhes');
        
    } catch (error) {
        console.error('❌ Erro durante os testes:', error.message);
    }
}

// Executar testes se o script for chamado diretamente
if (require.main === module) {
    runAllTests();
}

module.exports = {
    testRequestLocalPassword,
    testRequestPasswordReset,
    testVerifyToken,
    testSetPassword,
    testResetPassword,
    runAllTests
};
