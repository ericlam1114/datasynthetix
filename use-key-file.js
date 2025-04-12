/**
 * Example script to use the manually created firebase-key.json
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

// Initialize the app with the service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "datasynthetix.firebasestorage.app"
});

console.log('Firebase Admin SDK initialized successfully');
