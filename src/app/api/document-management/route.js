import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { retryWithBackoff, verifyAuthToken, getUserIdFromAuthHeader } from '@/lib/auth/authUtils';
import { rateLimit } from '@/lib/middleware/rateLimit';

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_PAGE_SIZE = 10;
const MAX_REQUESTS_PER_MINUTE = 60; // Rate limit: 60 requests per minute

// Initialize Firebase admin
const firebaseAdmin = getFirebaseAdmin();
const db = firebaseAdmin.firestore();
const bucket = firebaseAdmin.storage().bucket();

// Initialize AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Initialize rate limiter
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 users per interval
  limit: MAX_REQUESTS_PER_MINUTE,
});

// Validate required parameters for operations
function validateParams(params, requiredFields) {
  const missingFields = requiredFields.filter(field => !params[field]);
  if (missingFields.length > 0) {
    return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
  }
  return { valid: true };
}

// Log user activity for audit purposes
async function logActivity(userId, action, resourceId, details) {
  try {
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
  return retryWithBackoff(operation, maxRetries);
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

// GET method to retrieve documents with pagination
export async function GET(request) {
  try {
    // Apply rate limiting
    try {
      await limiter.check(request, MAX_REQUESTS_PER_MINUTE);
    } catch (error) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Too many requests', details: 'Rate limit exceeded' },
        { status: 429 }
      ));
    }

    // Extract and validate authentication
    const userId = await getUserIdFromAuthHeader(request.headers);
    if (!userId) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid or missing authentication token' },
        { status: 401 }
      ));
    }

    // Parse query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = Math.min(
      parseInt(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString()), 
      50  // Maximum page size limit to prevent abuse
    );
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
    const viewMode = url.searchParams.get('viewMode') || 'active'; // 'active', 'trash', 'all'

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
    return setCorsHeaders(NextResponse.json({
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
    }));
  } catch (error) {
    console.error('Error fetching documents:', error);
    return setCorsHeaders(NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    ));
  }
}

// DELETE method to delete a document
export async function DELETE(request) {
  try {
    // Apply rate limiting
    try {
      await limiter.check(request, MAX_REQUESTS_PER_MINUTE);
    } catch (error) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Too many requests', details: 'Rate limit exceeded' },
        { status: 429 }
      ));
    }

    // Extract request body
    const body = await request.json();
    
    // Validate required parameters
    const validation = validateParams(body, ['documentId']);
    if (!validation.valid) {
      return setCorsHeaders(NextResponse.json({ error: validation.message }, { status: 400 }));
    }

    const { documentId, permanent = false, deleteDatasets = false } = body;

    // Extract and validate authentication
    const userId = await getUserIdFromAuthHeader(request.headers);
    if (!userId) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid or missing authentication token' },
        { status: 401 }
      ));
    }

    // Transaction for atomic operations
    const result = await db.runTransaction(async (transaction) => {
      // Verify document exists and belongs to user
      const docRef = db.collection('documents').doc(documentId);
      const docSnap = await transaction.get(docRef);
      
      if (!docSnap.exists) {
        throw new Error('Document not found');
      }
      
      const documentData = docSnap.data();
      if (documentData.userId !== userId) {
        throw new Error('Unauthorized access to document');
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
        // Cost control: Track deletion limits
        const quotaRef = db.collection('userQuotas').doc(userId);
        const quotaSnap = await transaction.get(quotaRef);
        const quota = quotaSnap.exists ? quotaSnap.data() : { deletionsToday: 0, lastReset: new Date() };
        
        // Reset counter if it's a new day
        const now = new Date();
        const lastReset = quota.lastReset.toDate ? quota.lastReset.toDate() : new Date(quota.lastReset);
        const isNewDay = now.getDate() !== lastReset.getDate() || 
                        now.getMonth() !== lastReset.getMonth() || 
                        now.getFullYear() !== lastReset.getFullYear();
        
        if (isNewDay) {
          quota.deletionsToday = 0;
          quota.lastReset = now;
        }
        
        // Check if user exceeds daily deletion limit (50 per day)
        const DAILY_DELETION_LIMIT = 50;
        if (quota.deletionsToday >= DAILY_DELETION_LIMIT) {
          throw new Error(`Daily deletion limit of ${DAILY_DELETION_LIMIT} exceeded`);
        }

        // Update deletion counter
        transaction.set(quotaRef, {
          ...quota,
          deletionsToday: quota.deletionsToday + 1,
          lastUpdated: now
        });

        // Get storage paths to delete
        const filePaths = [];
        if (documentData.filePath) {
          filePaths.push(documentData.filePath);
        }

        // Get dataset references if needed
        let datasetRefs = [];
        if (deleteDatasets && documentData.datasets) {
          const datasetIds = Array.isArray(documentData.datasets) ? documentData.datasets : [];
          datasetRefs = datasetIds.map(id => db.collection('datasets').doc(id));
          
          // Get dataset snapshots
          const datasetSnapshots = await Promise.all(datasetRefs.map(ref => transaction.get(ref)));
          
          // Collect file paths for deletion
          datasetSnapshots.forEach(snapshot => {
            if (snapshot.exists) {
              const data = snapshot.data();
              if (data.filePath) filePaths.push(data.filePath);
            }
          });
        }

        // Delete document record
        transaction.delete(docRef);
        
        // Delete associated datasets if requested
        if (deleteDatasets && datasetRefs.length > 0) {
          datasetRefs.forEach(ref => {
            transaction.delete(ref);
          });
        }
        
        // Log permanent deletion
        await logActivity(userId, 'permanentDelete', documentId, {
          deletedDatasets: deleteDatasets ? datasetRefs.length : 0,
          filePaths
        });

        // Schedule storage deletions (outside transaction)
        return { 
          success: true, 
          message: 'Document permanently deleted',
          filePaths,
          deleteStorage: true
        };
      } 
      // For soft deletion (move to trash)
      else {
        transaction.update(docRef, {
          deleted: true,
          deletedAt: new Date()
        });
        
        // Log soft deletion
        await logActivity(userId, 'moveToTrash', documentId, {
          originalStatus: documentData.status
        });
        
        return { success: true, message: 'Document moved to trash' };
      }
    });

    // Handle storage deletions outside the transaction
    if (result.deleteStorage && result.filePaths && result.filePaths.length > 0) {
      // Delete storage files in background
      Promise.all(result.filePaths.map(path => 
        retryStorageOperation(() => bucket.file(path).delete())
      ))
      .catch(error => {
        console.error('Error deleting storage files:', error);
        // Log failed deletion for later cleanup
        db.collection('failedDeletions').add({
          userId,
          documentId,
          filePaths: result.filePaths,
          error: error.message,
          timestamp: new Date(),
          retryCount: 0
        });
      });
    }

    return setCorsHeaders(NextResponse.json(result));
  } catch (error) {
    console.error('Error deleting document:', error);
    return setCorsHeaders(NextResponse.json(
      { error: 'Failed to delete document', details: error.message },
      { status: error.message.includes('Unauthorized') ? 403 : 500 }
    ));
  }
}

// PATCH method to handle document actions like restore or cancel jobs
export async function PATCH(request) {
  try {
    // Apply rate limiting
    try {
      await limiter.check(request, MAX_REQUESTS_PER_MINUTE);
    } catch (error) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Too many requests', details: 'Rate limit exceeded' },
        { status: 429 }
      ));
    }

    // Extract request body
    const body = await request.json();
    
    // Validate required parameters
    const validation = validateParams(body, ['documentId', 'action']);
    if (!validation.valid) {
      return setCorsHeaders(NextResponse.json({ error: validation.message }, { status: 400 }));
    }

    const { documentId, action } = body;

    // Extract and validate authentication
    const userId = await getUserIdFromAuthHeader(request.headers);
    if (!userId) {
      return setCorsHeaders(NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid or missing authentication token' },
        { status: 401 }
      ));
    }

    // Handle different actions
    switch (action) {
      case 'restore': {
        // Restore document from trash
        const docRef = db.collection('documents').doc(documentId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
          return setCorsHeaders(NextResponse.json(
            { error: 'Document not found' },
            { status: 404 }
          ));
        }
        
        const documentData = docSnap.data();
        if (documentData.userId !== userId) {
          return setCorsHeaders(NextResponse.json(
            { error: 'Unauthorized access to document' },
            { status: 403 }
          ));
        }
        
        if (!documentData.deleted) {
          return setCorsHeaders(NextResponse.json(
            { error: 'Document is not in trash' },
            { status: 400 }
          ));
        }
        
        await docRef.update({
          deleted: false,
          deletedAt: null
        });
        
        // Log restoration
        await logActivity(userId, 'restoreFromTrash', documentId, {});
        
        return setCorsHeaders(NextResponse.json({
          success: true,
          message: 'Document restored from trash'
        }));
      }
      
      case 'cancelJob': {
        // Cancel active processing job
        const docRef = db.collection('documents').doc(documentId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
          return setCorsHeaders(NextResponse.json(
            { error: 'Document not found' },
            { status: 404 }
          ));
        }
        
        const documentData = docSnap.data();
        if (documentData.userId !== userId) {
          return setCorsHeaders(NextResponse.json(
            { error: 'Unauthorized access to document' },
            { status: 403 }
          ));
        }
        
        if (documentData.status !== 'processing' && documentData.status !== 'queued') {
          return setCorsHeaders(NextResponse.json(
            { error: 'Document job is not active and cannot be cancelled' },
            { status: 400 }
          ));
        }
        
        await docRef.update({
          status: 'cancelled',
          lastUpdated: new Date()
        });
        
        // Log job cancellation
        await logActivity(userId, 'cancelJob', documentId, {
          jobId: documentData.jobId,
          previousStatus: documentData.status
        });
        
        return setCorsHeaders(NextResponse.json({
          success: true,
          message: 'Document processing job cancelled'
        }));
      }
      
      default:
        return setCorsHeaders(NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        ));
    }
  } catch (error) {
    console.error('Error handling document action:', error);
    return setCorsHeaders(NextResponse.json(
      { error: 'Failed to process document action', details: error.message },
      { status: 500 }
    ));
  }
} 