/**
 * Authentication service for document processing API
 * Centralizes auth logic for both client and admin Firebase SDKs
 */

import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirebaseApp } from '../../../../lib/firebase';
import { getFirebaseAdmin } from '../../../../lib/firebase-admin';

/**
 * Verifies a user's authentication from a request
 * 
 * @param {Request} request - The incoming request
 * @param {Object} options - Optional configuration
 * @returns {Object} The authenticated user data or null
 */
export async function authenticateUser(request, options = {}) {
  const { requireUser = true } = options;
  
  try {
    // Extract auth token from Authorization header
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
        throw new Error('Invalid authorization format');
      }
      return null;
    }

    // Use Firebase Admin to verify token
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Get user data from Firestore
    const userId = decodedToken.uid;
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists && requireUser) {
      throw new Error('User not found');
    }

    return {
      uid: userId,
      email: decodedToken.email,
      ...userDoc.data(),
    };
  } catch (error) {
    console.error('Authentication error:', error);
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
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    
    // Get user's subscription
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
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
      const subscriptionRef = db.collection('subscriptions').doc(userData.subscriptionId);
      const subscriptionDoc = await subscriptionRef.get();
      
      if (subscriptionDoc.exists) {
        subscription = subscriptionDoc.data();
      }
    }
    
    // Get user's credit information
    const creditsRef = db.collection('credits').doc(userId);
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
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const creditsRef = db.collection('credits').doc(userId);
    
    // Update credits atomically to prevent race conditions
    await db.runTransaction(async (transaction) => {
      const creditsDoc = await transaction.get(creditsRef);
      
      if (!creditsDoc.exists) {
        transaction.set(creditsRef, { 
          available: 0, 
          used: creditsUsed,
          limit: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }
      
      const currentData = creditsDoc.data();
      const newAvailable = Math.max(0, (currentData.available || 0) - creditsUsed);
      const newUsed = (currentData.used || 0) + creditsUsed;
      
      transaction.update(creditsRef, { 
        available: newAvailable,
        used: newUsed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error updating user credits:', error);
    throw error;
  }
} 