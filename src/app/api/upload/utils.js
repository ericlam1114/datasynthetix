import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { db, storage } from '@/firebase-admin';

/**
 * Combines uploaded chunks into a single file
 * @param {string} uploadId - The upload ID
 * @param {string} jobId - The job ID
 * @param {string} userId - The user ID
 * @param {object} uploadInfo - Information about the upload
 */
export async function combineChunks(uploadId, jobId, userId, uploadInfo) {
  let tempFilePath = null;
  
  try {
    // Get Firebase admin instances
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const storage = (await import('firebase-admin/storage')).getStorage();
    const db = admin.getFirestore();
    const bucket = storage.bucket();
    
    // Update job status
    await updateJobStatus(db, jobId, 'combining', 10);
    
    // Get all chunks
    const [files] = await bucket.getFiles({
      prefix: `temp/${uploadId}/chunk-`
    });
    
    // Sort chunks by index
    files.sort((a, b) => {
      const indexA = parseInt(a.name.split('chunk-')[1], 10);
      const indexB = parseInt(b.name.split('chunk-')[1], 10);
      return indexA - indexB;
    });
    
    // Create temp file for combined chunks
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-'));
    tempFilePath = path.join(tempDir, uploadInfo.filename);
    
    // Update job status
    await updateJobStatus(db, jobId, 'combining', 20);
    
    // Combine chunks to local temp file
    const fileStream = fs.createWriteStream(tempFilePath);
    
    for (let i = 0; i < files.length; i++) {
      const progress = 20 + Math.floor((i / files.length) * 50);
      await updateJobStatus(db, jobId, 'combining', progress);
      
      const [chunkData] = await files[i].download();
      await fs.appendFile(tempFilePath, chunkData);
    }
    
    // Update job status
    await updateJobStatus(db, jobId, 'uploading', 70);
    
    // Upload combined file to final destination
    const finalPath = `uploads/${userId}/${uploadInfo.filename}`;
    const finalFile = bucket.file(finalPath);
    
    await finalFile.save(await fs.readFile(tempFilePath), {
      metadata: {
        contentType: uploadInfo.contentType,
        metadata: {
          userId,
          uploadId,
          originalName: uploadInfo.filename
        }
      }
    });
    
    // Update job status
    await updateJobStatus(db, jobId, 'cleanup', 90);
    
    // Update upload document with final path
    await db.collection('uploads').doc(uploadId).update({
      status: 'completed',
      progress: 100,
      finalPath,
      downloadUrl: `https://storage.googleapis.com/${bucket.name}/${finalPath}`,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Clean up temp chunks
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);
    
    // Create document record
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    await db.collection('documents').doc(documentId).set({
      id: documentId,
      userId,
      fileName: uploadInfo.fileName,
      fileType: uploadInfo.contentType,
      fileSize: uploadInfo.fileSize,
      filePath: finalPath,
      status: 'uploaded',
      createdAt: admin.FieldValue.serverTimestamp(),
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Complete upload job
    await updateJobStatus(db, jobId, 'completed', 100);
    
    // Clean up temp file
    if (tempFilePath) {
      await fs.unlink(tempFilePath);
      await fs.rmdir(path.dirname(tempFilePath));
    }
    
    // Start PDF processing with a new job
    const processingJobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Create processing job
    await db.collection('jobs').doc(processingJobId).set({
      id: processingJobId,
      userId,
      documentId,
      status: 'pending',
      stage: 'initializing',
      progress: 0,
      createdAt: admin.FieldValue.serverTimestamp(),
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Start processing asynchronously
    startPdfProcessing(documentId, finalPath, userId, processingJobId)
      .then(() => console.log(`Started PDF processing for document ${documentId}`))
      .catch(error => console.error(`Error starting PDF processing: ${error.message}`));
    
    return {
      success: true,
      uploadId,
      jobId,
      processingJobId,
      documentId,
      filePath: finalPath
    };
  } catch (error) {
    console.error('Error combining chunks:', error);
    
    // Get Firestore instance
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const db = admin.getFirestore();
    
    // Update job with error
    await db.collection('jobs').doc(jobId).update({
      status: 'error',
      error: error.message,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Clean up temp file if it exists
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }
    
    throw error;
  }
}

/**
 * Updates job status and progress
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} jobId - The job ID
 * @param {string} status - The job status
 * @param {number} progress - The job progress percentage
 */
export async function updateJobStatus(db, jobId, status, progress) {
  await db.collection('jobs').doc(jobId).update({
    status,
    progress,
    updatedAt: (await import('firebase-admin/firestore')).FieldValue.serverTimestamp()
  });
}

/**
 * Saves a document to Firebase Storage
 * @param {Buffer|ArrayBuffer} fileData - The file data
 * @param {string} userId - The user ID
 * @param {string} filename - The original filename
 * @param {string} contentType - The file MIME type
 * @returns {Promise<object>} - The upload info
 */
export async function saveDocumentToStorage(fileData, userId, filename, contentType) {
  // Get Firebase admin instances
  const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
  const storage = (await import('firebase-admin/storage')).getStorage();
  const db = admin.getFirestore();
  
  // Generate a unique ID for the upload
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  // Create upload record in Firestore
  await db.collection('uploads').doc(uploadId).set({
    userId,
    filename,
    contentType,
    size: fileData.byteLength || fileData.length,
    status: 'uploading',
    progress: 0,
    createdAt: admin.FieldValue.serverTimestamp(),
    updatedAt: admin.FieldValue.serverTimestamp()
  });
  
  // Upload file to Firebase Storage
  const bucket = storage.bucket();
  const filePath = `uploads/${userId}/${filename}`;
  const file = bucket.file(filePath);
  
  await file.save(Buffer.from(fileData), {
    metadata: {
      contentType,
      metadata: {
        userId,
        uploadId,
        originalName: filename
      }
    }
  });
  
  // Update upload record with completed status
  const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  
  await db.collection('uploads').doc(uploadId).update({
    status: 'completed',
    progress: 100,
    finalPath: filePath,
    downloadUrl,
    updatedAt: admin.FieldValue.serverTimestamp()
  });
  
  return {
    uploadId,
    filename,
    filePath,
    downloadUrl,
    size: fileData.byteLength || fileData.length
  };
}

/**
 * Create a new chunked upload record in the database
 * @param {string} userId - User ID who is uploading
 * @param {string} fileName - Original file name
 * @param {number} fileSize - Size of the file in bytes
 * @param {string} fileType - MIME type of the file
 * @param {number} chunkSize - Size of each chunk in bytes (default: 5MB)
 * @returns {Object} - Upload information including uploadId
 */
export async function createChunkedUpload(userId, fileName, fileSize, fileType, chunkSize = 5 * 1024 * 1024) {
  try {
    // Calculate total chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // Create upload record
    const uploadRef = db.collection('uploads').doc();
    const uploadId = uploadRef.id;
    
    // Generate a more user-friendly filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileExtension = path.extname(sanitizedFileName);
    const fileNameWithoutExt = path.basename(sanitizedFileName, fileExtension);
    const uniqueFileName = `${fileNameWithoutExt}-${Date.now()}${fileExtension}`;
    
    await uploadRef.set({
      uploadId,
      userId,
      fileName: sanitizedFileName,
      uniqueFileName,
      fileSize,
      fileType,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      status: 'initialized',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return {
      uploadId,
      chunkSize,
      totalChunks,
      fileName: uniqueFileName
    };
  } catch (error) {
    console.error('Error creating chunked upload:', error);
    throw error;
  }
}

/**
 * Start the PDF processing job
 * @param {string} jobId - ID of the job
 * @param {string} fileUrl - URL of the file to process
 * @param {string} fileName - Name of the file
 * @param {string} userId - ID of the user
 */
async function startPdfProcessing(jobId, fileUrl, fileName, userId) {
  try {
    // Update job status
    const jobRef = db.collection('jobs').doc(jobId);
    
    // This would normally call your PDF extraction service
    // For now, we'll just update the job status to simulate processing
    
    // Update to processing
    await jobRef.update({
      stage: 'processing',
      progress: 70,
      updatedAt: new Date()
    });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update to finalizing
    await jobRef.update({
      stage: 'finalizing',
      progress: 90,
      updatedAt: new Date()
    });
    
    // Simulate finalizing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Complete the job
    await jobRef.update({
      stage: 'complete',
      status: 'completed',
      progress: 100,
      updatedAt: new Date()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Update job status to failed
    await db.collection('jobs').doc(jobId).update({
      status: 'failed',
      error: error.message,
      updatedAt: new Date()
    });
    
    throw error;
  }
}

/**
 * Start PDF extraction and processing after file upload is complete
 * @param {string} documentId - ID of the document
 * @param {string} filePath - Path to the file in storage
 * @param {string} userId - ID of the user
 * @param {string} jobId - ID of the job
 * @returns {Promise<object>} - Processing result
 */
export async function startPdfProcessing(documentId, filePath, userId, jobId) {
  try {
    // Get Firebase admin instances
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const storage = (await import('firebase-admin/storage')).getStorage();
    const db = admin.getFirestore();
    
    // Update job status to processing
    await db.collection('jobs').doc(jobId).update({
      status: 'processing',
      stage: 'extraction',
      progress: 10,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Get file from storage
    const bucket = storage.bucket();
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();
    
    // Import the extraction functionality
    const { extractPdfData } = await import('@/utils/pdf-processor');
    
    // Update job status to extracting
    await db.collection('jobs').doc(jobId).update({
      stage: 'extracting_text',
      progress: 20,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Perform extraction
    const extractionResult = await extractPdfData(fileBuffer, {
      onProgress: async (stage, progress) => {
        // Update job progress
        await db.collection('jobs').doc(jobId).update({
          stage,
          progress: 20 + Math.floor(progress * 0.6), // Scale to 20-80%
          updatedAt: admin.FieldValue.serverTimestamp()
        });
      }
    });
    
    // Update job status to finalizing
    await db.collection('jobs').doc(jobId).update({
      stage: 'saving_results',
      progress: 90,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Save extraction results to document record
    await db.collection('documents').doc(documentId).update({
      extractionResults: extractionResult,
      status: 'processed',
      pageCount: extractionResult.pageCount || 0,
      textContent: extractionResult.text || '',
      metadata: extractionResult.metadata || {},
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Update job status to completed
    await db.collection('jobs').doc(jobId).update({
      status: 'completed',
      stage: 'complete',
      progress: 100,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      documentId,
      extractionResults: extractionResult
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Get Firestore instance
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const db = admin.getFirestore();
    
    // Update job with error
    await db.collection('jobs').doc(jobId).update({
      status: 'error',
      error: error.message,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    throw error;
  }
} 