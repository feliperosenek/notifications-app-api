const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Substitua pelo caminho correto

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const messaging = admin.messaging();

module.exports = { messaging };
