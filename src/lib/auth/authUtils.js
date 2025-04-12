import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';

/**
 * Verify a Firebase authentication token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object|null>} Decoded token payload or null if invalid
 */
export async function verifyAuthToken(token) {
  try {
    if (!token) {
      console.warn('No token provided for verification');
      return null;
    }
    
    const admin = getFirebaseAdmin();
    
    // Verify the token
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return null;
  }
}

/**
 * Extract user ID from an authorization header
 * @param {Headers} headers - Request headers
 * @returns {Promise<string|null>} User ID or null if not authenticated
 */
export async function getUserIdFromAuthHeader(headers) {
  try {
    const authHeader = headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyAuthToken(token);
    
    if (!decodedToken) {
      return null;
    }
    
    return decodedToken.uid;
  } catch (error) {
    console.error('Error extracting user ID from auth header:', error);
    return null;
  }
}

/**
 * Verify a user has required permissions for an operation
 * @param {string} userId - User ID to check
 * @param {string} permission - Required permission
 * @returns {Promise<boolean>} Whether user has permission
 */
export async function hasPermission(userId, permission) {
  try {
    if (!userId) return false;
    
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    
    // Check user permissions in Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    const userPermissions = userData.permissions || [];
    
    // Check for admin permission (has all permissions)
    if (userPermissions.includes('admin')) {
      return true;
    }
    
    // Check for specific permission
    return userPermissions.includes(permission);
  } catch (error) {
    console.error('Error checking user permissions:', error);
    return false;
  }
} 