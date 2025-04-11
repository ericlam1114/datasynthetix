import { doc, getDoc } from 'firebase/firestore';

/**
 * Verifies a Firebase auth token from a request
 * @param {Request} request - The Next.js request object
 * @param {Object} auth - Firebase auth instance
 * @param {boolean} requireUser - Whether to require a user (throws if not found)
 * @returns {Promise<Object|null>} The decoded token, or null if no valid token
 */
export async function verifyAuthToken(request, auth, requireUser = true) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (requireUser) {
        throw new Error('Authentication required');
      }
      return null;
    }
    
    const token = authHeader.split('Bearer ')[1];
    if (!token) {
      if (requireUser) {
        throw new Error('Invalid authentication token');
      }
      return null;
    }
    
    // Verify token with Firebase
    return await auth.verifyIdToken(token);
  } catch (error) {
    console.error('Token verification failed:', error);
    
    if (requireUser) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
    return null;
  }
}

/**
 * Extracts the user ID from a Firebase auth token
 * @param {Request} request - The Next.js request object
 * @param {Object} auth - Firebase auth instance
 * @param {boolean} requireUser - Whether to require a user (throws if not found)
 * @returns {Promise<string|null>} The user ID, or null if no valid token
 */
export async function getUserIdFromRequest(request, auth, requireUser = true) {
  const user = await verifyAuthToken(request, auth, requireUser);
  return user ? user.uid : null;
}

/**
 * Gets form data with authentication
 * @param {Request} request - The Next.js request object 
 * @param {Object} auth - Firebase auth instance
 * @returns {Promise<{formData: FormData, user: Object|null}>} The form data and user object
 */
export async function getFormDataWithAuth(request, auth) {
  const formData = await request.formData();
  
  // Check for auth token in form data first
  let user = null;
  const authToken = formData.get('authToken');
  
  if (authToken) {
    try {
      user = await auth.verifyIdToken(authToken);
    } catch (error) {
      console.warn('Token from form data invalid:', error.message);
    }
  }
  
  // If no user from form data, try the Authorization header
  if (!user) {
    try {
      user = await verifyAuthToken(request, auth, false);
    } catch (error) {
      console.warn('Auth header verification failed:', error.message);
    }
  }
  
  return { formData, user };
}

/**
 * Checks if a user has access to a document
 * @param {string} userId - The user ID
 * @param {string} documentId - The document ID
 * @param {Object} db - Firestore instance
 * @returns {Promise<boolean>} Whether the user has access
 */
export async function checkDocumentAccess(userId, documentId, db) {
  try {
    if (!userId || !documentId) return false;
    
    const docRef = doc(db, 'documents', documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return false;
    
    const documentData = docSnap.data();
    return documentData.userId === userId;
  } catch (error) {
    console.error('Error checking document access:', error);
    return false;
  }
} 