import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../lib/firebase-admin';
import { saveDocumentToStorage } from '../process-document/utils/storage';

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Handles file uploads, supporting both direct form uploads and chunked uploads
 * Stores files in Firebase Storage or S3 and tracks progress
 */
export async function POST(request) {
  try {
    // Verify authentication
    const { user, error } = await verifyAuth(request);
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.uid;
    
    // Check if it's a multipart form data request
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle regular file upload
      const formData = await request.formData();
      const file = formData.get('file');
      
      // Validate file
      if (!file || !file.size) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
          { status: 400 }
        );
      }
      
      // Get metadata from form
      const metadata = {
        name: formData.get('name') || file.name,
        description: formData.get('description') || '',
        fileName: file.name
      };
      
      // Save document to storage (Firebase, S3, or local fallback)
      const { documentId, fileUrl } = await saveDocumentToStorage(file, userId, metadata);
      
      // Create job entry to track processing
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Use Firebase Admin to create a job document
      const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
      const db = admin.getFirestore();
      
      await db.collection('jobs').doc(jobId).set({
        documentId,
        userId,
        status: 'uploaded',
        progress: 10,
        createdAt: admin.FieldValue.serverTimestamp(),
        updatedAt: admin.FieldValue.serverTimestamp()
      });
      
      return NextResponse.json({
        success: true,
        documentId,
        fileUrl,
        jobId,
        message: 'File uploaded successfully'
      });
    } 
    else if (contentType.includes('application/json')) {
      // Handle chunk upload request or initial chunk upload setup
      const { action, fileName, fileType, fileSize, totalChunks } = await request.json();
      
      if (action === 'init') {
        // Initialize a chunked upload
        if (!fileName || !fileType || !fileSize || !totalChunks) {
          return NextResponse.json(
            { error: 'Missing required parameters for chunked upload' },
            { status: 400 }
          );
        }
        
        // Check total file size
        if (fileSize > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
            { status: 400 }
          );
        }
        
        // Generate upload ID for this chunked upload
        const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        
        // Store upload metadata in Firestore
        const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
        const db = admin.getFirestore();
        
        await db.collection('uploads').doc(uploadId).set({
          userId,
          fileName,
          fileType,
          fileSize,
          totalChunks,
          uploadedChunks: 0,
          status: 'initialized',
          createdAt: admin.FieldValue.serverTimestamp(),
          updatedAt: admin.FieldValue.serverTimestamp()
        });
        
        return NextResponse.json({
          success: true,
          uploadId,
          message: 'Chunked upload initialized'
        });
      }
      
      // Handle other JSON requests
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }
    else {
      // Invalid content type
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 415 }
      );
    }
  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * Handles chunk uploads for large files
 * Each chunk is sent as a separate PUT request
 */
export async function PUT(request) {
  try {
    // Verify authentication
    const { user, error } = await verifyAuth(request);
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.uid;
    
    // Get upload ID and chunk index from URL
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');
    const chunkIndex = url.searchParams.get('chunk');
    
    if (!uploadId || chunkIndex === null) {
      return NextResponse.json(
        { error: 'Missing uploadId or chunk index' },
        { status: 400 }
      );
    }
    
    // Get chunk data
    const chunkData = await request.arrayBuffer();
    
    // Get upload info from Firestore
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const db = admin.getFirestore();
    const uploadDoc = await db.collection('uploads').doc(uploadId).get();
    
    if (!uploadDoc.exists) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }
    
    const uploadInfo = uploadDoc.data();
    
    // Verify user owns this upload
    if (uploadInfo.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    // Save chunk to temporary storage
    const storage = admin.getStorage();
    const bucket = storage.bucket();
    const chunkPath = `temp/${uploadId}/chunk-${chunkIndex}`;
    const file = bucket.file(chunkPath);
    
    await file.save(Buffer.from(chunkData), {
      metadata: {
        contentType: 'application/octet-stream',
        metadata: {
          uploadId,
          chunkIndex,
          userId
        }
      }
    });
    
    // Update upload document with progress
    const uploadedChunks = uploadInfo.uploadedChunks + 1;
    const progress = Math.round((uploadedChunks / uploadInfo.totalChunks) * 100);
    
    await db.collection('uploads').doc(uploadId).update({
      uploadedChunks,
      progress,
      status: uploadedChunks === uploadInfo.totalChunks ? 'completed' : 'in-progress',
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // If this was the last chunk, combine all chunks into a single file
    if (uploadedChunks === uploadInfo.totalChunks) {
      // Create a job to process the combined file
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      await db.collection('jobs').doc(jobId).set({
        uploadId,
        userId,
        status: 'combining',
        progress: 5,
        createdAt: admin.FieldValue.serverTimestamp(),
        updatedAt: admin.FieldValue.serverTimestamp()
      });
      
      // Start async job to combine chunks
      combineChunks(uploadId, jobId, userId, uploadInfo).catch(console.error);
      
      return NextResponse.json({
        success: true,
        uploadId,
        jobId,
        status: 'completed',
        message: 'All chunks uploaded, combining in progress'
      });
    }
    
    return NextResponse.json({
      success: true,
      uploadId,
      chunkIndex,
      progress,
      uploaded: uploadedChunks,
      total: uploadInfo.totalChunks
    });
  } catch (error) {
    console.error('Error handling chunk upload:', error);
    return NextResponse.json(
      { error: `Chunk upload failed: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * Combines uploaded chunks into a single file and saves to final storage
 * This function runs asynchronously after all chunks are uploaded
 */
async function combineChunks(uploadId, jobId, userId, uploadInfo) {
  try {
    // Import required modules
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const db = admin.getFirestore();
    const storage = admin.getStorage();
    const bucket = storage.bucket();
    
    // Update job status
    await db.collection('jobs').doc(jobId).update({
      status: 'processing',
      progress: 10,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // List all chunks
    const [files] = await bucket.getFiles({ prefix: `temp/${uploadId}/` });
    
    if (!files || files.length === 0) {
      throw new Error('No chunks found');
    }
    
    // Sort files by chunk index
    files.sort((a, b) => {
      const indexA = parseInt(a.name.split('-').pop());
      const indexB = parseInt(b.name.split('-').pop());
      return indexA - indexB;
    });
    
    // Create writable stream for final file
    const finalPath = `documents/${userId}/${uploadInfo.fileName}`;
    const finalFile = bucket.file(finalPath);
    const writeStream = finalFile.createWriteStream({
      metadata: {
        contentType: uploadInfo.fileType,
        metadata: {
          userId,
          uploadId,
          originalName: uploadInfo.fileName
        }
      }
    });
    
    // Update job status
    await db.collection('jobs').doc(jobId).update({
      status: 'combining',
      progress: 20,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Read and write each chunk in sequence
    for (let i = 0; i < files.length; i++) {
      const progress = 20 + Math.floor((i / files.length) * 60);
      
      // Download chunk
      const [chunkData] = await files[i].download();
      
      // Write chunk to final file
      await new Promise((resolve, reject) => {
        writeStream.write(chunkData, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Update job status
      await db.collection('jobs').doc(jobId).update({
        progress,
        updatedAt: admin.FieldValue.serverTimestamp()
      });
    }
    
    // Close write stream
    await new Promise((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Generate download URL
    const [url] = await finalFile.getSignedUrl({
      action: 'read',
      expires: '03-01-2500' // Far future
    });
    
    // Create document entry in Firestore
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    await db.collection('documents').doc(documentId).set({
      id: documentId,
      userId,
      name: uploadInfo.fileName,
      description: '',
      fileName: uploadInfo.fileName,
      fileType: uploadInfo.fileType,
      fileSize: uploadInfo.fileSize,
      fileUrl: url,
      filePath: finalPath,
      storageType: 'firebase',
      createdAt: admin.FieldValue.serverTimestamp(),
      updatedAt: admin.FieldValue.serverTimestamp(),
    });
    
    // Update job status
    await db.collection('jobs').doc(jobId).update({
      documentId,
      status: 'completed',
      progress: 100,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    // Delete temporary chunks
    await Promise.all(files.map(file => file.delete()));
    
    // Delete upload document or mark as processed
    await db.collection('uploads').doc(uploadId).update({
      status: 'processed',
      documentId,
      fileUrl: url,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
    
    console.log(`Successfully combined chunks for upload ${uploadId} into document ${documentId}`);
  } catch (error) {
    console.error(`Error combining chunks for upload ${uploadId}:`, error);
    
    // Update job status with error
    const admin = await import('firebase-admin/app').then(() => import('firebase-admin/firestore'));
    const db = admin.getFirestore();
    
    await db.collection('jobs').doc(jobId).update({
      status: 'error',
      error: error.message,
      updatedAt: admin.FieldValue.serverTimestamp()
    });
  }
} 