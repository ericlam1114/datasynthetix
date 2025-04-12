import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { combineChunks } from '../utils';
import { getFirestore, serverTimestamp } from 'firebase/firestore';

/**
 * Finalizes a chunked upload by combining all chunks
 * @route POST /api/upload/finalize
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
    
    // Get upload ID from query parameters
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');
    
    if (!uploadId) {
      return NextResponse.json(
        { error: 'Missing upload ID' },
        { status: 400 }
      );
    }
    
    // Get the upload information from Firestore
    const db = getFirestore();
    const uploadSnapshot = await db.collection('uploads').doc(uploadId).get();
    
    if (!uploadSnapshot.exists) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }
    
    const uploadInfo = uploadSnapshot.data();
    
    // Verify user owns this upload
    if (uploadInfo.userId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    // Verify all chunks have been uploaded
    if (uploadInfo.uploadedChunks.length !== uploadInfo.totalChunks) {
      return NextResponse.json(
        { 
          error: 'Not all chunks have been uploaded',
          uploadedChunks: uploadInfo.uploadedChunks.length,
          totalChunks: uploadInfo.totalChunks
        },
        { status: 400 }
      );
    }
    
    // Create a job to track the finalization process
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    await db.collection('jobs').doc(jobId).set({
      id: jobId,
      userId: user.id,
      uploadId,
      status: 'processing',
      stage: 'combining_chunks',
      progress: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Start the finalization process in the background
    // This will not block the response
    combineChunks(uploadId, jobId, user.id, uploadInfo)
      .then(result => {
        console.log('Successfully finalized upload:', result);
      })
      .catch(error => {
        console.error('Error finalizing upload:', error);
      });
    
    // Return immediately with the job ID
    return NextResponse.json({
      success: true,
      uploadId,
      jobId,
      message: 'Finalization process started'
    });
  } catch (error) {
    console.error('Error finalizing upload:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 