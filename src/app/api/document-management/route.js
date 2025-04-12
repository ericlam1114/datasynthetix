import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase admin
const firebaseAdmin = getFirebaseAdmin();
const db = firebaseAdmin.firestore();
const bucket = firebaseAdmin.storage().bucket();

// Initialize AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Get document and job information
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const documentId = searchParams.get('documentId');
    
    // If documentId is provided, return specific document
    if (documentId) {
      const docRef = await db.collection('documents').doc(documentId).get();
      
      if (!docRef.exists) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      
      // Check if document belongs to user
      const docData = docRef.data();
      if (docData.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      
      return NextResponse.json({ document: docData });
    }
    
    // Return all documents for user
    const docsSnapshot = await db.collection('documents')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const documents = [];
    docsSnapshot.forEach(doc => {
      documents.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Get active jobs
    const jobsSnapshot = await db.collection('jobs')
      .where('userId', '==', userId)
      .where('status', 'in', ['pending', 'processing'])
      .get();
    
    const activeJobs = [];
    jobsSnapshot.forEach(job => {
      activeJobs.push({
        id: job.id,
        ...job.data()
      });
    });
    
    return NextResponse.json({ 
      documents, 
      activeJobs,
      totalCount: documents.length
    });
  } catch (error) {
    console.error('Error retrieving documents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Delete document and associated data
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const userId = searchParams.get('userId');
    const includeDatasets = searchParams.get('includeDatasets') === 'true';
    
    if (!documentId || !userId) {
      return NextResponse.json({ error: 'Document ID and User ID are required' }, { status: 400 });
    }
    
    // Verify document exists and belongs to user
    const docRef = db.collection('documents').doc(documentId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    const docData = doc.data();
    if (docData.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized to delete this document' }, { status: 403 });
    }
    
    // Find and cancel any active jobs for this document
    const jobsQuery = await db.collection('jobs')
      .where('documentId', '==', documentId)
      .where('status', 'in', ['pending', 'processing'])
      .get();
    
    const cancelJobPromises = [];
    jobsQuery.forEach(job => {
      cancelJobPromises.push(
        db.collection('jobs').doc(job.id).update({ 
          status: 'cancelled',
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
          statusMessage: 'Cancelled due to document deletion'
        })
      );
    });
    
    // Delete from Firebase Storage if exists
    if (docData.storagePath) {
      try {
        await bucket.file(docData.storagePath).delete();
      } catch (storageError) {
        console.warn(`Failed to delete file from Firebase Storage: ${storageError.message}`);
      }
    }
    
    // Delete from S3 if exists
    if (docData.s3Key) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: docData.s3Key
        }));
      } catch (s3Error) {
        console.warn(`Failed to delete file from S3: ${s3Error.message}`);
      }
    }
    
    // Find and delete associated datasets if requested
    if (includeDatasets) {
      const datasetsQuery = await db.collection('datasets')
        .where('documentId', '==', documentId)
        .get();
      
      const deleteDatasetPromises = [];
      datasetsQuery.forEach(dataset => {
        deleteDatasetPromises.push(db.collection('datasets').doc(dataset.id).delete());
      });
      
      await Promise.all(deleteDatasetPromises);
    }
    
    // Delete the document record
    await docRef.delete();
    
    // Execute all cancellation operations
    await Promise.all(cancelJobPromises);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Document and associated resources deleted successfully',
      deleted: {
        documentId,
        jobsCancelled: cancelJobPromises.length,
        datasetsDeleted: includeDatasets ? 'All associated datasets' : 'None (not requested)'
      }
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Cancel a specific job
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { jobId, userId, action } = body;
    
    if (!jobId || !userId || !action) {
      return NextResponse.json({ 
        error: 'Job ID, User ID and action are required' 
      }, { status: 400 });
    }
    
    // Handle different actions
    if (action === 'cancel') {
      // Verify job exists and belongs to user
      const jobRef = db.collection('jobs').doc(jobId);
      const job = await jobRef.get();
      
      if (!job.exists) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      
      const jobData = job.data();
      if (jobData.userId !== userId) {
        return NextResponse.json({ 
          error: 'Unauthorized to cancel this job' 
        }, { status: 403 });
      }
      
      // Only cancel if job is pending or processing
      if (!['pending', 'processing'].includes(jobData.status)) {
        return NextResponse.json({ 
          error: `Cannot cancel job with status: ${jobData.status}` 
        }, { status: 400 });
      }
      
      // Update job status
      await jobRef.update({
        status: 'cancelled',
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        statusMessage: 'Cancelled by user'
      });
      
      return NextResponse.json({ 
        success: true, 
        message: 'Job cancelled successfully',
        jobId
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 