/**
 * Status update service for document processing jobs
 * Centralizes status updates, progress tracking, and error handling
 */

import { getFirebaseAdmin } from '../../../../lib/firebase-admin';
import { doc, serverTimestamp, updateDoc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a new processing status record
 * 
 * @param {String} jobId - The processing job ID
 * @param {Object} initialStatus - Initial status information
 * @returns {Object} The created status object
 */
export async function createProcessingStatus(jobId, initialStatus = {}) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    
    // Merge defaults with provided status
    const statusData = {
      jobId,
      status: 'created',
      progress: 0,
      processedChunks: 0,
      totalChunks: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      lastProgressChange: new Date().toISOString(),
      ...initialStatus
    };
    
    // Create record in database
    const statusRef = db.collection('processingJobs').doc(jobId);
    await statusRef.set(statusData);
    
    // Also write to status API if available
    await postToStatusAPI(jobId, statusData);
    
    return statusData;
  } catch (error) {
    console.error('Error creating processing status:', error);
    // Don't throw - status tracking is not critical
    return {
      jobId,
      status: 'created',
      error: error.message
    };
  }
}

/**
 * Updates an existing processing status
 * 
 * @param {String} jobId - The processing job ID
 * @param {Object} statusUpdate - Status changes to apply
 * @returns {Object} The updated status object
 */
export async function updateProcessingStatus(jobId, statusUpdate = {}) {
  try {
    if (!jobId) {
      console.warn('Attempted to update status without a jobId');
      return null;
    }
    
    // Calculate progress percentage if not provided
    if (statusUpdate.progress === undefined && 
        statusUpdate.processedChunks !== undefined && 
        statusUpdate.totalChunks !== undefined) {
      statusUpdate.progress = Math.round((statusUpdate.processedChunks / statusUpdate.totalChunks) * 100);
    }
    
    // Current timestamp for updates
    const now = new Date();
    const formattedNow = now.toISOString();
    
    // Post to the process-status API endpoint
    await postToStatusAPI(jobId, {
      ...statusUpdate,
      updatedAt: formattedNow
    });
    
    // Get existing status from Firestore if available
    try {
      const admin = getFirebaseAdmin();
      const db = admin.firestore();
      
      const statusRef = db.collection('processingJobs').doc(jobId);
      const existingDoc = await statusRef.get();
      
      if (!existingDoc.exists) {
        console.log(`Creating new status document for job ${jobId}`);
        await statusRef.set({
          ...statusUpdate,
          jobId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        console.log(`Updating status for job ${jobId}`);
        
        // Check if progress has changed to update lastProgressChange
        const existingData = existingDoc.data();
        const progressChanged = existingData.progress !== statusUpdate.progress;
        
        await statusRef.update({
          ...statusUpdate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(progressChanged ? { lastProgressChange: formattedNow } : {})
        });
      }
      
      return {
        jobId,
        ...statusUpdate,
        updatedAt: formattedNow
      };
    } catch (firestoreError) {
      console.error(`Error updating job status ${jobId} in Firestore:`, firestoreError);
      // Don't throw - Firestore updates are non-critical if status API works
    }
    
    return {
      jobId,
      ...statusUpdate,
      updatedAt: formattedNow
    };
  } catch (error) {
    console.error(`Error updating job status ${jobId}:`, error);
    // Don't throw - status tracking is not critical
    return null;
  }
}

/**
 * Posts status updates to the status API
 * 
 * @param {String} jobId - The job ID
 * @param {Object} statusData - The status data to post
 * @returns {Object} The response from the API
 */
async function postToStatusAPI(jobId, statusData) {
  try {
    // Construct the API endpoint URL
    const endpoint = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/process-status` 
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/process-status`;
    
    // Add jobId to statusData
    const payload = {
      ...statusData,
      jobId
    };
    
    // Post to API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      console.error(`Error posting to status API: ${response.status} ${response.statusText}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error posting to status API: ${error.message}`);
    return null;
  }
}

/**
 * Handles processing errors with consistent formatting and logging
 * 
 * @param {Error} error - The error that occurred
 * @param {Object} contextData - Additional context about the error
 * @returns {Object} Error information for the client
 */
export function handleProcessingError(error, contextData = {}) {
  const { jobId, userId, documentId, stage = 'processing' } = contextData;
  
  // Generate error ID for tracking
  const errorId = `err-${Date.now()}-${uuidv4().substring(0, 8)}`;
  
  // Log detailed error information
  console.error(`Processing error [${errorId}]:`, error);
  console.error('Error context:', contextData);
  
  // Update status if we have a jobId
  if (jobId) {
    updateProcessingStatus(jobId, {
      status: 'error',
      error: error.message,
      errorId,
      stage,
      updatedAt: new Date().toISOString()
    }).catch(statusError => {
      console.error('Failed to update error status:', statusError);
    });
  }
  
  // Return standardized error response
  return {
    success: false,
    error: error.message,
    errorId,
    stage,
    ...(jobId ? { jobId } : {}),
    ...(documentId ? { documentId } : {})
  };
}

/**
 * Finalizes a processing job as complete
 * 
 * @param {String} jobId - The job ID
 * @param {Object} resultData - The processing results
 * @returns {Object} The final status update
 */
export async function completeProcessingJob(jobId, resultData = {}) {
  try {
    const statusUpdate = {
      status: 'complete',
      progress: 100,
      processedChunks: resultData.stats?.processedChunks || resultData.totalChunks || 0,
      totalChunks: resultData.stats?.totalChunks || resultData.totalChunks || 0,
      result: resultData,
      completedAt: new Date().toISOString()
    };
    
    return await updateProcessingStatus(jobId, statusUpdate);
  } catch (error) {
    console.error(`Error completing job ${jobId}:`, error);
    return null;
  }
}

/**
 * Retrieves the current status of a processing job
 * 
 * @param {String} jobId - The job ID
 * @returns {Object} The current status
 */
export async function getProcessingStatus(jobId) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    
    const statusRef = db.collection('processingJobs').doc(jobId);
    const statusDoc = await statusRef.get();
    
    if (!statusDoc.exists) {
      return null;
    }
    
    return {
      jobId,
      ...statusDoc.data()
    };
  } catch (error) {
    console.error(`Error getting processing status for job ${jobId}:`, error);
    return null;
  }
} 