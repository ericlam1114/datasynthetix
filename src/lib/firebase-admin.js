// src/lib/firebase-admin.js
// Force Node.js to use legacy OpenSSL provider for compatibility
// This addresses the error:1E08010C:DECODER routines::unsupported issue
try {
  const crypto = require('crypto');
  // Check if setFips is available (Node.js 16+)
  if (typeof crypto.setFips === 'function') {
    // Disable FIPS mode which can cause compatibility issues
    crypto.setFips(false);
  }
  
  // Check if we can access the provider configuration in Node.js
  if (crypto.constants && crypto.constants.OPENSSL_VERSION_NUMBER) {
    console.log('OpenSSL version:', crypto.constants.OPENSSL_VERSION_NUMBER);
  }
} catch (error) {
  console.warn('Failed to configure crypto settings:', error);
}

// Import fs and path for file operations
const fs = require('fs');
const path = require('path');

// Check if Admin SDK is explicitly disabled
const DISABLE_ADMIN_SDK = process.env.DISABLE_FIREBASE_ADMIN_SDK === 'true';

// If Admin SDK is disabled, export mock implementations
if (DISABLE_ADMIN_SDK) {
  console.warn('Firebase Admin SDK is explicitly disabled by DISABLE_FIREBASE_ADMIN_SDK=true');
  
  // Export mock implementations that always return null
  module.exports = {
    checkFirebaseAdminCredentials: async () => false,
    initializeAdminApp: async () => null,
    getAdminFirestore: async () => null,
    getAdminStorage: async () => null,
    verifyDocumentAccess: async () => process.env.NODE_ENV === 'development' ? true : false,
    default: async () => null
  };
} 
// Otherwise, proceed with normal Firebase Admin SDK initialization
else {
  // Dynamic imports for Firebase Admin modules
  let adminAppModule, adminFirestoreModule, adminStorageModule;

  try {
    // Try to load the modules dynamically
    adminAppModule = require('firebase-admin/app');
    adminFirestoreModule = require('firebase-admin/firestore');
    adminStorageModule = require('firebase-admin/storage');
    console.log('Firebase Admin modules loaded successfully');
  } catch (error) {
    console.warn('Firebase Admin modules not available:', error.message);
    // Create mock implementations for the modules
    adminAppModule = {
      cert: () => ({}),
      getApps: () => [],
      initializeApp: () => null
    };
    adminFirestoreModule = {
      getFirestore: () => null
    };
    adminStorageModule = {
      getStorage: () => null
    };
  }

  // Extract needed functions from the modules
  const { cert, getApps, initializeApp } = adminAppModule;
  const { getFirestore } = adminFirestoreModule;
  const { getStorage } = adminStorageModule;

  // Initialize Firebase Admin with environment variables
  let adminApp;

  /**
   * Check if Firebase Admin credentials are available in environment variables
   * @returns {Promise<boolean>} True if credentials are available, false otherwise
   */
  async function checkFirebaseAdminCredentials() {
    try {
      if (DISABLE_ADMIN_SDK) {
        console.warn('Firebase Admin SDK is disabled, cannot check credentials');
        return false;
      }
      
      if (process.env.FIREBASE_ADMIN_PROJECT_ID && 
          process.env.FIREBASE_ADMIN_CLIENT_EMAIL && 
          process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking Firebase Admin credentials:', error);
      return false;
    }
  }

  /**
   * Initializes the Firebase Admin SDK if it hasn't been initialized already
   * @returns {Promise<Object>} The initialized Firebase Admin app
   */
  async function initializeAdminApp() {
    if (DISABLE_ADMIN_SDK) {
      console.log('Firebase Admin SDK is disabled. Using mock implementations.');
      return null;
    }

    // Check if app is already initialized
    try {
      return adminAppModule.app();
    } catch (error) {
      // App not initialized yet, continue with initialization
    }

    try {
      // Log environment for debugging
      console.log('NODE_ENV:', process.env.NODE_ENV);
      console.log('FIREBASE_AUTH_EMULATOR_HOST:', process.env.FIREBASE_AUTH_EMULATOR_HOST);
      
      let serviceAccount;
      // Try to get credential from environment variable first
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          // Parse the service account from environment variable
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          console.log('Using service account from environment variable');
        } catch (parseError) {
          console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseError);
          throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format');
        }
      } 
      // If not found in env var, try to load from file
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        try {
          // Check if file exists
          if (!fs.existsSync(credentialPath)) {
            throw new Error(`Credentials file not found at: ${credentialPath}`);
          }
          
          // Read and parse the file
          const rawCredentials = fs.readFileSync(credentialPath, 'utf8');
          serviceAccount = JSON.parse(rawCredentials);
          console.log(`Loaded service account from file: ${credentialPath}`);
        } catch (fileError) {
          console.error('Failed to load credentials file:', fileError);
          throw new Error(`Failed to load credentials from ${credentialPath}: ${fileError.message}`);
        }
      } else {
        console.warn('No explicit Firebase credentials found in environment variables. Using default credentials.');
      }

      // Initialize the app with credentials if available, otherwise use default credentials
      let adminApp;
      if (serviceAccount) {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
        console.log('Firebase Admin SDK initialized with explicit credentials');
      } else {
        // This will use Application Default Credentials
        adminApp = initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
        console.log('Firebase Admin SDK initialized with application default credentials');
      }

      return adminApp;
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
      
      // Check for common errors and provide helpful messages
      if (error.message.includes('Failed to parse') || error.message.includes('Invalid FIREBASE_SERVICE_ACCOUNT_KEY')) {
        console.error('The service account key is not valid JSON. Check your environment variable format.');
      } else if (error.message.includes('Credentials file not found')) {
        console.error('The credentials file path is incorrect. Check GOOGLE_APPLICATION_CREDENTIALS path.');
      } else if (error.message.includes('The private_key') && error.message.includes('not valid')) {
        console.error('Private key format is incorrect. Ensure newlines are preserved (\\n should be actual newlines).');
      }
      
      throw error;
    }
  }

  // Get Firestore from Admin SDK
  async function getAdminFirestore() {
    // If Firebase Admin SDK is disabled, always return null
    if (DISABLE_ADMIN_SDK) {
      console.warn('Firebase Admin SDK is disabled, cannot get Firestore');
      return null;
    }
    
    const app = await initializeAdminApp();
    if (!app) {
      console.error('Cannot get Admin Firestore - Admin App initialization failed');
      return null;
    }
    
    try {
      console.log('Getting Firestore from Admin SDK');
      return getFirestore(app);
    } catch (error) {
      console.error('Failed to initialize Admin Firestore:', error);
      console.error('Error details:', error.message);
      return null;
    }
  }

  // Get Storage from Admin SDK
  async function getAdminStorage() {
    // If Firebase Admin SDK is disabled, always return null
    if (DISABLE_ADMIN_SDK) {
      console.warn('Firebase Admin SDK is disabled, cannot get Storage');
      return null;
    }
    
    const app = await initializeAdminApp();
    if (!app) {
      console.error('Cannot get Admin Storage - Admin App initialization failed');
      return null;
    }
    
    try {
      console.log('Getting Storage from Admin SDK');
      return getStorage(app);
    } catch (error) {
      console.error('Failed to initialize Admin Storage:', error);
      console.error('Error details:', error.message);
      return null;
    }
  }

  // Helper function to verify if a user has access to a document
  async function verifyDocumentAccess(documentId, userId) {
    // If Firebase Admin SDK is disabled, handle based on environment
    if (DISABLE_ADMIN_SDK) {
      console.warn('Firebase Admin SDK is disabled, cannot verify document access');
      
      // In development, allow access by default
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: Auto-approving document access since Admin SDK is disabled');
        return true;
      }
      
      // In production, deny access by default for security
      return false;
    }
    
    try {
      const adminFirestore = await getAdminFirestore();
      if (!adminFirestore) {
        console.error('Cannot verify document access - Admin Firestore not available');
        
        // In development, allow access if Admin Firestore is unavailable
        if (process.env.NODE_ENV === 'development') {
          console.warn('Development mode: Bypassing document access check due to Admin Firestore unavailability');
          return true;
        }
        
        return false;
      }
      
      console.log(`Verifying access for document ${documentId} for user ${userId}`);
      
      try {
        // Add error handling specifically for the document retrieval
        const docRef = adminFirestore.collection("documents").doc(documentId);
        
        try {
          const docSnap = await docRef.get();
          
          if (!docSnap.exists) {
            console.log(`Document ${documentId} not found during access verification`);
            return false;
          }
          
          const docData = docSnap.data();
          
          // If we can't determine ownership but have user ID, default to granting access in development
          if (!docData.userId && process.env.NODE_ENV === 'development') {
            console.warn(`Document ${documentId} has no userId field, granting access in development mode`);
            return true;
          }
          
          const hasAccess = docData.userId === userId;
          console.log(`Document access verification result: ${hasAccess}`);
          return hasAccess;
        } catch (docError) {
          console.error(`Error retrieving document ${documentId}:`, docError);
          
          // Check for OpenSSL errors
          if (docError.toString().includes('DECODER routines::unsupported') || 
              docError.toString().includes('ERR_OSSL_UNSUPPORTED')) {
            console.error('OpenSSL compatibility error detected in document access check.');
            console.error('Try setting DISABLE_FIREBASE_ADMIN_SDK=true in your .env file');
            
            // In development mode, default to granting access when OpenSSL errors occur
            if (process.env.NODE_ENV === 'development') {
              console.warn('Development mode: Bypassing document access check due to OpenSSL error');
              return true;
            }
          }
          
          // In development mode, default to granting access when document access verification fails
          if (process.env.NODE_ENV === 'development') {
            console.warn('Development mode: Bypassing document access check due to error');
            return true;
          }
          
          // In production, maintain security by denying access on errors
          return false;
        }
      } catch (error) {
        console.error('Error verifying document access:', error);
        console.error('Error details:', error.message);
        
        // In development mode, default to granting access when verification fails
        if (process.env.NODE_ENV === 'development') {
          console.warn('Development mode: Bypassing document access check due to error');
          return true;
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error verifying document access:', error);
      console.error('Error details:', error.message);
      
      // In development mode, default to granting access when verification fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: Bypassing document access check due to error');
        return true;
      }
      
      return false;
    }
  }

  // Export our functions
  module.exports = {
    checkFirebaseAdminCredentials,
    initializeAdminApp,
    getAdminFirestore,
    getAdminStorage,
    verifyDocumentAccess,
    default: initializeAdminApp
  };
} 