// Make sure you have these imports at the top of your file
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Creates a new processing status document in Firestore
 * 
 * @param {string} jobId - The processing job ID
 * @param {object} initialStatus - Initial status data
 * @returns {object} Operation result
 */
export async function createProcessingStatus(jobId, initialStatus = {}) {
  try {
    // For now, always use client SDK due to OpenSSL issues
    const db = getFirestore();
    const statusRef = doc(db, 'processingJobs', jobId);
    
    await setDoc(statusRef, {
      jobId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'created',
      progress: 0,
      ...initialStatus
    });
    
    return { success: true, jobId };
  } catch (error) {
    console.error('Error creating processing status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates an existing processing status document
 * 
 * @param {string} jobId - The processing job ID
 * @param {object} statusData - Status data to update
 * @returns {object} Operation result
 */
export async function updateProcessingStatus(jobId, statusData) {
  console.log(`Updating status for job ${jobId}:`, statusData);
  
  if (!jobId) {
    console.error('Job ID is required for status updates');
    return { success: false, error: 'Job ID is required' };
  }
  
  // Get existing status from Firestore if available
  try {
    // For now, always use client SDK due to OpenSSL issues
    const db = getFirestore();
    const statusRef = doc(db, 'processingJobs', jobId);
    
    let existingDoc;
    try {
      existingDoc = await getDoc(statusRef);
    } catch (error) {
      console.error(`Error getting existing status for job ${jobId}:`, error);
      existingDoc = { exists: () => false };
    }
    
    // Clean up statusData to remove any undefined values which cause Firestore errors
    const cleanStatusData = {};
    Object.entries(statusData).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanStatusData[key] = value;
      }
    });
    
    // If processingStats contains undefined values, clean them up
    if (cleanStatusData.processingStats) {
      const cleanStats = {};
      Object.entries(cleanStatusData.processingStats).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanStats[key] = value;
        }
      });
      cleanStatusData.processingStats = cleanStats;
    }
    
    // Existing document check
    if (!existingDoc.exists()) {
      console.log(`Creating new status document for job ${jobId}`);
      
      // If existing doc doesn't exist, create a new status doc
      const newStatus = {
        jobId,
        status: 'processing',
        progress: 0,
        stage: 'initialization',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...cleanStatusData
      };
      
      await setDoc(statusRef, newStatus);
      return { success: true };
    }
    
    // Update existing status
    const currentData = existingDoc.data();
    
    // Merge with current data
    const updatedStatus = {
      ...currentData,
      ...cleanStatusData,
      updatedAt: serverTimestamp()
    };
    
    // Update the document
    await updateDoc(statusRef, updatedStatus);
    
    return { success: true };
  } catch (error) {
    console.error(`Error updating job status ${jobId} in Firestore:`, error);
    // Try to proceed without failing the entire process
    return { success: false, error: error.message };
  }
}

/**
 * Marks a processing job as complete
 * 
 * @param {string} jobId - The processing job ID
 * @param {object} results - Processing results
 * @returns {object} Operation result
 */
export async function completeProcessingJob(jobId, results) {
  try {
    // For now, always use client SDK due to OpenSSL issues
    const db = getFirestore();
    const statusRef = doc(db, 'processingJobs', jobId);
    
    // Clean the results.stats object to remove any undefined values
    const cleanStats = {};
    if (results && results.stats) {
      Object.entries(results.stats).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanStats[key] = value;
        }
      });
    }
    
    await updateDoc(statusRef, {
      status: 'completed',
      progress: 100,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      stats: cleanStats
    });
    
    return { success: true };
  } catch (error) {
    console.error(`Error completing processing job ${jobId}:`, error);
    // Non-critical error, continue
    return { success: false, error: error.message };
  }
}

/**
 * Handles processing errors by updating the job status
 * 
 * @param {string} jobId - The processing job ID
 * @param {Error} error - The error that occurred
 * @param {string} stage - The processing stage where the error occurred
 * @returns {object} Operation result
 */
export async function handleProcessingError(jobId, error, stage = 'unknown') {
  try {
    if (!jobId) {
      console.error('No job ID provided for error handling');
      return { success: false };
    }
    
    console.error(`Processing error in ${stage} stage for job ${jobId}:`, error);
    
    // For now, always use client SDK due to OpenSSL issues
    const db = getFirestore();
    const statusRef = doc(db, 'processingJobs', jobId);
    
    await updateDoc(statusRef, {
      status: 'error',
      errorStage: stage,
      errorMessage: error.message || 'Unknown error',
      errorStack: error.stack,
      updatedAt: serverTimestamp()
    });
    
    return { success: true };
  } catch (updateError) {
    console.error(`Failed to update error status for job ${jobId}:`, updateError);
    return { success: false, error: updateError.message };
  }
}