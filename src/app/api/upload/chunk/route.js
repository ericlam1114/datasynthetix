import { NextResponse } from 'next/server';
import { verifyAuth } from '@/app/api/auth/auth-utils';
import { db } from '@/firebase-admin';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import os from 'os';
import { combineChunks } from '../utils';

/**
 * Upload a chunk of a file
 * @route POST /api/upload/chunk
 */
export async function POST(request) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get upload ID and chunk index from query params
    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');
    const chunkIndex = parseInt(searchParams.get('chunkIndex'));

    if (!uploadId || isNaN(chunkIndex)) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get upload details
    const uploadRef = db.collection('uploads').doc(uploadId);
    const uploadDoc = await uploadRef.get();
    
    if (!uploadDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Upload not found' },
        { status: 404 }
      );
    }
    
    const upload = uploadDoc.data();
    
    // Verify user owns this upload
    if (upload.userId !== authResult.user.uid) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= upload.totalChunks) {
      return NextResponse.json(
        { success: false, error: `Invalid chunk index: ${chunkIndex}. Expected 0-${upload.totalChunks - 1}` },
        { status: 400 }
      );
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'uploads', uploadId);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Save chunk to temp file
    const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file in request' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const readableStream = Readable.from(buffer);
    const writeStream = fs.createWriteStream(chunkPath);
    
    try {
      await pipeline(readableStream, writeStream);
    } catch (error) {
      console.error('Error saving chunk:', error);
      return NextResponse.json(
        { success: false, error: `Failed to save chunk: ${error.message}` },
        { status: 500 }
      );
    }
    
    // Get existing uploaded chunks and update to add this one
    // Make sure we don't add duplicates
    const existingChunks = upload.uploadedChunks || [];
    if (!existingChunks.includes(chunkIndex)) {
      existingChunks.push(chunkIndex);
    }
    
    // Update upload record
    await uploadRef.update({
      uploadedChunks: existingChunks,
      updatedAt: new Date()
    });

    // Check if all chunks are uploaded
    const updatedUploadDoc = await uploadRef.get();
    const updatedUpload = updatedUploadDoc.data();
    
    let result = {
      success: true,
      uploadId,
      chunkIndex,
      chunksReceived: updatedUpload.uploadedChunks.length,
      totalChunks: updatedUpload.totalChunks,
      progress: Math.round((updatedUpload.uploadedChunks.length / updatedUpload.totalChunks) * 100)
    };
    
    // If all chunks uploaded, trigger combination
    if (updatedUpload.uploadedChunks.length === updatedUpload.totalChunks) {
      // Update upload status
      await uploadRef.update({
        status: 'uploaded',
        updatedAt: new Date()
      });
      
      result.status = 'complete';
      result.message = 'All chunks received. File processing will begin.';
      
      // Start an asynchronous job to combine chunks
      combineChunksAndProcess(uploadId).catch(error => {
        console.error('Error processing upload:', error);
        // No await here as this is fire-and-forget
        uploadRef.update({
          status: 'failed',
          error: error.message,
          updatedAt: new Date()
        });
      });
    } else {
      result.status = 'in-progress';
      result.message = `Chunk ${chunkIndex} received. ${updatedUpload.uploadedChunks.length} of ${updatedUpload.totalChunks} chunks received.`;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error handling chunk upload:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function combineChunksAndProcess(uploadId) {
  try {
    await combineChunks(uploadId);
  } catch (error) {
    console.error(`Error combining chunks for upload ${uploadId}:`, error);
    throw error;
  }
} 