import { NextResponse } from 'next/server';
import { getUserIdFromAuthHeader, hasPermission } from '@/lib/auth/authUtils';

/**
 * Authentication middleware for API routes
 * @param {Function} handler - The route handler function
 * @param {Object} options - Middleware options
 * @param {string|string[]} [options.requiredPermissions] - Required permissions for the route
 * @returns {Function} The middleware-wrapped handler
 */
export function withAuth(handler, options = {}) {
  return async (request, ...args) => {
    try {
      // Extract and validate user ID from authorization header
      const userId = await getUserIdFromAuthHeader(request.headers);
      
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized', details: 'Invalid or missing authentication token' },
          { status: 401 }
        );
      }
      
      // Check permissions if specified
      if (options.requiredPermissions) {
        const hasRequiredPermission = await hasPermission(userId, options.requiredPermissions);
        
        if (!hasRequiredPermission) {
          return NextResponse.json(
            { error: 'Forbidden', details: 'Insufficient permissions' },
            { status: 403 }
          );
        }
      }
      
      // Attach userId to the request for the handler to use
      request.userId = userId;
      
      // Call the original handler with the authenticated request
      return handler(request, ...args);
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication error', details: error.message },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware to authenticate and extract user ID from request
 * @param {Request} request - The HTTP request
 * @returns {Promise<string|null>} The authenticated user ID or null
 */
export async function authenticateRequest(request) {
  return getUserIdFromAuthHeader(request.headers);
}

/**
 * Creates a response with proper error formatting
 * @param {string} message - The error message
 * @param {number} status - The HTTP status code
 * @param {Object} [details] - Optional error details
 * @returns {NextResponse} The formatted error response
 */
export function createErrorResponse(message, status, details = null) {
  return NextResponse.json(
    { 
      error: message,
      ...(details && { details })
    },
    { status }
  );
} 