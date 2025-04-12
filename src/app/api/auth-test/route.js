import { NextResponse } from 'next/server';
import { verifyAuthToken, getUserIdFromAuthHeader, hasPermission } from '@/lib/auth/authUtils';

/**
 * Handle GET requests to test authentication utilities
 * @param {Request} request - The HTTP request
 * @returns {Promise<NextResponse>} The HTTP response
 */
export async function GET(request) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    
    // Response data structure
    const response = {
      success: false,
      authenticated: false,
      userId: null,
      tokenInfo: null,
      hasAdminPermission: false,
      error: null
    };
    
    // Step 1: Check if authorization header exists
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      response.error = "No authorization header or invalid format. Expected 'Bearer TOKEN'";
      return NextResponse.json(response, { status: 401 });
    }
    
    // Step 2: Extract token and verify it
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyAuthToken(token);
    
    if (!decodedToken) {
      response.error = "Invalid or expired token";
      return NextResponse.json(response, { status: 401 });
    }
    
    response.authenticated = true;
    response.tokenInfo = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      issuer: decodedToken.iss,
      expiration: new Date(decodedToken.exp * 1000).toISOString(),
      issuedAt: new Date(decodedToken.iat * 1000).toISOString()
    };
    
    // Step 3: Extract user ID from auth header
    const userId = await getUserIdFromAuthHeader(request.headers);
    if (!userId) {
      response.error = "Could not extract user ID from token";
      return NextResponse.json(response, { status: 401 });
    }
    
    response.userId = userId;
    
    // Step 4: Check if user has admin permission (optional)
    response.hasAdminPermission = await hasPermission(userId, 'admin');
    
    // Set success flag
    response.success = true;
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in auth-test endpoint:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
} 