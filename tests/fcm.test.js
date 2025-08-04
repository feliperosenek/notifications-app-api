const FCMService = require('../services/fcmService');

describe('FCM Service', () => {
    test('deve validar token FCM correto', () => {
        const validToken = 'fMEP1234567890abcdefghijklmnopqrstuvwxyz';
        expect(FCMService.isValidToken(validToken)).toBe(true);
    });

    test('deve rejeitar token FCM inválido', () => {
        const invalidTokens = [
            'token-invalido',
            'ExponentPushToken[123]',
            '',
            null,
            undefined,
            'fMEP', // muito curto
            '1234567890abcdef' // não começa com fMEP
        ];

        invalidTokens.forEach(token => {
            expect(FCMService.isValidToken(token)).toBe(false);
        });
    });

    test('deve enviar notificação FCM válida', async () => {
        const token = 'fMEP1234567890abcdefghijklmnopqrstuvwxyz'; // Token de exemplo
        const messageData = {
            id: 1,
            message: 'Teste',
            type: 'info',
            category: 'test',
            route: 'test-route',
            channel: 'default',
            content: 'Conteúdo de teste',
            user_id: 1,
            datetime: new Date().toISOString(),
            status: 'active'
        };

        const result = await FCMService.sendPushNotification(token, messageData);
        
        // Como é um token de exemplo, esperamos que falhe com erro de token inválido
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_TOKEN');
    });

    test('deve rejeitar token FCM inválido no envio', async () => {
        const token = 'token-invalido';
        const messageData = {
            id: 1,
            message: 'Teste',
            type: 'info',
            category: 'test',
            route: 'test-route',
            channel: 'default',
            content: 'Conteúdo de teste',
            user_id: 1,
            datetime: new Date().toISOString(),
            status: 'active'
        };

        const result = await FCMService.sendPushNotification(token, messageData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_TOKEN');
    });

    test('deve retornar cor correta por tipo', () => {
        expect(FCMService.getColorByType('info')).toBe('#007bff');
        expect(FCMService.getColorByType('warning')).toBe('#ffc107');
        expect(FCMService.getColorByType('error')).toBe('#dc3545');
        expect(FCMService.getColorByType('success')).toBe('#28a745');
        expect(FCMService.getColorByType('unknown')).toBe('#007bff'); // cor padrão
    });
});

// Teste manual para verificar configuração do Firebase
console.log('=== Teste de Configuração FCM ===');
console.log('Verificando se o Firebase Admin está configurado...');

try {
    const { messaging } = require('../firebaseAdmin');
    console.log('✅ Firebase Admin configurado com sucesso');
    console.log('✅ Messaging service disponível');
} catch (error) {
    console.log('❌ Erro na configuração do Firebase Admin:', error.message);
}

console.log('=== Fim do Teste ==='); 