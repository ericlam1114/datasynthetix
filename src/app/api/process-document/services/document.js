/**
 * Document service for handling document storage and retrieval
 * Centralizes logic for Firebase Storage and Firestore document interactions
 */

import { getFirebaseAdmin } from "../../../../lib/firebase-admin";
import { extractTextFromPdf } from "../utils/extractText";
import { v4 as uuidv4 } from "uuid";
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { getFirestore, doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import path from "path";
import fs from "fs/promises";
import os from "os";

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Handles document upload and storage
 *
 * @param {Object} file - The uploaded file
 * @param {String} userId - The user's ID
 * @param {Object} metadata - Additional metadata
 * @returns {Object} The document information
 */
export async function saveDocument(file, userId, metadata = {}) {
  try {
    // Check if file is provided
    if (!file || !file.size) {
      throw new Error("No file provided");
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate a unique filename
    const fileName = metadata.fileName || file.name;
    const fileExt = path.extname(fileName).toLowerCase();
    const uniqueId = uuidv4();
    const uniqueFileName = `${path.basename(
      fileName,
      fileExt
    )}-${uniqueId}${fileExt}`;

    // Save to Firestore
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const docRef = db.collection("documents").doc();
    const documentId = docRef.id;

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const filePath = `documents/${userId}/${documentId}/${uniqueFileName}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          userId,
          originalName: fileName,
          size: file.size,
        },
      },
    });

    // Get download URL
    const [url] = await fileRef.getSignedUrl({
      action: "read",
      expires: "03-01-2500", // Far future
    });

    // Save document metadata to Firestore
    await docRef.set({
      userId,
      name: metadata.name || fileName,
      description: metadata.description || "",
      fileType: file.type,
      fileName: uniqueFileName,
      originalName: fileName,
      filePath,
      fileSize: file.size,
      url,
      status: "uploaded",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(metadata || {}),
    });

    return {
      documentId,
      fileName: uniqueFileName,
      originalName: fileName,
      url,
      filePath,
      ...metadata,
    };
  } catch (error) {
    console.error("Error saving document:", error);
    throw error;
  }
}

/**
 * Retrieves a document's information and content
 *
 * @param {String} documentId - The document ID
 * @param {String} userId - The user's ID for permission check
 * @returns {Object} The document data and content
 */
export async function getDocument(documentId, userId) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    // Get document metadata
    const docRef = db.collection("documents").doc(documentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error("Document not found");
    }

    const docData = doc.data();

    // Check ownership
    if (docData.userId !== userId) {
      throw new Error("Unauthorized access to document");
    }

    return {
      id: doc.id,
      ...docData,
    };
  } catch (error) {
    console.error("Error retrieving document:", error);
    throw error;
  }
}

/**
 * Downloads a document's content from storage
 *
 * @param {Object} document - The document object with filePath
 * @returns {Buffer} The document's binary data
 */
export async function downloadDocument(document) {
  try {
    if (!document || !document.filePath) {
      throw new Error("Invalid document or missing file path");
    }

    const admin = getFirebaseAdmin();
    const bucket = admin.storage().bucket();
    const fileRef = bucket.file(document.filePath);

    // Check if file exists
    const [exists] = await fileRef.exists();
    if (!exists) {
      throw new Error("File not found in storage");
    }

    // Download file
    const [fileBuffer] = await fileRef.download();
    return fileBuffer;
  } catch (error) {
    console.error("Error downloading document:", error);
    throw error;
  }
}

/**
 * Creates a processing job record for tracking document processing
 *
 * @param {String} userId - The user's ID
 * @param {String} documentId - The document ID
 * @param {Object} options - Job options and metadata
 * @returns {Object} The created job information
 */
export async function createProcessingJob(userId, documentId, options = {}) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    // Generate unique job ID
    const jobId =
      options.jobId || `job-${Date.now()}-${uuidv4().substring(0, 5)}`;

    // Create job document
    const jobRef = db.collection("processingJobs").doc(jobId);
    await jobRef.set({
      userId,
      documentId,
      status: "created",
      progress: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      options: options || {},
      ...(options.metadata || {}),
    });

    return {
      jobId,
      documentId,
      status: "created",
    };
  } catch (error) {
    console.error("Error creating processing job:", error);
    throw error;
  }
}

/**
 * Updates the status of a processing job
 *
 * @param {String} jobId - The job ID
 * @param {Object} statusUpdate - The status update data
 * @returns {Object} The updated job information
 */
export async function updateProcessingJob(jobId, statusUpdate) {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    const jobRef = db.collection("processingJobs").doc(jobId);

    await jobRef.update({
      ...statusUpdate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      jobId,
      ...statusUpdate,
    };
  } catch (error) {
    console.error("Error updating processing job:", error);
    throw error;
  }
}

/**
 * Saves processing results for a document
 *
 * @param {String} documentId - The document ID
 * @param {String} jobId - The job ID
 * @param {Object} results - The processing results
 * @returns {Object} Success status and information
 */
export async function saveProcessingResults(documentId, jobId, results) {
  try {
    // First try with client SDK
    let success = false;
    let adminAttempted = false;
    let error = null;
    
    try {
      // Client SDK approach
      const db = getFirestore();
      
      // Update document with results using client SDK
      const docRef = doc(db, "documents", documentId);
      await updateDoc(docRef, {
        processed: true,
        processingJobId: jobId,
        processingComplete: true,
        processingStats: results.stats || {},
        updatedAt: serverTimestamp(),
      });

      // Save processing job
      const jobRef = doc(db, "processingJobs", jobId);
      await setDoc(
        jobRef,
        {
          documentId,
          status: "completed",
          results: results,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      
      success = true;
      console.log(`Successfully saved processing results for document ${documentId} using client SDK`);
    } catch (clientError) {
      console.error("Error saving with client SDK:", clientError);
      error = clientError;
      
      // Now try with admin SDK as fallback
      try {
        adminAttempted = true;
        const adminDb = await getAdminFirestore();
        if (!adminDb) {
          throw new Error("Admin Firestore not available");
        }
        
        // Update document with results using admin SDK
        const docRef = adminDb.collection("documents").doc(documentId);
        await docRef.update({
          processed: true,
          processingJobId: jobId,
          processingComplete: true,
          processingStats: results.stats || {},
          updatedAt: new Date(),
        });

        // Save processing job
        const jobRef = adminDb.collection("processingJobs").doc(jobId);
        await jobRef.set(
          {
            documentId,
            status: "completed",
            results: results,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        );
        
        success = true;
        console.log(`Successfully saved processing results for document ${documentId} using admin SDK`);
      } catch (adminError) {
        console.error("Error saving with admin SDK:", adminError);
        // If we couldn't save with either method, throw the original error
        if (!success) {
          throw clientError;
        }
      }
    }

    // If we're here and success is true, we managed to save somewhere
    return {
      success: true,
      documentId,
      jobId,
      savedWithAdmin: adminAttempted && success,
      savedWithClient: !adminAttempted && success
    };
  } catch (error) {
    console.error("Error saving processing results:", error);
    throw error;
  }
}
