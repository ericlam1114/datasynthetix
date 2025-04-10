// src/lib/firestoreService.js
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  getFirestore,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "./firebase";

// Document related functions

// Get all documents for a user
export async function getUserDocuments(userId) {
  try {
    const q = query(
      collection(firestore, "documents"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error getting user documents:", error);
    throw error;
  }
}

// Error-resilient version that returns empty array instead of throwing
export async function getUserDocumentsSafe(userId) {
  try {
    return await getUserDocuments(userId);
  } catch (error) {
    console.warn("Error getting user documents (safe mode):", error);
    return [];
  }
}

// Get a single document by ID
export async function getDocument(documentId) {
  try {
    const docRef = doc(firestore, "documents", documentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting document:", error);
    throw error;
  }
}

// Error-resilient version that returns null instead of throwing
export async function getDocumentSafe(documentId) {
  try {
    return await getDocument(documentId);
  } catch (error) {
    console.warn("Error getting document (safe mode):", error);
    return null;
  }
}

// Add a new document
export async function addDocument(documentData, file) {
  try {
    // First upload the file if it exists
    let fileUrl = null;

    if (file) {
      // Pass userId to uploadFile
      fileUrl = await uploadFile(file, "documents", documentData.userId);
    }

    // Create the document in Firestore
    const docRef = await addDoc(collection(firestore, "documents"), {
      ...documentData,
      fileUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error("Error adding document:", error);
    throw error;
  }
}

// Update an existing document
export async function updateDocument(documentId, documentData, file) {
  try {
    // If a new file is provided, upload it
    let fileUrl = documentData.fileUrl;

    if (file) {
      // Pass userId to uploadFile
      fileUrl = await uploadFile(file, "documents", documentData.userId);
    }

    // Update the document in Firestore
    const docRef = doc(firestore, "documents", documentId);
    await updateDoc(docRef, {
      ...documentData,
      fileUrl,
      updatedAt: serverTimestamp(),
    });

    return documentId;
  } catch (error) {
    console.error("Error updating document:", error);
    throw error;
  }
}

// Delete a document
export async function deleteDocument(documentId) {
  try {
    await deleteDoc(doc(firestore, "documents", documentId));
    return true;
  } catch (error) {
    console.error("Error deleting document:", error);
    throw error;
  }
}

// Generated data related functions

// Get all generated data sets for a user
export async function getUserDataSets(userId) {
  try {
    const q = query(
      collection(firestore, "datasets"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error getting user data sets:", error);
    throw error;
  }
}

// Error-resilient version that returns empty array instead of throwing
export async function getUserDataSetsSafe(userId) {
  try {
    return await getUserDataSets(userId);
  } catch (error) {
    console.warn("Error getting user data sets (safe mode):", error);
    return [];
  }
}

// Get a single data set by ID
export async function getDataSet(dataSetId) {
  try {
    const docRef = doc(firestore, "datasets", dataSetId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting data set:", error);
    throw error;
  }
}

// Add a new data set
export async function addDataSet(dataSetData, jsonlFile) {
  try {
    // Upload the JSONL file
    let fileUrl = null;

    if (jsonlFile) {
      // Pass userId to uploadFile
      fileUrl = await uploadFile(jsonlFile, "datasets", dataSetData.userId);
    }

    // Create the data set in Firestore
    const docRef = await addDoc(collection(firestore, "datasets"), {
      ...dataSetData,
      fileUrl,
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error("Error adding data set:", error);
    throw error;
  }
}

// Delete a data set
export async function deleteDataSet(dataSetId) {
  try {
    await deleteDoc(doc(firestore, "datasets", dataSetId));
    return true;
  } catch (error) {
    console.error("Error deleting data set:", error);
    throw error;
  }
}

// User profile functions

// Get user profile data
export async function getUserProfile(userId) {
  try {
    const docRef = doc(firestore, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting user profile:", error);
    throw error;
  }
}

// Update user profile
export async function updateUserProfile(userId, profileData, profileImage) {
  try {
    // If a new profile image is provided, upload it
    let profileImageUrl = profileData.profileImageUrl;

    if (profileImage) {
      // Pass userId to uploadFile
      profileImageUrl = await uploadFile(profileImage, "profileImages", userId);
    }

    // Update the user profile in Firestore
    const userRef = doc(firestore, "users", userId);
    await updateDoc(userRef, {
      ...profileData,
      profileImageUrl,
      updatedAt: serverTimestamp(),
    });

    return userId;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
}
// Helper function to upload a file to Firebase Storage
async function uploadFile(file, folder, userId) {
  return new Promise((resolve, reject) => {
    // Make sure userId is provided
    if (!userId) {
      console.error("User ID is required for file uploads");
      reject(new Error("User ID is required for file uploads"));
      return;
    }

    // Create a storage reference with user-specific path
    // This ensures the path matches what's allowed in the security rules
    const storageRef = ref(
      storage,
      `${folder}/${userId}/${Date.now()}_${file.name}`
    );

    // Upload the file
    const uploadTask = uploadBytesResumable(storageRef, file);

    // Register three observers:
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Observe state change events such as progress, pause, and resume
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log("Upload is " + progress + "% done");
      },
      (error) => {
        // Handle unsuccessful uploads
        console.error("Error uploading file:", error);

        // Provide more specific error messages for common issues
        if (
          error.code === "storage/unauthorized" ||
          error.message?.includes("CORS")
        ) {
          console.error(
            "CORS or authorization error. Check Firebase Storage CORS configuration."
          );
          reject(
            new Error(
              "Upload failed due to permission issues. Please try again later."
            )
          );
        } else if (error.code === "storage/canceled") {
          reject(new Error("Upload was canceled."));
        } else if (error.code === "storage/retry-limit-exceeded") {
          reject(
            new Error(
              "Upload failed due to network issues. Please check your connection and try again."
            )
          );
        } else {
          reject(error);
        }
      },
      () => {
        // Handle successful uploads on complete
        getDownloadURL(uploadTask.snapshot.ref)
          .then((downloadURL) => {
            console.log("File available at", downloadURL);
            resolve(downloadURL);
          })
          .catch((error) => {
            console.error("Error getting download URL:", error);
            reject(
              new Error("File was uploaded but could not get download URL.")
            );
          });
      }
    );
  });
}

// More resilient version of document upload that gracefully handles errors
export async function addDocumentWithErrorHandling(documentData, file) {
  try {
    // If there's a file, try to upload it
    let fileUrl = null;
    let uploadError = null;

    if (file) {
      try {
        // Pass userId to uploadFile
        fileUrl = await uploadFile(file, "documents", documentData.userId);
      } catch (error) {
        console.warn(
          "File upload failed, but continuing with document creation:",
          error
        );
        uploadError =
          error.message ||
          "File upload failed, but document metadata was saved.";
      }
    }

    // Create the document in Firestore even if file upload failed
    const docData = {
      ...documentData,
      fileUrl,
      uploadError: uploadError,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(firestore, "documents"), docData);

    return {
      id: docRef.id,
      success: true,
      fileUploaded: !!fileUrl,
      uploadError,
    };
  } catch (error) {
    console.error("Error adding document:", error);
    return {
      success: false,
      error: error.message || "Failed to create document",
      fileUploaded: false,
    };
  }
} // Credit management functions - add to the end of src/lib/firestoreService.js

// Add credits to a user's account
// Update this function in src/lib/firestoreService.js

export async function addCreditsToUser(userId, creditsToAdd) {
  try {
    const userRef = doc(firestore, 'users', userId);
    
    // Use transaction to safely update credits and add to history
    await runTransaction(firestore, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document does not exist');
      }
      
      const currentCredits = userDoc.data().credits || 0;
      
      // Update user credits
      transaction.update(userRef, {
        credits: currentCredits + creditsToAdd,
        lastUpdated: serverTimestamp()
      });
      
      // Add credit history entry
      const historyRef = doc(collection(firestore, 'creditHistory'));
      transaction.set(historyRef, {
        userId: userId,
        amount: creditsToAdd,
        type: 'purchase',
        description: `Credit purchase (${creditsToAdd} credits)`,
        timestamp: serverTimestamp()
      });
    });
    
    return true;
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
}

// Get credit usage history for a user
export async function getUserCreditHistory(userId) {
  try {
    const q = query(
      collection(firestore, "creditHistory"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error getting credit history:", error);
    throw error;
  }
}

// Add this function to handle saving processing job status to Firestore

function sanitizeForFirestore(obj) {
  if (!obj) return null;
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  
  const sanitized = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    // Skip undefined values
    if (value === undefined) return;
    
    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForFirestore(value);
    } else {
      sanitized[key] = value;
    }
  });
  
  return sanitized;
}

// Save processing job status
export async function saveProcessingJob(userId, jobData) {
  try {
    const db = getFirestore();
    const jobsRef = collection(db, 'processingJobs');
    
    // Create a unique job ID if not provided
    const jobId = jobData.jobId || `job-${Date.now()}`;
    
    // Sanitize the job data to remove undefined values
    const sanitizedJobData = sanitizeForFirestore(jobData);
    
    // Add user ID and timestamps
    const jobWithMeta = {
      ...sanitizedJobData,
      userId,
      jobId,
      createdAt: jobData.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    // Check if job already exists
    const existingJobQuery = query(
      jobsRef, 
      where('jobId', '==', jobId),
      where('userId', '==', userId),
      limit(1)
    );
    
    const existingJobs = await getDocs(existingJobQuery);
    
    if (!existingJobs.empty) {
      // Update existing job
      const jobDoc = existingJobs.docs[0];
      await updateDoc(doc(db, 'processingJobs', jobDoc.id), {
        ...jobWithMeta,
        id: jobDoc.id,
      });
      return jobDoc.id;
    } else {
      // Create new job
      const docRef = await addDoc(jobsRef, jobWithMeta);
      await updateDoc(docRef, { id: docRef.id });
      return docRef.id;
    }
  } catch (error) {
    console.error('Error saving processing job:', error);
    return null;
  }
}

// Add caching variables at the top of the file
let cachedJobs = {};
let cachedJobsTime = {};
const CACHE_TTL = 5000; // 5 seconds TTL for job caching

// Optimize the getUserProcessingJobs function with caching
export const getUserProcessingJobs = async (userId) => {
  try {
    if (!userId) {
      console.warn("getUserProcessingJobs called without userId");
      return [];
    }

    // Check if we have a recent cache for this user
    const now = Date.now();
    if (
      cachedJobs[userId] && 
      cachedJobsTime[userId] && 
      now - cachedJobsTime[userId] < CACHE_TTL
    ) {
      console.log(`Using cached jobs for user ${userId}, age: ${now - cachedJobsTime[userId]}ms`);
      return cachedJobs[userId];
    }

    console.log(`Fetching fresh jobs for user ${userId} from Firestore`);
    
    // Get jobs from Firestore with a limit to avoid excessive data transfer
    const jobsRef = collection(firestore, "processingJobs");
    const q = query(
      jobsRef,
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(20) // Limit to 20 most recent jobs
    );
    
    const querySnapshot = await getDocs(q);
    const jobs = [];
    
    querySnapshot.forEach((doc) => {
      jobs.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    // Update the cache
    cachedJobs[userId] = jobs;
    cachedJobsTime[userId] = now;
    
    return jobs;
  } catch (error) {
    // Gracefully handle permission errors by returning empty array instead of throwing
    console.warn(`Error fetching processing jobs for user ${userId}:`, error);
    return [];
  }
};

// Update processing job status
export async function updateProcessingJobStatus(jobId, status, progress, result) {
  try {
    const db = getFirestore();
    const jobsRef = collection(db, 'processingJobs');
    const jobQuery = query(jobsRef, where('jobId', '==', jobId), limit(1));
    
    const snapshot = await getDocs(jobQuery);
    if (snapshot.empty) {
      console.warn(`No job found with ID: ${jobId}`);
      return false;
    }
    
    const jobDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'processingJobs', jobDoc.id), {
      status,
      progress,
      result: result || null,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error updating processing job status:', error);
    return false;
  }
}
// Add this function to your firestoreService.js file

// Cancel a processing job
export async function cancelProcessingJob(userId, jobId) {
  try {
    console.log(`Attempting to cancel job ${jobId} for user ${userId}`);
    
    if (!userId || !jobId) {
      throw new Error('User ID and Job ID are required to cancel a job');
    }
    
    // Make API request to the cancel endpoint
    const response = await fetch('/api/cancel-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        jobId,
      }),
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      const errorMessage = responseData.error || responseData.message || 'Failed to cancel job';
      console.error(`Server returned ${response.status}: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    console.log('Job cancellation successful:', responseData);

    // Invalidate the jobs cache
    delete cachedJobs[userId];
    delete cachedJobsTime[userId];
    
    return responseData;
  } catch (error) {
    console.error('Error cancelling processing job:', error);
    throw error;
  }
}