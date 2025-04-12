import admin from 'firebase-admin';

// Variable to cache the initialized Firebase Admin instance
let firebaseAdmin = null;

/**
 * Get the Firebase Admin instance, initializing it if necessary
 * @returns {Object} The Firebase Admin instance
 */
export function getFirebaseAdmin() {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  // Check if the app has already been initialized
  if (admin.apps.length === 0) {
    try {
      // Extract private key from environment
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
        ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      // Initialize the app with credentials
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });

      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      
      // Fallback for development environments or CI/CD
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Using development mode Firebase Admin');
        admin.initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        });
      } else {
        throw error; // In production, fail if we can't initialize properly
      }
    }
  }

  firebaseAdmin = admin;
  return firebaseAdmin;
}

/**
 * Verify a user has access to a document
 * @param {string} documentId - The document ID to verify
 * @param {string} userId - The user ID requesting access
 * @returns {Promise<boolean>} - Whether the user has access to the document
 */
export async function verifyUserDocumentAccess(documentId, userId) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    
    const docRef = await db.collection('documents').doc(documentId).get();
    
    if (!docRef.exists) {
      return false;
    }
    
    const docData = docRef.data();
    return docData.userId === userId;
  } catch (error) {
    console.error('Error verifying document access:', error);
    return false;
  }
}

/**
 * Clean up storage for a user's inactive resources
 * @param {string} userId - The user ID to clean up resources for
 * @returns {Promise<object>} - Results of the cleanup operation
 */
export async function cleanupInactiveUserResources(userId) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    
    const ONE_WEEK_AGO = new Date();
    ONE_WEEK_AGO.setDate(ONE_WEEK_AGO.getDate() - 7);
    
    // Find temp documents older than a week
    const tempDocsQuery = await db.collection('documents')
      .where('userId', '==', userId)
      .where('isTemporary', '==', true)
      .where('createdAt', '<', ONE_WEEK_AGO)
      .get();
    
    const results = {
      deletedDocuments: 0,
      deletedStorageFiles: 0,
      errors: []
    };
    
    // Delete each document and its storage
    for (const doc of tempDocsQuery.docs) {
      try {
        const data = doc.data();
        
        // Delete storage file if it exists
        if (data.storagePath) {
          try {
            await bucket.file(data.storagePath).delete();
            results.deletedStorageFiles++;
          } catch (storageError) {
            results.errors.push(`Failed to delete storage file: ${storageError.message}`);
          }
        }
        
        // Delete the document record
        await doc.ref.delete();
        results.deletedDocuments++;
      } catch (docError) {
        results.errors.push(`Failed to delete document ${doc.id}: ${docError.message}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error cleaning up user resources:', error);
    throw new Error(`Resource cleanup failed: ${error.message}`);
  }
} 