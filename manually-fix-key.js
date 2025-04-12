/**
 * Manual Firebase Key Fixer
 * 
 * This script creates a template for you to manually add your Firebase private key.
 * Sometimes environment variables can cause formatting issues with private keys.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to log messages with colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

console.log(`\n${colors.bright}Manual Firebase Key Fixer${colors.reset}`);
console.log(`${colors.bright}=======================${colors.reset}\n`);

console.log(`${colors.yellow}This script will help you manually fix your Firebase credentials.${colors.reset}`);
console.log(`You will need to manually copy your private key from Firebase console.\n`);

// Check if required env vars exist
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

if (!projectId || !clientEmail) {
  console.error(`${colors.red}Error: Required environment variables missing.${colors.reset}`);
  console.log(`Make sure your .env file contains FIREBASE_ADMIN_PROJECT_ID and FIREBASE_ADMIN_CLIENT_EMAIL`);
  process.exit(1);
}

// Create template file
const templatePath = path.join(process.cwd(), 'firebase-key-template.json');
const templateContent = {
  "type": "service_account",
  "project_id": projectId,
  "private_key_id": "YOUR_KEY_ID_HERE",
  "private_key": "-----BEGIN PRIVATE KEY-----\nPASTE_YOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
  "client_email": clientEmail,
  "client_id": "",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": ""
};

fs.writeFileSync(templatePath, JSON.stringify(templateContent, null, 2));
console.log(`${colors.green}✓${colors.reset} Created firebase-key-template.json\n`);

console.log(`${colors.bright}How to fix your Firebase private key:${colors.reset}`);
console.log(`1. Go to Firebase Console > Project Settings > Service Accounts`);
console.log(`2. Click "Generate new private key" to download a fresh key file`);
console.log(`3. Open the downloaded JSON file and copy the entire private_key value`);
console.log(`4. Open firebase-key-template.json and replace "PASTE_YOUR_PRIVATE_KEY_HERE" with your actual key`);
console.log(`5. Rename the file to firebase-key.json`);
console.log(`6. Run your application using this key file\n`);

console.log(`${colors.yellow}IMPORTANT:${colors.reset} Add firebase-key.json to .gitignore to keep your key secure!\n`);

// Create an example script to use the key file
const exampleScriptPath = path.join(process.cwd(), 'use-key-file.js');
const exampleScriptContent = `/**
 * Example script to use the manually created firebase-key.json
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

// Initialize the app with the service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}"
});

console.log('Firebase Admin SDK initialized successfully');
`;

fs.writeFileSync(exampleScriptPath, exampleScriptContent);
console.log(`${colors.green}✓${colors.reset} Created use-key-file.js example script`);
console.log(`To test your key, run "node use-key-file.js" after setting up firebase-key.json\n`); 