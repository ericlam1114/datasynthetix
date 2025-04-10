// src/lib/firebase-admin.js
// Dynamic imports for Firebase Admin modules
let adminAppModule, adminFirestoreModule, adminStorageModule;

try {
  // Try to load the modules dynamically
  adminAppModule = require('firebase-admin/app');
  adminFirestoreModule = require('firebase-admin/firestore');
  adminStorageModule = require('firebase-admin/storage');
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
    return adminApp;
  }

  // Initialize a new admin app
  try {
    // Check for service account credentials in environment variables
    if (!process.env.FIREBASE_ADMIN_PROJECT_ID || 
        !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || 
        !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      throw new Error('Firebase Admin SDK credentials not found in environment variables');
    }

    // Initialize with service account
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // The private key needs to be properly formatted from the environment variable
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      databaseURL: `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebaseio.com`,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    
    console.log('Firebase Admin SDK initialized successfully');
    return adminApp;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    
    // Fallback mode - log that we're continuing without admin SDK
    console.warn('Continuing without Firebase Admin SDK - some server-side operations may fail');
    
    // Return null so the calling code can use an alternative approach
    return null;
  }
}

// Get Firestore from Admin SDK
export async function getAdminFirestore() {
  const app = await initializeAdminApp();
  if (!app) return null;
  
  try {
    return getFirestore(app);
  } catch (error) {
    console.error('Failed to initialize Admin Firestore:', error);
    return null;
  }
}

// Get Storage from Admin SDK
export async function getAdminStorage() {
  const app = await initializeAdminApp();
  if (!app) return null;
  
  try {
    return getStorage(app);
  } catch (error) {
    console.error('Failed to initialize Admin Storage:', error);
    return null;
  }
}

// Helper function to verify if a user has access to a document
export async function verifyDocumentAccess(documentId, userId) {
  try {
    const adminFirestore = await getAdminFirestore();
    if (!adminFirestore) return false;
    
    const docRef = adminFirestore.collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) return false;
    
    const docData = docSnap.data();
    return docData.userId === userId;
  } catch (error) {
    console.error('Error verifying document access:', error);
    return false;
  }
}

export default initializeAdminApp; 