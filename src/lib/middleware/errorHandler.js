import { NextResponse } from 'next/server';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Error handling middleware for API routes
 * @param {Function} handler - The route handler function
 * @returns {Function} Error-handling middleware wrapped function
 */
export function withErrorHandling(handler) {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      console.error('API Error:', error);
      
      // Handle different error types
      if (error instanceof ApiError) {
        return formatErrorResponse(error.message, error.statusCode, error.details);
      }
      
      // Check for Firebase auth errors
      if (error.code && error.code.startsWith('auth/')) {
        return handleFirebaseAuthError(error);
      }
      
      // Check for Firebase Firestore errors
      if (error.code && error.code.startsWith('firestore/')) {
        return handleFirestoreError(error);
      }
      
      // Check for Firebase Storage errors
      if (error.code && error.code.startsWith('storage/')) {
        return handleStorageError(error);
      }
      
      // Default error response for unhandled errors
      return formatErrorResponse(
        'Internal server error', 
        500,
        process.env.NODE_ENV === 'development' ? error.message : undefined
      );
    }
  };
}

/**
 * Format an error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {any} details - Optional error details
 * @returns {NextResponse} Formatted error response
 */
function formatErrorResponse(message, statusCode, details = null) {
  const responseBody = {
    error: message,
    status: statusCode,
    timestamp: new Date().toISOString()
  };
  
  if (details) {
    responseBody.details = details;
  }
  
  return NextResponse.json(responseBody, { status: statusCode });
}

/**
 * Handle Firebase Auth errors
 * @param {Error} error - Firebase Auth error
 * @returns {NextResponse} Formatted error response
 */
function handleFirebaseAuthError(error) {
  console.error('Firebase Auth error:', error);
  
  const errorMessages = {
    'auth/id-token-expired': { message: 'Authentication token expired', status: 401 },
    'auth/id-token-revoked': { message: 'Authentication token revoked', status: 401 },
    'auth/invalid-id-token': { message: 'Invalid authentication token', status: 401 },
    'auth/user-disabled': { message: 'User account has been disabled', status: 403 },
    'auth/user-not-found': { message: 'User not found', status: 404 },
    'auth/argument-error': { message: 'Invalid authentication parameters', status: 400 },
    // Add more mappings as needed
  };
  
  const errorInfo = errorMessages[error.code] || { 
    message: 'Authentication error', 
    status: 401 
  };
  
  return formatErrorResponse(
    errorInfo.message,
    errorInfo.status,
    error.message
  );
}

/**
 * Handle Firestore errors
 * @param {Error} error - Firestore error
 * @returns {NextResponse} Formatted error response
 */
function handleFirestoreError(error) {
  console.error('Firestore error:', error);
  
  const errorMessages = {
    'firestore/cancelled': { message: 'Operation cancelled', status: 499 },
    'firestore/invalid-argument': { message: 'Invalid argument', status: 400 },
    'firestore/deadline-exceeded': { message: 'Deadline exceeded', status: 504 },
    'firestore/not-found': { message: 'Document not found', status: 404 },
    'firestore/already-exists': { message: 'Document already exists', status: 409 },
    'firestore/permission-denied': { message: 'Permission denied', status: 403 },
    'firestore/unauthenticated': { message: 'Unauthenticated', status: 401 },
    'firestore/resource-exhausted': { message: 'Resource exhausted', status: 429 },
    'firestore/failed-precondition': { message: 'Operation failed', status: 400 },
    'firestore/aborted': { message: 'Operation aborted', status: 409 },
    'firestore/out-of-range': { message: 'Out of range', status: 400 },
    'firestore/unimplemented': { message: 'Operation not implemented', status: 501 },
    'firestore/internal': { message: 'Internal error', status: 500 },
    'firestore/unavailable': { message: 'Service unavailable', status: 503 },
    'firestore/data-loss': { message: 'Data loss', status: 500 },
    // Add more mappings as needed
  };
  
  const errorInfo = errorMessages[error.code] || { 
    message: 'Database error', 
    status: 500 
  };
  
  return formatErrorResponse(
    errorInfo.message,
    errorInfo.status,
    error.message
  );
}

/**
 * Handle Firebase Storage errors
 * @param {Error} error - Storage error
 * @returns {NextResponse} Formatted error response
 */
function handleStorageError(error) {
  console.error('Storage error:', error);
  
  const errorMessages = {
    'storage/unknown': { message: 'Unknown storage error', status: 500 },
    'storage/object-not-found': { message: 'File not found', status: 404 },
    'storage/bucket-not-found': { message: 'Storage bucket not found', status: 500 },
    'storage/project-not-found': { message: 'Firebase project not found', status: 500 },
    'storage/quota-exceeded': { message: 'Storage quota exceeded', status: 429 },
    'storage/unauthenticated': { message: 'User unauthenticated', status: 401 },
    'storage/unauthorized': { message: 'User unauthorized', status: 403 },
    'storage/retry-limit-exceeded': { message: 'Retry limit exceeded', status: 429 },
    'storage/invalid-checksum': { message: 'Invalid file checksum', status: 400 },
    'storage/canceled': { message: 'Storage operation cancelled', status: 499 },
    'storage/invalid-event-name': { message: 'Invalid event name', status: 400 },
    'storage/invalid-url': { message: 'Invalid URL', status: 400 },
    'storage/invalid-argument': { message: 'Invalid argument', status: 400 },
    // Add more mappings as needed
  };
  
  const errorInfo = errorMessages[error.code] || { 
    message: 'Storage error', 
    status: 500 
  };
  
  return formatErrorResponse(
    errorInfo.message,
    errorInfo.status,
    error.message
  );
} 