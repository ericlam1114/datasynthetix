/**
 * Authentication service for document processing API
 * Centralizes auth logic for both client and admin Firebase SDKs
 */

import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirebaseApp } from '../../../../lib/firebase';
import { initializeAdminApp, getAdminFirestore }  from '../../../../lib/firebase-admin';

/**
 * Verifies a user's authentication from a request or token
 * 
 * @param {Request|string} requestOrToken - The incoming request or a token string
 * @param {Object} options - Optional configuration
 * @returns {Object} The authenticated user data or null
 */
export async function authenticateUser(requestOrToken, options = {}) {
  const { requireUser = true } = options;
  
  try {
    let token;
    
    // Handle both request objects and direct token strings
    if (typeof requestOrToken === 'string') {
      // If a string is provided, assume it's the token
      token = requestOrToken;
    } else if (requestOrToken && typeof requestOrToken === 'object') {
      // Extract token from request object
      if (requestOrToken.headers && typeof requestOrToken.headers.get === 'function') {
        // Next.js Request object
        const authHeader = requestOrToken.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          if (requireUser) {
            throw new Error('Authentication required');
          }
          return null;
        }
        token = authHeader.split('Bearer ')[1];
      } else if (requestOrToken.headers && requestOrToken.headers.authorization) {
        // Express-style request
        const authHeader = requestOrToken.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          if (requireUser) {
            throw new Error('Authentication required');
          }
          return null;
        }
        token = authHeader.split('Bearer ')[1];
      } else {
        // No recognizable headers format
        if (requireUser) {
          throw new Error('Invalid request format');
        }
        return null;
      }
    } else {
      // Neither a string nor an object with headers
      if (requireUser) {
        throw new Error('Invalid authentication input');
      }
      return null;
    }

    if (!token) {
      if (requireUser) {
        throw new Error('Invalid authorization format');
      }
      return null;
    }

    // Use Firebase Admin to verify token
    const adminApp = await initializeAdminApp();
    if (!adminApp) {
      console.warn('Firebase Admin SDK is disabled or unavailable');
      
      // For development, provide a fallback user
      if (process.env.NODE_ENV === 'development') {
        return {
          authenticated: true,
          uid: 'dev-user-id',
          email: 'dev@example.com',
          developmentMode: true
        };
      }
      
      if (requireUser) {
        throw new Error('Firebase Admin SDK is disabled');
      }
      return null;
    }
    
    try {
      // Import Auth from firebase-admin/auth
      const { getAuth } = require('firebase-admin/auth');
      const adminAuth = getAuth(adminApp);
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      // We have a valid token, so we know the user is authenticated
      const userId = decodedToken.uid;
      
      // Try to get additional user data, but with specific error handling for OpenSSL
      try {
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          try {
            const userDoc = await adminDb.collection('users').doc(userId).get();
            // If we get here, Firestore is working
            
            return {
              uid: userId,
              email: decodedToken.email,
              ...(userDoc.exists ? userDoc.data() : {})
            };
          } catch (firestoreError) {
            // Check specifically for OpenSSL errors
            if (firestoreError.message?.includes('DECODER routines::unsupported') ||
                firestoreError.message?.includes('ERR_OSSL_UNSUPPORTED') ||
                firestoreError.toString().includes('DECODER routines::unsupported')) {
              console.warn('OpenSSL error detected when accessing Firestore. Using fallback authentication.');
              
              // Return basic user info since we know the token is valid
              return {
                uid: userId,
                email: decodedToken.email,
                tokenVerified: true,
                sslError: true
              };
            }
            // For other Firestore errors, just return the basic user info
            console.error('Firestore error:', firestoreError);
            return {
              uid: userId,
              email: decodedToken.email,
              tokenVerified: true,
              firestoreError: true
            };
          }
        } else {
          // AdminDb not available, but token is valid
          return {
            uid: userId,
            email: decodedToken.email,
            tokenVerified: true,
            noAdminDb: true
          };
        }
      } catch (dbError) {
        // AdminDb error, but token is valid
        console.error('Admin Firestore error:', dbError);
        return {
          uid: userId,
          email: decodedToken.email,
          tokenVerified: true,
          dbInitError: true
        };
      }
    } catch (tokenError) {
      // Token verification failed
      console.error('Token verification error:', tokenError);
      
      // In development mode, provide a fallback user
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: Using mock authentication after token verification failed');
        return {
          uid: 'dev-user-id',
          email: 'dev@example.com',
          developmentMode: true,
          fallback: true
        };
      }
      
      if (requireUser) {
        throw new Error(`Authentication failed: ${tokenError.message}`);
      }
      return null;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    
    // In development mode, provide a fallback user for any error
    if (process.env.NODE_ENV === 'development' && !requireUser) {
      console.warn('Development mode: Using mock authentication after error');
      return {
        uid: 'dev-user-id',
        email: 'dev@example.com',
        developmentMode: true,
        error: true
      };
    }
    
    if (requireUser) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
    return null;
  }
}

/**
 * Gets a user's subscription and credits information
 * 
 * @param {string} userId - The user's ID
 * @returns {Object} Subscription and credits information
 */
export async function getUserSubscription(userId) {
  try {
    // Use the available function getAdminFirestore() instead of getFirebaseAdmin()
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      throw new Error('Firestore admin is not available');
    }
    
    // Get user's subscription
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    // Rest of your function remains the same...
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    
    // Get subscription details
    let subscription = null;
    let credits = {
      available: 0,
      used: 0,
      limit: 0
    };
    
    // Check if user has subscription reference
    if (userData.subscriptionId) {
      const subscriptionRef = adminDb.collection('subscriptions').doc(userData.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();
      
      if (subscriptionDoc.exists) {
        subscription = subscriptionDoc.data();
      }
    }
    
    // Get user's credit information
    const creditsRef = adminDb.collection('credits').doc(userId);
    const creditsDoc = await creditsRef.get();
    
    if (creditsDoc.exists) {
      const creditsData = creditsDoc.data();
      credits = {
        available: creditsData.available || 0,
        used: creditsData.used || 0,
        limit: creditsData.limit || 0
      };
    }
    
    return {
      subscription,
      credits,
      isActive: subscription?.status === 'active' || credits.available > 0
    };
  } catch (error) {
    console.error('Error getting user subscription:', error);
    throw error;
  }
}

/**
 * Updates a user's credit usage
 * 
 * @param {string} userId - The user's ID
 * @param {number} creditsUsed - The number of credits used
 */
export async function updateUserCredits(userId, creditsUsed) {
  try {
    // Use the available function getAdminFirestore() instead of getFirebaseAdmin()
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      throw new Error('Firestore admin is not available');
    }
    
    // Get current credits
    const creditsRef = adminDb.collection('credits').doc(userId);
    const creditsDoc = await creditsRef.get();
    
    let currentCredits = 0;
    
    if (creditsDoc.exists) {
      const creditsData = creditsDoc.data();
      currentCredits = creditsData.available || 0;
    }
    
    // Calculate new credits
    const newCredits = Math.max(0, currentCredits - creditsUsed);
    
    // Update credits
    await creditsRef.set({
      available: newCredits,
      used: (creditsDoc.exists ? creditsDoc.data().used || 0 : 0) + creditsUsed,
      lastUpdated: new Date()
    }, { merge: true });
    
    return {
      previousCredits: currentCredits,
      creditsUsed,
      remainingCredits: newCredits
    };
  } catch (error) {
    console.error('Error updating user credits:', error);
    throw error;
  }
}