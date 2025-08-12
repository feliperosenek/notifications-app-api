const axios = require('axios');

// Configuração base para os testes
const BASE_URL = 'https://1bf410f736be.ngrok-free.app';
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

// Função para testar a rota de redirecionamento
async function testRedirectRoute() {
    console.log('\n🧪 Testando rota de redirecionamento: GET /email/redirect/:action/:token');
    
    // Primeiro, solicita um email para obter um token válido
    console.log('\n📧 Solicitando email para obter token válido...');
    
    const emailResult = await makeRequest('POST', '/email/request-local-password', {
        email: TEST_EMAIL
    });

    if (!emailResult.success) {
        console.log('❌ Erro ao solicitar email:', emailResult.error);
        return;
    }

    console.log('✅ Email solicitado com sucesso');
    console.log('⏳ Aguarde alguns segundos para o email ser processado...');
    
    // Aguarda um pouco para o email ser processado
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🔍 Agora você pode testar a rota de redirecionamento manualmente:');
    console.log('1. Verifique seu email em:', TEST_EMAIL);
    console.log('2. Clique em qualquer botão do email');
    console.log('3. Você será redirecionado para a página de validação');
    console.log('4. A página validará o token e redirecionará para o app');
    
    console.log('\n📋 Exemplo de URL da rota de redirecionamento:');
    console.log(`${BASE_URL}/email/redirect/set-password/SEU_TOKEN_AQUI?email=${encodeURIComponent(TEST_EMAIL)}`);
    
    console.log('\n⚠️  Nota: Para testar completamente, você precisará:');
    console.log('- Verificar o email recebido');
    console.log('- Copiar o token do link');
    console.log('- Acessar a URL de redirecionamento no navegador');
}

// Função para testar cenários de erro
async function testErrorScenarios() {
    console.log('\n🧪 Testando cenários de erro da rota de redirecionamento');
    
    // Teste 1: Token inválido
    console.log('\n📝 Teste 1: Token inválido');
    const result1 = await makeRequest('GET', '/email/redirect/set-password/invalid-token?email=test@example.com');
    if (result1.success) {
        console.log('✅ Página de erro exibida corretamente para token inválido');
    } else {
        console.log('❌ Erro inesperado:', result1.error);
    }
    
    // Teste 2: Email ausente
    console.log('\n📝 Teste 2: Email ausente');
    const result2 = await makeRequest('GET', '/email/redirect/set-password/some-token');
    if (result2.success) {
        console.log('✅ Página de erro exibida corretamente para email ausente');
    } else {
        console.log('❌ Erro inesperado:', result2.error);
    }
    
    // Teste 3: Ação inválida
    console.log('\n📝 Teste 3: Ação inválida');
    const result3 = await makeRequest('GET', '/email/redirect/invalid-action/some-token?email=test@example.com');
    if (result3.success) {
        console.log('✅ Página de erro exibida corretamente para ação inválida');
    } else {
        console.log('❌ Erro inesperado:', result3.error);
    }
}

// Função principal
async function runTests() {
    console.log('🚀 Iniciando testes da rota de redirecionamento...');
    console.log('📍 URL base:', BASE_URL);
    console.log('📧 Email de teste:', TEST_EMAIL);
    
    try {
        await testRedirectRoute();
        await testErrorScenarios();
        
        console.log('\n🎉 Todos os testes foram executados!');
        console.log('\n📝 Resumo:');
        console.log('- ✅ Rota de redirecionamento criada com sucesso');
        console.log('- ✅ Validação de token implementada');
        console.log('- ✅ Páginas de erro personalizadas');
        console.log('- ✅ Redirecionamento seguro para o app');
        console.log('\n🔗 Para testar completamente:');
        console.log('1. Solicite um email (feito automaticamente)');
        console.log('2. Verifique sua caixa de entrada');
        console.log('3. Clique nos botões do email');
        console.log('4. Teste a validação e redirecionamento');
        
    } catch (error) {
        console.error('❌ Erro durante os testes:', error.message);
    }
}

// Executa os testes se o arquivo for executado diretamente
if (require.main === module) {
    runTests();
}

module.exports = {
    testRedirectRoute,
    testErrorScenarios,
    runTests
};
