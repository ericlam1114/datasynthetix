/**
 * Helper functions for Firebase key formatting and credential validation
 */

/**
 * Format Firebase private key to handle environment variable encoding issues
 * @param {string} key - The private key from environment variables
 * @returns {string} Properly formatted private key
 */
export function formatFirebasePrivateKey(key) {
  if (!key) return undefined;
  
  // Handle different representations of newlines in the key
  // - Some hosting platforms encode newlines as \n literal characters
  // - Some platforms preserve actual newlines, but might add quotes
  
  let formattedKey = key;
  
  // Replace literal \n with actual newlines
  if (formattedKey.includes('\\n')) {
    formattedKey = formattedKey.replace(/\\n/g, '\n');
  }
  
  // Remove any extra quotes that might be added by some platforms
  if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
    formattedKey = formattedKey.slice(1, -1);
  }
  
  return formattedKey;
}

/**
 * Check if Firebase Admin credentials are properly set
 * @returns {Object} Status of Firebase Admin credentials
 */
export function checkFirebaseAdminCredentials() {
  const result = {
    hasProjectId: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
    hasClientEmail: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
    hasPrivateKey: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    privateKeyFormat: null,
    allCredentialsPresent: false
  };
  
  // Check private key format if present
  if (result.hasPrivateKey) {
    const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    
    if (key.includes('\\n')) {
      result.privateKeyFormat = 'escaped-newlines';
    } else if (key.includes('\n')) {
      result.privateKeyFormat = 'actual-newlines';
    } else if (key.startsWith('-----BEGIN PRIVATE KEY-----') && key.endsWith('-----END PRIVATE KEY-----')) {
      result.privateKeyFormat = 'single-line';
    } else {
      result.privateKeyFormat = 'unknown';
    }
  }
  
  // Check if all required credentials are present
  result.allCredentialsPresent = result.hasProjectId && result.hasClientEmail && result.hasPrivateKey;
  
  return result;
}

/**
 * Generate a diagnostic report for Firebase configuration
 * @returns {Object} Firebase configuration diagnostic report
 */
export function generateFirebaseConfigReport() {
  // Check for client-side config
  const clientConfig = {
    apiKey: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
  };
  
  // Check for server-side config
  const serverConfig = checkFirebaseAdminCredentials();
  
  // Check if storage bucket is properly configured
  const storageBucketConfig = {
    clientSide: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    serverSide: process.env.FIREBASE_STORAGE_BUCKET,
    usingFallback: Boolean(!process.env.FIREBASE_STORAGE_BUCKET && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
  };
  
  return {
    environment: process.env.NODE_ENV,
    clientSideConfig: {
      ...clientConfig,
      allPresent: Object.values(clientConfig).every(Boolean)
    },
    serverSideConfig: serverConfig,
    storageBucketConfig,
  };
} 