import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, collection, setDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Constants
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
const UPLOAD_DIRECTORY = process.env.UPLOAD_DIRECTORY || path.join(process.cwd(), "uploads");

/**
 * Ensures the uploads directory exists for local development
 */
export async function ensureUploadsDirectory() {
  try {
    await fs.access(UPLOAD_DIRECTORY);
  } catch (error) {
    await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
    console.log("Created uploads directory:", UPLOAD_DIRECTORY);
  }
}

/**
 * Upload a file directly (non-chunked) to storage
 * @param {File|Blob|Buffer} file - The file to upload
 * @param {string} userId - User ID
 * @param {Object} options - Upload options
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Object>} Upload result with document ID and download URL
 */
export async function uploadFile(file, userId, options = {}, progressCallback = null) {
  try {
    // Validate inputs
    if (!file) throw new Error("No file provided");
    if (!userId) throw new Error("User ID is required");
    
    // Create a document ID
    const documentId = options.documentId || `doc-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Get file details
    let buffer;
    let fileName;
    let fileType;
    let fileSize;
    
    if (Buffer.isBuffer(file)) {
      // Handle Node.js Buffer
      buffer = file;
      fileName = options.fileName || `file-${Date.now()}`;
      fileType = options.fileType || "application/octet-stream";
      fileSize = buffer.length;
    } else if (file instanceof Blob || file.arrayBuffer) {
      // Handle browser File or Blob
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name || options.fileName || `file-${Date.now()}`;
      fileType = file.type || options.fileType || "application/octet-stream";
      fileSize = file.size;
    } else {
      throw new Error("Unsupported file type");
    }
    
    // Create job in Firestore to track progress
    const db = getFirestore();
    const jobId = options.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    await setDoc(doc(collection(db, "jobs"), jobId), {
      id: jobId,
      userId,
      documentId,
      status: "uploading",
      stage: "initialized",
      progress: 0,
      fileName,
      fileSize,
      fileType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      options: {
        ...options,
        fileName,
        fileType
      }
    });
    
    // Update job status function
    const updateJobStatus = async (status, stage, progress) => {
      await updateDoc(doc(db, "jobs", jobId), {
        status,
        stage,
        progress,
        updatedAt: serverTimestamp()
      });
      
      if (progressCallback) {
        progressCallback({
          jobId,
          documentId,
          status,
          stage,
          progress
        });
      }
    };
    
    // Begin upload process
    await updateJobStatus("uploading", "preparing", 5);
    
    let fileUrl = null;
    let filePath = null;
    let storageType = null;
    
    // Try Firebase Storage first
    try {
      await updateJobStatus("uploading", "firebase_storage", 10);
      
      const storage = getStorage();
      const storageRef = ref(storage, `documents/${userId}/${Date.now()}_${fileName}`);
      
      // Use resumable upload with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, buffer);
      
      // Set up progress monitoring
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = Math.floor((snapshot.bytesTransferred / snapshot.totalBytes) * 80) + 10;
          updateJobStatus("uploading", "firebase_storage", progress);
        },
        (error) => {
          console.error("Firebase upload error:", error);
          // Error is handled in the catch block
        }
      );
      
      // Wait for upload to complete
      await uploadTask;
      
      // Get download URL
      fileUrl = await getDownloadURL(storageRef);
      filePath = storageRef.fullPath;
      storageType = "firebase";
      
      console.log(`Uploaded to Firebase Storage: ${filePath}`);
    } catch (firebaseError) {
      console.error("Error uploading to Firebase Storage:", firebaseError);
      
      // Try AWS S3 if configured
      if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
        try {
          await updateJobStatus("uploading", "aws_s3", 20);
          
          // Create S3 client
          const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            } : undefined
          });
          
          // Set up S3 path
          const s3Key = `documents/${userId}/${Date.now()}_${fileName}`;
          
          // Upload to S3
          await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: fileType,
            Metadata: {
              'user-id': userId,
              'document-id': documentId
            }
          }));
          
          // Set file path and URL
          filePath = s3Key;
          fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
          
          // If custom URL is configured
          if (process.env.AWS_S3_PUBLIC_URL) {
            fileUrl = `${process.env.AWS_S3_PUBLIC_URL}/${s3Key}`;
          }
          
          storageType = "s3";
          await updateJobStatus("uploading", "aws_s3", 80);
          
          console.log(`Uploaded to AWS S3: ${filePath}`);
        } catch (s3Error) {
          console.error("Error uploading to AWS S3:", s3Error);
          
          // Fall back to local storage in development
          if (process.env.NODE_ENV === 'development') {
            await saveToLocalFileSystem();
          } else {
            throw new Error("Failed to upload to cloud storage");
          }
        }
      } else {
        // Fall back to local storage in development
        if (process.env.NODE_ENV === 'development') {
          await saveToLocalFileSystem();
        } else {
          throw new Error("No cloud storage options available");
        }
      }
    }
    
    // Helper function for local storage
    async function saveToLocalFileSystem() {
      await updateJobStatus("uploading", "local_storage", 30);
      
      await ensureUploadsDirectory();
      
      // Create user directory
      const userDir = path.join(UPLOAD_DIRECTORY, userId);
      await fs.mkdir(userDir, { recursive: true });
      
      // Save file locally
      const localFileName = `${Date.now()}_${fileName}`;
      const localFilePath = path.join(userDir, localFileName);
      await fs.writeFile(localFilePath, buffer);
      
      // Set file path and URL for local storage
      filePath = `uploads/${userId}/${localFileName}`;
      fileUrl = `/api/files/${userId}/${localFileName}`;
      storageType = "local";
      
      await updateJobStatus("uploading", "local_storage", 80);
      
      console.log(`Uploaded to local file system: ${localFilePath}`);
    }
    
    // Save document metadata to Firestore
    await updateJobStatus("uploading", "metadata", 90);
    
    const docRef = doc(collection(db, "documents"), documentId);
    
    const documentData = {
      id: documentId,
      userId,
      jobId,
      name: options.name || fileName,
      description: options.description || "",
      fileName,
      fileType,
      fileSize,
      fileUrl,
      filePath,
      storageType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(docRef, documentData);
    
    // Mark job as completed
    await updateJobStatus("completed", "finished", 100);
    
    console.log(`Document upload completed with ID: ${documentId}`);
    
    return {
      documentId,
      jobId,
      filePath,
      fileUrl,
      fileName,
      fileSize,
      storageType
    };
  } catch (error) {
    console.error("Error in uploadFile:", error);
    
    // Update job with error
    try {
      const db = getFirestore();
      const jobId = options.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      await updateDoc(doc(db, "jobs", jobId), {
        status: "error",
        error: error.message,
        updatedAt: serverTimestamp()
      });
    } catch (updateError) {
      console.error("Error updating job status:", updateError);
    }
    
    throw error;
  }
}

/**
 * Initiate a chunked upload
 * @param {Object} options - Upload options
 * @param {string} options.userId - User ID
 * @param {string} options.fileName - Original file name
 * @param {number} options.fileSize - File size in bytes
 * @param {string} options.fileType - MIME type
 * @param {number} options.chunkSize - Optional chunk size in bytes (default: 2MB)
 * @returns {Promise<Object>} Upload information
 */
export async function initiateChunkedUpload(options) {
  if (!options.userId) throw new Error("User ID is required");
  if (!options.fileName) throw new Error("File name is required");
  if (!options.fileSize) throw new Error("File size is required");
  if (!options.fileType) throw new Error("File type is required");
  
  const { userId, fileName, fileSize, fileType } = options;
  const chunkSize = options.chunkSize || CHUNK_SIZE;
  
  try {
    // Generate upload ID
    const uploadId = `upload-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Calculate total chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // Create a job for this upload
    const jobId = options.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Sanitize filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileExtension = path.extname(sanitizedFileName);
    const fileNameWithoutExt = path.basename(sanitizedFileName, fileExtension);
    const uniqueFileName = `${fileNameWithoutExt}-${Date.now()}${fileExtension}`;
    
    // Create upload record in Firestore
    const db = getFirestore();
    
    await setDoc(doc(db, "uploads", uploadId), {
      id: uploadId,
      jobId,
      userId,
      fileName: sanitizedFileName,
      uniqueFileName,
      fileSize,
      fileType,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      currentChunk: 0,
      status: "initialized",
      progress: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Create job record
    await setDoc(doc(db, "jobs", jobId), {
      id: jobId,
      userId,
      uploadId,
      status: "initialized",
      stage: "chunked_upload_initiated",
      progress: 0,
      fileName: sanitizedFileName,
      fileSize,
      fileType,
      totalChunks,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return {
      uploadId,
      jobId,
      totalChunks,
      chunkSize,
      uploadUrl: `/api/upload/chunk?uploadId=${uploadId}`,
      fileName: uniqueFileName
    };
  } catch (error) {
    console.error("Error initiating chunked upload:", error);
    throw error;
  }
}

/**
 * Upload a chunk of a file
 * @param {Object} options - Chunk upload options
 * @param {string} options.uploadId - Upload ID from initiateChunkedUpload
 * @param {number} options.chunkIndex - Index of this chunk (0-based)
 * @param {Blob|Buffer} options.chunkData - The chunk data
 * @param {string} options.userId - User ID
 * @returns {Promise<Object>} Chunk upload result
 */
export async function uploadChunk(options) {
  const { uploadId, chunkIndex, chunkData, userId } = options;
  
  if (!uploadId) throw new Error("Upload ID is required");
  if (chunkIndex === undefined) throw new Error("Chunk index is required");
  if (!chunkData) throw new Error("Chunk data is required");
  if (!userId) throw new Error("User ID is required");
  
  try {
    const db = getFirestore();
    const uploadRef = doc(db, "uploads", uploadId);
    
    // Get upload info
    const uploadSnapshot = await db.getDoc(uploadRef);
    if (!uploadSnapshot.exists()) {
      throw new Error("Upload not found");
    }
    
    const uploadInfo = uploadSnapshot.data();
    
    // Verify ownership
    if (uploadInfo.userId !== userId) {
      throw new Error("Not authorized to upload to this upload ID");
    }
    
    // Verify this chunk is expected
    if (chunkIndex > uploadInfo.totalChunks - 1) {
      throw new Error(`Invalid chunk index: ${chunkIndex}. Expected 0-${uploadInfo.totalChunks - 1}`);
    }
    
    // Verify this chunk hasn't been uploaded already
    if (uploadInfo.uploadedChunks.includes(chunkIndex)) {
      console.warn(`Chunk ${chunkIndex} already uploaded for ${uploadId}`);
      return {
        uploadId,
        chunkIndex,
        status: "already_uploaded",
        progress: uploadInfo.progress
      };
    }
    
    // Prepare chunk data
    let buffer;
    if (Buffer.isBuffer(chunkData)) {
      buffer = chunkData;
    } else if (chunkData instanceof Blob || chunkData.arrayBuffer) {
      buffer = Buffer.from(await chunkData.arrayBuffer());
    } else {
      throw new Error("Unsupported chunk data type");
    }
    
    // Determine storage target based on environment
    let chunkUrl = null;
    
    // Try Firebase Storage
    try {
      const storage = getStorage();
      const chunkRef = ref(storage, `temp/${uploadId}/chunk-${chunkIndex}`);
      
      // Upload chunk
      await uploadBytes(chunkRef, buffer);
      
      chunkUrl = await getDownloadURL(chunkRef);
    } catch (firebaseError) {
      console.error("Error uploading chunk to Firebase:", firebaseError);
      
      // Try local storage in development
      if (process.env.NODE_ENV === 'development') {
        await ensureUploadsDirectory();
        
        const tempDir = path.join(UPLOAD_DIRECTORY, "temp", uploadId);
        await fs.mkdir(tempDir, { recursive: true });
        
        const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
        await fs.writeFile(chunkPath, buffer);
        
        chunkUrl = `/api/files/temp/${uploadId}/chunk-${chunkIndex}`;
      } else {
        throw new Error("Failed to upload chunk to storage");
      }
    }
    
    // Update upload record with this chunk
    await updateDoc(uploadRef, {
      uploadedChunks: [...uploadInfo.uploadedChunks, chunkIndex],
      currentChunk: chunkIndex + 1,
      progress: Math.floor(((uploadInfo.uploadedChunks.length + 1) / uploadInfo.totalChunks) * 100),
      updatedAt: serverTimestamp()
    });
    
    // Update job progress
    if (uploadInfo.jobId) {
      await updateDoc(doc(db, "jobs", uploadInfo.jobId), {
        progress: Math.floor(((uploadInfo.uploadedChunks.length + 1) / uploadInfo.totalChunks) * 80),
        stage: "uploading_chunks",
        updatedAt: serverTimestamp()
      });
    }
    
    // Check if all chunks have been uploaded
    const isComplete = uploadInfo.uploadedChunks.length + 1 === uploadInfo.totalChunks;
    
    return {
      uploadId,
      chunkIndex,
      status: isComplete ? "complete" : "uploaded",
      progress: Math.floor(((uploadInfo.uploadedChunks.length + 1) / uploadInfo.totalChunks) * 100),
      isComplete
    };
  } catch (error) {
    console.error("Error uploading chunk:", error);
    throw error;
  }
}

/**
 * Complete a chunked upload by combining all chunks
 * @param {string} uploadId - Upload ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Final document information
 */
export async function finalizeChunkedUpload(uploadId, userId) {
  if (!uploadId) throw new Error("Upload ID is required");
  if (!userId) throw new Error("User ID is required");
  
  try {
    const db = getFirestore();
    const uploadRef = doc(db, "uploads", uploadId);
    
    // Get upload info
    const uploadSnapshot = await db.getDoc(uploadRef);
    if (!uploadSnapshot.exists()) {
      throw new Error("Upload not found");
    }
    
    const uploadInfo = uploadSnapshot.data();
    
    // Verify ownership
    if (uploadInfo.userId !== userId) {
      throw new Error("Not authorized to finalize this upload");
    }
    
    // Verify all chunks were uploaded
    if (uploadInfo.uploadedChunks.length !== uploadInfo.totalChunks) {
      throw new Error(`Cannot finalize incomplete upload. ${uploadInfo.uploadedChunks.length}/${uploadInfo.totalChunks} chunks uploaded.`);
    }
    
    // Update job and upload status
    const jobId = uploadInfo.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    await updateDoc(doc(db, "jobs", jobId), {
      status: "processing",
      stage: "combining_chunks",
      progress: 85,
      updatedAt: serverTimestamp()
    });
    
    await updateDoc(uploadRef, {
      status: "finalizing",
      updatedAt: serverTimestamp()
    });
    
    // Document ID to use
    const documentId = uploadInfo.documentId || `doc-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Determine which storage system to use based on current environment
    // (Firebase is preferred, with S3 as backup and local as last resort)
    let finalPath = null;
    let downloadUrl = null;
    let storageType = null;
    
    // TODO: Implement the actual combining of chunks from Firebase/S3/local
    // For now, this is just a placeholder
    
    // Mark as completed
    await updateDoc(uploadRef, {
      status: "completed",
      finalPath,
      downloadUrl,
      progress: 100,
      updatedAt: serverTimestamp()
    });
    
    // Save document metadata
    const docRef = doc(collection(db, "documents"), documentId);
    
    await setDoc(docRef, {
      id: documentId,
      userId,
      jobId,
      uploadId,
      name: uploadInfo.fileName,
      fileName: uploadInfo.uniqueFileName,
      fileType: uploadInfo.fileType,
      fileSize: uploadInfo.fileSize,
      fileUrl: downloadUrl,
      filePath: finalPath,
      storageType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Complete job
    await updateDoc(doc(db, "jobs", jobId), {
      status: "completed",
      stage: "finished",
      progress: 100,
      documentId,
      updatedAt: serverTimestamp()
    });
    
    return {
      documentId,
      jobId,
      uploadId,
      filePath: finalPath,
      fileUrl: downloadUrl,
      fileName: uploadInfo.uniqueFileName,
      fileSize: uploadInfo.fileSize,
      storageType
    };
  } catch (error) {
    console.error("Error finalizing chunked upload:", error);
    
    // Update job with error
    try {
      const db = getFirestore();
      const uploadSnapshot = await db.getDoc(doc(db, "uploads", uploadId));
      
      if (uploadSnapshot.exists()) {
        const uploadInfo = uploadSnapshot.data();
        const jobId = uploadInfo.jobId;
        
        if (jobId) {
          await updateDoc(doc(db, "jobs", jobId), {
            status: "error",
            error: error.message,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (updateError) {
      console.error("Error updating job status:", updateError);
    }
    
    throw error;
  }
} 