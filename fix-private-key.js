/**
 * Firebase Private Key Fixer
 * 
 * This script helps diagnose and fix issues with Firebase private keys in .env files.
 * It will create a corrected version of your private key and update your .env file.
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

console.log(`\n${colors.bright}Firebase Private Key Fixer${colors.reset}`);
console.log(`${colors.bright}========================${colors.reset}\n`);

// Check if FIREBASE_ADMIN_PRIVATE_KEY exists
if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  console.error(`${colors.red}Error: FIREBASE_ADMIN_PRIVATE_KEY not found in .env file${colors.reset}`);
  console.log(`Please make sure your .env file contains this variable.`);
  process.exit(1);
}

// Check .env file exists
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error(`${colors.red}Error: .env file not found at ${envPath}${colors.reset}`);
  process.exit(1);
}

// Read the current .env file
const envContent = fs.readFileSync(envPath, 'utf8');

// Extract the private key
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

// Debug key information
console.log(`${colors.yellow}Diagnosing private key issues...${colors.reset}`);
console.log(`Private key length: ${privateKey.length} characters`);
console.log(`Contains '\\n' literals: ${privateKey.includes('\\n') ? 'Yes' : 'No'}`);
console.log(`Has proper BEGIN marker: ${privateKey.includes('-----BEGIN PRIVATE KEY-----') ? 'Yes' : 'No'}`);
console.log(`Has proper END marker: ${privateKey.includes('-----END PRIVATE KEY-----') ? 'Yes' : 'No'}`);

// Create a fixed version of the key
let fixedKey;

// Determine what fix to apply
if (privateKey.includes('\\n')) {
  console.log(`\n${colors.yellow}Issue detected:${colors.reset} Private key contains '\\n' escape sequences`);
  console.log(`${colors.green}Solution:${colors.reset} Using .replace(/\\\\n/g, '\\n') to fix line breaks`);
  
  fixedKey = privateKey.replace(/\\n/g, '\n');
  
  // Check if key is surrounded by quotes and has escaped quotes within
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || 
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    console.log(`${colors.yellow}Issue detected:${colors.reset} Private key is wrapped in quotes in .env file`);
    console.log(`${colors.green}Solution:${colors.reset} Removing surrounding quotes`);
    
    fixedKey = fixedKey.substring(1, fixedKey.length - 1);
  }
} else {
  console.log(`\n${colors.green}Good news:${colors.reset} Private key doesn't contain '\\n' escape sequences.`);
  fixedKey = privateKey;
}

// Create a proper formatted key suitable for .env
const formattedForEnv = fixedKey
  .split('\n')
  .join('\\n');

// Create backup of original .env
const backupPath = `${envPath}.backup`;
fs.writeFileSync(backupPath, envContent);
console.log(`\n${colors.green}✓${colors.reset} Created backup of original .env at ${backupPath}`);

// Update .env with fixed key
const updatedEnvContent = envContent.replace(
  /FIREBASE_ADMIN_PRIVATE_KEY=.*/,
  `FIREBASE_ADMIN_PRIVATE_KEY="${formattedForEnv}"`
);

fs.writeFileSync(envPath, updatedEnvContent);
console.log(`${colors.green}✓${colors.reset} Updated .env with fixed private key format`);

// Write a direct-use key file for testing
const directKeyPath = path.join(process.cwd(), 'firebase-key.json');
const directKeyContent = {
  type: "service_account",
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  private_key_id: "key-id",
  private_key: fixedKey,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  client_id: "",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: ""
};

fs.writeFileSync(directKeyPath, JSON.stringify(directKeyContent, null, 2));
console.log(`${colors.green}✓${colors.reset} Created firebase-key.json for direct use with Firebase Admin SDK`);

console.log(`\n${colors.bright}Next steps:${colors.reset}`);
console.log(`1. Try running your application again with the fixed key`);
console.log(`2. If still having issues, update your code to use the firebase-key.json file:`);
console.log(`   const serviceAccount = require('./firebase-key.json');`);
console.log(`   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });`);
console.log(`\n${colors.bright}IMPORTANT:${colors.reset} Add firebase-key.json to .gitignore to prevent exposing your private key!\n`); 