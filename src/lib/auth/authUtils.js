import { getFirebaseAdmin } from '../firebase/firebaseAdmin';

/**
 * Verifies a Firebase authentication token
 * @param {string} token - The JWT token to verify
 * @returns {Promise<object|null>} The decoded token payload or null if invalid
 */
export async function verifyAuthToken(token) {
  if (!token) {
    console.warn('No token provided for verification');
    return null;
  }

  try {
    // Get the Firebase Admin services
    const { auth } = getFirebaseAdmin();
    
    // Verify the token using the auth service
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

/**
 * Extracts user ID from authorization header
 * @param {Headers} headers - Request headers
 * @returns {Promise<string|null>} User ID or null if not authenticated
 */
export async function getUserIdFromAuthHeader(headers) {
  const authHeader = headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Invalid or missing authorization header');
    return null;
  }

  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await verifyAuthToken(token);
  
  if (!decodedToken) {
    return null;
  }

  return decodedToken.uid;
}

/**
 * Checks if a user has the required permissions
 * @param {string} userId - The user's ID
 * @param {string|string[]} requiredPermissions - The required permission(s)
 * @returns {Promise<boolean>} Whether the user has the required permissions
 */
export async function hasPermission(userId, requiredPermissions) {
    if (!userId) {
      return false;
    }
  
    // For development, allow bypassing if the flag is enabled
    if (process.env.BYPASS_DOCUMENT_PERMISSIONS === 'true') {
      console.log(`[Auth Utils] Bypassing permission check for ${userId} (development)`);
      return true;
    }
  
    try {
      // Get the Firebase Admin services
      const { db } = getFirebaseAdmin();
      
      // Get user document with permissions
      const userDocRef = db.collection('users').doc(userId);
      const userDoc = await userDocRef.get();
      
      if (!userDoc.exists) {
        console.warn(`User ${userId} not found in Firestore`);
        return false;
      }
      
      const userData = userDoc.data();
      
      // Check if user is admin (admins have all permissions)
      if (userData.isAdmin === true) {
        return true;
      }
      
      // If no permissions specified in user data, deny access
      if (!userData.permissions || !Array.isArray(userData.permissions)) {
        return false;
      }
      
      // Handle single permission or array of permissions
      const permissionsToCheck = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];
      
      // Check if user has ANY of the required permissions
      const hasRequiredPermission = permissionsToCheck.some(permission => 
        userData.permissions.includes(permission)
      );
      
      return hasRequiredPermission;
    } catch (error) {
      console.error('Error checking user permissions:', error);
      
      // For development only
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_DOCUMENT_PERMISSIONS === 'true') {
        console.warn('[Auth Utils] Development bypass activated for error');
        return true;
      }
      
      return false;
    }
  }

/**
 * Retries an operation with exponential backoff
 * 
 * @param {Function} operation - The operation to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in ms between retries
 * @returns {Promise<any>} Result of the operation
 */
export async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 300) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Attempt the operation
      return await operation();
    } catch (error) {
      // Store the error
      lastError = error;
      
      // Calculate backoff delay: 300ms, 900ms, 2700ms, etc.
      const delay = baseDelay * Math.pow(3, attempt);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If we've exhausted retries, throw the last error
  throw lastError;
} 