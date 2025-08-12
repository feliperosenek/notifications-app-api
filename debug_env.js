require('dotenv').config();

console.log('=== Verificando Variáveis de Ambiente ===');
console.log('FIREBASE_TYPE:', process.env.FIREBASE_TYPE);
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('FIREBASE_PRIVATE_KEY_ID:', process.env.FIREBASE_PRIVATE_KEY_ID);
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('FIREBASE_CLIENT_ID:', process.env.FIREBASE_CLIENT_ID);

// Verificar se a chave privada está sendo carregada
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
    console.log('FIREBASE_PRIVATE_KEY length:', privateKey.length);
    console.log('FIREBASE_PRIVATE_KEY starts with:', privateKey.substring(0, 50));
    console.log('FIREBASE_PRIVATE_KEY ends with:', privateKey.substring(privateKey.length - 50));
    console.log('Contains \\n:', privateKey.includes('\\n'));
    console.log('Contains actual newlines:', privateKey.includes('\n'));
} else {
    console.log('❌ FIREBASE_PRIVATE_KEY não está definida');
}

console.log('=== Fim da Verificação ===');
