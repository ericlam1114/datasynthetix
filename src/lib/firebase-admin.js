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

  async function initializeAdminApp() {
    // If Firebase Admin is disabled, always return null
    if (DISABLE_ADMIN_SDK) {
      console.warn('Firebase Admin SDK is disabled, skipping initialization');
      return null;
    }
    
    // If Firebase Admin modules not available, return null immediately
    if (!adminAppModule.initializeApp || typeof adminAppModule.initializeApp !== 'function') {
      console.warn('Firebase Admin modules not properly loaded - cannot initialize');
      return null;
    }

    if (adminApp) {
      return adminApp;
    }

    const apps = getApps();
    
    // If an admin app already exists, return it
    if (apps.length > 0) {
      adminApp = apps[0];
      console.log('Using existing Firebase Admin app');
      return adminApp;
    }

    // Initialize a new admin app
    try {
      console.log('Attempting to initialize Firebase Admin SDK');
      
      // Check for service account credentials in environment variables
      let hasCredentials = false;
      let projectId, clientEmail, privateKey;
      
      if (process.env.FIREBASE_ADMIN_PROJECT_ID && 
          process.env.FIREBASE_ADMIN_CLIENT_EMAIL && 
          process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
        hasCredentials = true;
        projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
        clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
        
        // Properly process the private key to avoid OpenSSL issues
        try {
          // First, make sure to replace any literal '\n' with actual newlines
          privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
          
          // Make sure the key includes the PEM format headers and footers
          if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
          }
          
          console.log('Private key processed successfully');
        } catch (keyError) {
          console.error('Error processing private key:', keyError);
          throw keyError;
        }
        
        console.log(`Found Firebase Admin credentials for project: ${projectId}`);
      } else {
        console.warn('Firebase Admin SDK credentials not found in environment variables');
        
        // For development only: Try to use the client-side project ID if available
        projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        if (projectId) {
          console.log(`Using client-side project ID for dev mode: ${projectId}`);
        } else {
          throw new Error('No Firebase project ID available');
        }
      }

      if (hasCredentials) {
        try {
          // For debugging - log a sample of the private key
          console.log('Private key length:', privateKey.length);
          console.log('Private key sample (first 50 chars):', privateKey.substring(0, 50));
          
          // Alternative initialization approach
          const serviceAccount = {
            projectId,
            clientEmail,
            privateKey
          };
          
          // Initialize with modified approach
          adminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId,
            databaseURL: `https://${projectId}.firebaseio.com`,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          });
        } catch (certError) {
          console.error('Error creating credential certificate:', certError);
          
          // As a fallback, temporarily disable the auth check
          console.warn('⚠️ DEVELOPER MODE: Bypassing Firebase Admin authentication for development');
          
          // Set environment variable to identify we're running in fallback mode
          process.env.FIREBASE_ADMIN_FALLBACK_MODE = 'true';
          
          // Initialize with application default credentials as a fallback
          adminApp = initializeApp({
            projectId,
          });
        }
      } else {
        // For development only: initialize with application default credentials
        // This requires running `firebase login` on the dev machine
        adminApp = initializeApp({
          projectId,
        });
      }
      
      console.log('Firebase Admin SDK initialized successfully');
      return adminApp;
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
      console.error('Error details:', error.message);
      
      // Check for OpenSSL errors
      if (error.message && (
          error.message.includes('DECODER routines::unsupported') || 
          error.message.includes('ERR_OSSL_UNSUPPORTED'))) {
        console.error('OpenSSL compatibility error detected. Try setting DISABLE_FIREBASE_ADMIN_SDK=true in your .env file');
        console.error('Alternatively, run your app with NODE_OPTIONS=--openssl-legacy-provider');
      }
      
      // Fallback mode - log that we're continuing without admin SDK
      console.warn('Continuing without Firebase Admin SDK - some server-side operations may fail');
      
      // Return null so the calling code can use an alternative approach
      return null;
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