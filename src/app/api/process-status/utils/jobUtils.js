import { getFirestore, collection, doc, setDoc, serverTimestamp, getDoc, updateDoc } from "firebase/firestore";
import { getAdminFirestore } from "../../../../lib/firebase-admin";

/**
 * Save a processing job to Firestore
 * @param {string} userId - The user ID
 * @param {Object} jobData - The job data to save
 * @returns {Promise<string>} The job ID
 */
export async function saveProcessingJob(userId, jobData) {
  if (!userId || !jobData || !jobData.jobId) {
    throw new Error("User ID and job ID are required");
  }
  
  try {
    // Try Admin SDK first if available
    try {
      const adminDb = await getAdminFirestore();
      if (adminDb) {
        const jobRef = adminDb.collection("processingJobs").doc(jobData.jobId);
        await jobRef.set({
          ...jobData,
          userId,
          updatedAt: new Date(),
        });
        return jobData.jobId;
      }
    } catch (adminError) {
      console.error("Admin SDK job save failed:", adminError);
      // Fall back to client SDK
    }
    
    // Fall back to client SDK
    const db = getFirestore();
    const jobRef = doc(db, "processingJobs", jobData.jobId);
    
    await setDoc(jobRef, {
      ...jobData,
      userId,
      updatedAt: serverTimestamp(),
    });
    
    return jobData.jobId;
  } catch (error) {
    console.error("Error saving processing job:", error);
    throw error;
  }
}

/**
 * Get a processing job by ID
 * @param {string} userId - The user ID
 * @param {string} jobId - The job ID
 * @returns {Promise<Object|null>} The job data or null if not found
 */
export async function getProcessingJob(userId, jobId) {
  if (!userId || !jobId) {
    throw new Error("User ID and job ID are required");
  }
  
  try {
    // Try Admin SDK first if available
    try {
      const adminDb = await getAdminFirestore();
      if (adminDb) {
        const jobRef = adminDb.collection("processingJobs").doc(jobId);
        const jobDoc = await jobRef.get();
        
        if (jobDoc.exists && jobDoc.data().userId === userId) {
          return jobDoc.data();
        }
      }
    } catch (adminError) {
      console.error("Admin SDK job get failed:", adminError);
      // Fall back to client SDK
    }
    
    // Fall back to client SDK
    const db = getFirestore();
    const jobRef = doc(db, "processingJobs", jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (jobDoc.exists() && jobDoc.data().userId === userId) {
      return jobDoc.data();
    }
    
    return null;
  } catch (error) {
    console.error("Error getting processing job:", error);
    return null;
  }
}

/**
 * Updates the status of a processing job in Firestore
 * @param {string} userId - The user ID associated with the job
 * @param {string} jobId - The ID of the job to update
 * @param {string} status - The new status of the job
 * @param {Object} additionalData - Additional data to update in the job
 * @returns {Promise<boolean>} - True if the job was updated successfully, false otherwise
 */
export async function updateJobStatus(userId, jobId, status, additionalData = {}) {
  try {
    if (!jobId) {
      console.error("Job ID is required to update status");
      return false;
    }
    
    if (!userId) {
      console.error("User ID is required to update status");
      return false;
    }

    console.log(`Updating job ${jobId} for user ${userId} to status: ${status}`);
    
    // Update via saveProcessingJob which supports both Admin and Client SDKs
    try {
      await saveProcessingJob(userId, {
        jobId,
        userId,
        status,
        ...additionalData,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`Successfully updated job ${jobId} status to ${status}`);
      return true;
    } catch (error) {
      console.error(`Error updating job status via saveProcessingJob: ${error.message}`);
      
      // Fall back to direct method if saveProcessingJob fails
      try {
        const db = getFirestore();
        const jobRef = doc(db, "processingJobs", jobId);
        
        // Update the job status
        await updateDoc(jobRef, {
          status,
          userId,
          ...additionalData,
          updatedAt: serverTimestamp()
        });
        
        console.log(`Successfully updated job ${jobId} status to ${status} using client SDK`);
        return true;
      } catch (clientError) {
        console.error(`Error updating job with client SDK: ${clientError.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`Error updating job ${jobId} status:`, error);
    return false;
  }
} 