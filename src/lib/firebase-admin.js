// src/lib/firebase-admin.js
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
export async function checkFirebaseAdminCredentials() {
  try {
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

export async function initializeAdminApp() {
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
      privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
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
      // Initialize with full service account credentials
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
        databaseURL: `https://${projectId}.firebaseio.com`,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
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
    
    // Fallback mode - log that we're continuing without admin SDK
    console.warn('Continuing without Firebase Admin SDK - some server-side operations may fail');
    
    // Return null so the calling code can use an alternative approach
    return null;
  }
}

// Get Firestore from Admin SDK
export async function getAdminFirestore() {
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
export async function getAdminStorage() {
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
export async function verifyDocumentAccess(documentId, userId) {
  try {
    const adminFirestore = await getAdminFirestore();
    if (!adminFirestore) {
      console.error('Cannot verify document access - Admin Firestore not available');
      return false;
    }
    
    const docRef = adminFirestore.collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      console.log(`Document ${documentId} not found during access verification`);
      return false;
    }
    
    const docData = docSnap.data();
    return docData.userId === userId;
  } catch (error) {
    console.error('Error verifying document access:', error);
    console.error('Error details:', error.message);
    return false;
  }
}

export default initializeAdminApp; 