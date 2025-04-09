/**
 * Utility functions for checking network connectivity to Firebase services
 */

// Cache the connectivity status to avoid repeated checks
let isConnectedToFirebase = null;
let lastCheckTime = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if the app can connect to Firebase services
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
export async function checkFirebaseConnectivity() {
  const now = Date.now();
  
  // Use cached result if recent
  if (isConnectedToFirebase !== null && now - lastCheckTime < CHECK_INTERVAL) {
    return isConnectedToFirebase;
  }
  
  try {
    // Check if we can reach Firebase
    const response = await fetch('https://firebasestorage.googleapis.com/v0/b', {
      method: 'HEAD',
      mode: 'no-cors', // Use no-cors to avoid CORS issues
      cache: 'no-store',
    });
    
    // If the fetch doesn't throw, we'll assume we're connected
    isConnectedToFirebase = true;
    lastCheckTime = now;
    
    return true;
  } catch (error) {
    console.error('Firebase connectivity check failed:', error);
    isConnectedToFirebase = false;
    lastCheckTime = now;
    
    return false;
  }
}

/**
 * Convert Firebase error codes to user-friendly messages
 * @param {Error} error Firebase error object
 * @returns {string} User-friendly error message
 */
export function getFirebaseErrorMessage(error) {
  if (!error) return 'An unknown error occurred';
  
  // Extract the error code if it exists
  const errorCode = error.code || '';
  
  // Handle common Firebase error codes
  switch (errorCode) {
    // Authentication errors
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please try again.';
    
    case 'auth/too-many-requests':
      return 'Too many unsuccessful login attempts. Please try again later or reset your password.';
    
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please use a different email or sign in.';
      
    // Storage errors
    case 'storage/unauthorized':
      return 'You don\'t have permission to access this file.';
      
    case 'storage/canceled':
      return 'Upload was canceled.';
      
    case 'storage/retry-limit-exceeded':
      return 'Upload failed due to network issues. Please check your connection and try again.';
      
    case 'storage/invalid-argument':
      return 'Invalid file. Please try again with a different file.';
      
    // Firestore errors
    case 'permission-denied':
      return 'You don\'t have permission to access this data.';
      
    case 'unavailable':
      return 'The service is currently unavailable. Please try again later.';
      
    // Generic network errors
    case 'failed-precondition':
      return 'Operation failed. The app may be offline or you may have multiple tabs open.';
      
    // Special case for CORS errors
    default:
      if (error.message && error.message.includes('CORS')) {
        return 'The app is having trouble connecting to Firebase. This may be a configuration issue.';
      }
      
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Detect if the browser is in offline mode
 * @returns {boolean} True if browser is offline
 */
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export default {
  checkFirebaseConnectivity,
  getFirebaseErrorMessage,
  isOffline,
}; 