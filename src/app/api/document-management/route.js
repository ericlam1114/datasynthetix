import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuthToken, getUserIdFromAuthHeader, hasPermission } from '@/lib/auth/authUtils';
import { withAuth } from '@/lib/middleware/authMiddleware';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withErrorHandling, ApiError } from '@/lib/middleware/errorHandler';

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_PAGE_SIZE = 10;

// Initialize AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Validate required parameters for operations
function validateParams(params, requiredFields) {
  const missingFields = requiredFields.filter(field => !params[field]);
  if (missingFields.length > 0) {
    throw new ApiError(`Missing required fields: ${missingFields.join(', ')}`, 400);
  }
  return true;
}

// Log user activity for audit purposes
async function logActivity(userId, action, resourceId, details) {
  try {
    const { db } = getFirebaseAdmin();
    await db.collection('activityLogs').add({
      userId,
      action,
      resourceId,
      details,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

// Function to retry storage operations with exponential backoff
async function retryStorageOperation(operation, maxRetries = MAX_RETRY_ATTEMPTS) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;
      
      if (attempt >= maxRetries) {
        break;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(100 * Math.pow(2, attempt) + Math.random() * 100, 3000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Set CORS headers for API responses
function setCorsHeaders(response) {
  // Set allowed origins - in production you'd restrict this to your domain
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return setCorsHeaders(new NextResponse(null, { status: 204 }));
}

// Base implementation of GET handler
async function handleGetDocuments(request) {
  // Parse query parameters
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = Math.min(
    parseInt(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString()), 
    50  // Maximum page size limit to prevent abuse
  );
  const viewMode = url.searchParams.get('viewMode') || 'active'; // 'active', 'trash', 'all'

  // Extract userId from request (added by withAuth middleware)
  const userId = request.userId;

  // Get Firestore instance
  const { db } = getFirebaseAdmin();

  // Calculate pagination
  const offset = (page - 1) * pageSize;
  
  // Build query
  let query = db.collection('documents').where('userId', '==', userId);
  
  // Apply filter based on view mode
  if (viewMode === 'active') {
    query = query.where('deleted', '==', false);
  } else if (viewMode === 'trash') {
    query = query.where('deleted', '==', true);
  }

  // Get total count for pagination
  const countSnapshot = await query.count().get();
  const totalCount = countSnapshot.data().count;
  
  // Apply pagination to query
  const docsSnapshot = await query.orderBy('createdAt', 'desc')
    .limit(pageSize)
    .offset(offset)
    .get();

  // Transform documents
  const documents = [];
  docsSnapshot.forEach((doc) => {
    documents.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  // Return paginated results with metadata
  return NextResponse.json({
    documents,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      hasMore: offset + documents.length < totalCount,
    },
    memory: {
      available: process.memoryUsage().heapTotal - process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      usage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100),
    }
  });
}

// Base implementation of DELETE handler
async function handleDeleteDocument(request) {
  // Extract request body
  const body = await request.json();
  
  // Validate required parameters
  validateParams(body, ['documentId']);

  const { documentId, permanent = false, deleteDatasets = false } = body;
  const userId = request.userId;

  // Get Firebase Admin instances
  const { db, storage } = getFirebaseAdmin();
  const bucket = storage.bucket();

  // Transaction for atomic operations
  const result = await db.runTransaction(async (transaction) => {
    // Verify document exists and belongs to user
    const docRef = db.collection('documents').doc(documentId);
    const docSnap = await transaction.get(docRef);
    
    if (!docSnap.exists) {
      throw new ApiError('Document not found', 404);
    }
    
    const documentData = docSnap.data();
    if (documentData.userId !== userId) {
      throw new ApiError('Unauthorized access to document', 403);
    }

    // Check if we need to cancel any active jobs
    if (documentData.status === 'processing' || documentData.status === 'queued') {
      // Mark job for cancellation
      transaction.update(docRef, {
        status: 'cancelled',
        lastUpdated: new Date(),
      });
      
      // Log job cancellation
      await logActivity(userId, 'cancelJob', documentId, {
        jobId: documentData.jobId,
        previousStatus: documentData.status
      });
      
      return { success: true, message: 'Document job cancelled and marked for deletion' };
    }

    // For permanent deletion
    if (permanent) {
      // Delete storage files if requested
      if (documentData.storagePath) {
        try {
          await retryStorageOperation(async () => {
            // Try Firebase Storage deletion
            await bucket.file(documentData.storagePath).delete();
          });
        } catch (storageError) {
          console.error('Failed to delete from Firebase Storage:', storageError);
          // We'll continue with document deletion but log the error
          await logActivity(userId, 'storageDeleteError', documentId, {
            error: storageError.message,
            storagePath: documentData.storagePath
          });
        }
      }

      // Delete S3 datasets if requested
      if (deleteDatasets && documentData.datasets && documentData.datasets.length > 0) {
        for (const dataset of documentData.datasets) {
          if (dataset.s3Path) {
            try {
              await retryStorageOperation(async () => {
                const command = new DeleteObjectCommand({
                  Bucket: process.env.AWS_S3_BUCKET,
                  Key: dataset.s3Path
                });
                await s3Client.send(command);
              });
            } catch (s3Error) {
              console.error('Failed to delete dataset from S3:', s3Error);
              await logActivity(userId, 's3DeleteError', documentId, {
                error: s3Error.message,
                s3Path: dataset.s3Path
              });
            }
          }
        }
      }

      // Permanently delete document
      transaction.delete(docRef);
      
      // Log permanent deletion
      await logActivity(userId, 'permanentDelete', documentId, {
        documentName: documentData.name,
        deletedDatasets: deleteDatasets
      });
      
      return { success: true, message: 'Document permanently deleted' };
    } else {
      // Soft delete (move to trash)
      transaction.update(docRef, { 
        deleted: true, 
        deletedAt: new Date(),
        lastUpdated: new Date()
      });
      
      // Log soft deletion
      await logActivity(userId, 'moveToTrash', documentId, {
        documentName: documentData.name
      });
      
      return { success: true, message: 'Document moved to trash' };
    }
  });

  return NextResponse.json(result);
}

// Base implementation of PATCH handler
async function handlePatchDocument(request) {
  // Extract request body
  const body = await request.json();
  
  // Validate required parameters
  validateParams(body, ['documentId', 'action']);

  const { documentId, action } = body;
  const userId = request.userId;

  // Get Firestore instance
  const { db } = getFirebaseAdmin();

  // Verify document exists and belongs to user
  const docRef = db.collection('documents').doc(documentId);
  const docSnap = await docRef.get();
  
  if (!docSnap.exists) {
    throw new ApiError('Document not found', 404);
  }
  
  const documentData = docSnap.data();
  if (documentData.userId !== userId) {
    throw new ApiError('Unauthorized access to document', 403);
  }

  // Handle different actions
  switch (action) {
    case 'restore':
      // Only restore if document is marked as deleted
      if (!documentData.deleted) {
        throw new ApiError('Document is not in trash', 400);
      }

      // Restore document from trash
      await docRef.update({
        deleted: false,
        deletedAt: null,
        lastUpdated: new Date()
      });

      // Log activity
      await logActivity(userId, 'restoreDocument', documentId, {
        documentName: documentData.name
      });

      return NextResponse.json({
        success: true,
        message: 'Document restored successfully'
      });

    case 'cancelJob':
      // Only cancel if job is active
      if (documentData.status !== 'processing' && documentData.status !== 'queued') {
        throw new ApiError('No active job to cancel for this document', 400);
      }

      // Update job status to cancelled
      await docRef.update({
        status: 'cancelled',
        lastUpdated: new Date()
      });

      // Log activity
      await logActivity(userId, 'cancelJob', documentId, {
        jobId: documentData.jobId,
        previousStatus: documentData.status
      });

      return NextResponse.json({
        success: true,
        message: 'Job cancelled successfully'
      });

    default:
      throw new ApiError(`Unknown action: ${action}`, 400);
  }
}

// Apply middleware to the route handlers
export const GET = withErrorHandling(withRateLimit(withAuth(handleGetDocuments), {
  limit: 60,  // 60 requests per minute
  interval: 60 * 1000
}));

export const DELETE = withErrorHandling(withRateLimit(withAuth(handleDeleteDocument), {
  limit: 30,  // 30 requests per minute
  interval: 60 * 1000
}));

export const PATCH = withErrorHandling(withRateLimit(withAuth(handlePatchDocument), {
  limit: 30,  // 30 requests per minute
  interval: 60 * 1000
})); 