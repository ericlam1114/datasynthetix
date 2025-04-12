import { NextResponse } from 'next/server';
import { verifyAuthToken, getUserIdFromAuthHeader, hasPermission } from '@/lib/auth/authUtils';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { withAuth } from '@/lib/middleware/authMiddleware';
import { withErrorHandling, ApiError } from '@/lib/middleware/errorHandler';
import { withRateLimit } from '@/lib/middleware/rateLimit';

/**
 * Test API endpoint to verify authentication utilities
 * @param {Request} request - The HTTP request
 * @returns {Promise<Response>} The HTTP response
 */
async function handleAuthTest(request) {
  // Extract userId that was already verified and added by withAuth middleware
  const userId = request.userId;
  
  // Get the Firebase Admin services
  const { db, auth } = getFirebaseAdmin();
  
  try {
    // Get additional user information from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    
    // Check if the user is an admin via Firestore permissions
    const isAdmin = await hasPermission(userId, 'admin');
    
    // Get detailed user info from Auth
    const userRecord = await auth.getUser(userId);
    
    return NextResponse.json({
      success: true,
      message: 'Authentication test successful',
      user: {
        uid: userId,
        exists: userDoc.exists,
        isAdmin,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        // Include select Firestore user data if available
        firestore: userDoc.exists ? {
          role: userDoc.data().role,
          createdAt: userDoc.data().createdAt?.toDate()?.toISOString(),
          permissions: userDoc.data().permissions || [],
        } : null,
      },
      timestamp: new Date().toISOString(),
      serverInfo: {
        environment: process.env.NODE_ENV,
        firebaseConfigured: !!process.env.FIREBASE_ADMIN_PROJECT_ID
      }
    });
  } catch (error) {
    throw new ApiError(
      'Error retrieving user information',
      500,
      process.env.NODE_ENV === 'development' ? error.message : undefined
    );
  }
}

/**
 * Endpoint for testing public access without authentication
 * @returns {Promise<Response>} The HTTP response
 */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required',
        message: 'No Bearer token provided in Authorization header'
      }, { status: 401 });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyAuthToken(token);
    
    if (!decodedToken) {
      return NextResponse.json({
        success: false,
        error: 'Invalid token',
        message: 'The provided authentication token is invalid or expired'
      }, { status: 401 });
    }
    
    const userId = decodedToken.uid;
    
    // Check for admin permissions (optional)
    const isAdmin = await hasPermission(userId, 'admin');
    
    return NextResponse.json({
      success: true,
      message: 'Authentication successful',
      user: {
        uid: userId,
        isAdmin
      },
      token: {
        exp: decodedToken.exp,
        iat: decodedToken.iat,
        auth_time: decodedToken.auth_time
      }
    });
  } catch (error) {
    console.error('Auth test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Authentication error',
      message: error.message
    }, { status: 500 });
  }
}

// Protected endpoint that checks authentication using middleware
export const POST = withErrorHandling(withRateLimit(withAuth(handleAuthTest), {
  limit: 20,
  interval: 60 * 1000
})); 