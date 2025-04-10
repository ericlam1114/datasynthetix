import { getFirestore, collection, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
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