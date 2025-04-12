import { auth, db } from '@/lib/firebase/firebaseAdmin';

/**
 * Verifies a Firebase authentication token
 * 
 * @param {string} token - The Firebase ID token to verify
 * @returns {Promise<Object|null>} The decoded token if valid, null otherwise
 */
export async function verifyAuthToken(token) {
  if (!token) {
    return null;
  }
  
  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return null;
  }
}

/**
 * Extracts the user ID from an authorization header
 * 
 * @param {Headers} headers - The request headers object
 * @returns {Promise<string|null>} The user ID if authenticated, null otherwise
 */
export async function getUserIdFromAuthHeader(headers) {
  // Extract the Bearer token from the Authorization header
  const authHeader = headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await verifyAuthToken(token);
  
  return decodedToken ? decodedToken.uid : null;
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

/**
 * Checks if a user has the required permissions for an operation
 * 
 * @param {string} userId - The user ID to check
 * @param {string|string[]} requiredPermissions - The permissions to check for
 * @returns {Promise<boolean>} True if the user has the required permissions
 */
export async function hasPermission(userId, requiredPermissions) {
  if (!userId) {
    return false;
  }
  
  try {
    // Get user data from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    
    // Check if user is an admin (admins have all permissions)
    if (userData.isAdmin === true) {
      return true;
    }
    
    // Get user permissions
    const userPermissions = userData.permissions || [];
    
    // Convert required permissions to array if it's a string
    const permissions = Array.isArray(requiredPermissions) 
      ? requiredPermissions 
      : [requiredPermissions];
    
    // Check if user has all required permissions
    return permissions.every(permission => userPermissions.includes(permission));
  } catch (error) {
    console.error('Error checking user permissions:', error);
    return false;
  }
} 