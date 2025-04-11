/**
 * Error handling service for document processing
 * Centralizes error handling, logging, and standardized error responses
 */

import { updateProcessingStatus } from './statusUpdate';
import { v4 as uuidv4 } from 'uuid';

/**
 * Error types for classification and consistent handling
 */
export const ErrorTypes = {
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  FILE_UPLOAD: 'FILE_UPLOAD_ERROR',
  TEXT_EXTRACTION: 'TEXT_EXTRACTION_ERROR',
  PROCESSING: 'PROCESSING_ERROR',
  FIRESTORE: 'FIRESTORE_ERROR',
  STORAGE: 'STORAGE_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  OPENAI: 'OPENAI_API_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Handles errors consistently across the application
 * 
 * @param {Error} error - The error that occurred
 * @param {Object} options - Context and handling options
 * @returns {Object} Standardized error response
 */
export function handleError(error, options = {}) {
  const {
    jobId = null,
    userId = null,
    documentId = null,
    stage = 'unknown',
    statusCode = 500,
    logDetails = true,
    updateStatus = true
  } = options;
  
  // Generate error ID for tracking
  const errorId = `err-${Date.now()}-${uuidv4().substring(0, 8)}`;
  
  // Determine error type
  const errorType = determineErrorType(error);
  
  // Log error with context
  if (logDetails) {
    console.error(`[${errorId}] ${errorType} in stage '${stage}':`, error.message);
    console.error('Error details:', error);
    
    if (options.context) {
      console.error('Error context:', options.context);
    }
  }
  
  // Update job status if applicable
  if (updateStatus && jobId) {
    updateProcessingStatus(jobId, {
      status: 'error',
      error: error.message,
      errorId,
      errorType,
      stage,
      updatedAt: new Date().toISOString()
    }).catch(statusError => {
      console.error('Failed to update error status:', statusError);
    });
  }
  
  // Build standardized error response
  const errorResponse = {
    success: false,
    error: error.message,
    errorId,
    errorType,
    stage,
    statusCode
  };
  
  // Add optional context
  if (jobId) errorResponse.jobId = jobId;
  if (documentId) errorResponse.documentId = documentId;
  if (userId) errorResponse.userId = userId;
  
  return errorResponse;
}

/**
 * Determines the type of error for consistent handling
 * 
 * @param {Error} error - The error to classify
 * @returns {String} The error type
 */
function determineErrorType(error) {
  const message = error.message?.toLowerCase() || '';
  
  // Check for known error messages and patterns
  if (message.includes('unauthorized') || message.includes('authentication') || message.includes('not authenticated')) {
    return ErrorTypes.AUTHENTICATION;
  }
  
  if (message.includes('permission') || message.includes('access denied') || message.includes('not allowed')) {
    return ErrorTypes.AUTHORIZATION;
  }
  
  if (message.includes('validation') || message.includes('invalid') || message.includes('required field')) {
    return ErrorTypes.VALIDATION;
  }
  
  if (message.includes('not found') || message.includes('does not exist')) {
    return ErrorTypes.DOCUMENT_NOT_FOUND;
  }
  
  if (message.includes('upload') || message.includes('file size') || message.includes('file type')) {
    return ErrorTypes.FILE_UPLOAD;
  }
  
  if (message.includes('extraction') || message.includes('ocr') || message.includes('text extraction')) {
    return ErrorTypes.TEXT_EXTRACTION;
  }
  
  if (message.includes('timeout') || message.includes('took too long')) {
    return ErrorTypes.TIMEOUT;
  }
  
  if (message.includes('firestore') || message.includes('document reference')) {
    return ErrorTypes.FIRESTORE;
  }
  
  if (message.includes('storage') || message.includes('bucket')) {
    return ErrorTypes.STORAGE;
  }
  
  if (message.includes('openai') || message.includes('api key') || message.includes('rate limit')) {
    return ErrorTypes.OPENAI;
  }
  
  if (message.includes('processing') || message.includes('pipeline')) {
    return ErrorTypes.PROCESSING;
  }
  
  return ErrorTypes.UNKNOWN;
}

/**
 * Creates an error handler for specific contexts
 * 
 * @param {Object} contextData - Base context data for all errors
 * @returns {Function} Context-specific error handler
 */
export function createErrorHandler(contextData = {}) {
  return (error, additionalOptions = {}) => {
    return handleError(error, {
      ...contextData,
      ...additionalOptions
    });
  };
}

/**
 * Handles OpenAI API errors with retry and rate limiting logic
 * 
 * @param {Error} error - The OpenAI API error
 * @param {Object} options - Handling options
 * @returns {Object} Standardized error response with retry information
 */
export function handleOpenAIError(error, options = {}) {
  const baseResponse = handleError(error, {
    ...options,
    errorType: ErrorTypes.OPENAI
  });
  
  // Add OpenAI-specific information
  const errorMessage = error.message?.toLowerCase() || '';
  let retryAfter = 0;
  let shouldRetry = false;
  
  // Parse rate limits and retry information
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    shouldRetry = true;
    retryAfter = 60; // Default 1 minute
    
    // Try to extract retry-after header if available
    if (error.response?.headers?.['retry-after']) {
      retryAfter = parseInt(error.response.headers['retry-after'], 10) || 60;
    }
  }
  
  // Handle other retryable errors
  if (errorMessage.includes('server error') || errorMessage.includes('timeout')) {
    shouldRetry = true;
    retryAfter = 30; // 30 seconds for server errors
  }
  
  return {
    ...baseResponse,
    openai: {
      shouldRetry,
      retryAfter
    }
  };
}

/**
 * Wraps an async function with error handling
 * 
 * @param {Function} fn - The async function to wrap
 * @param {Object} options - Error handling options
 * @returns {Function} Wrapped function with error handling
 */
export function withErrorHandling(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error, options);
    }
  };
} 