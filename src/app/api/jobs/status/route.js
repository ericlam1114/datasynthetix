import { NextResponse } from 'next/server';
import { db } from '@/firebase/admin';
import { verifyAuth } from '@/lib/auth-utils';

/**
 * GET handler for job status endpoint
 * Retrieves the status of a processing job by ID
 */
export async function GET(request) {
  // Authentication check
  try {
    const { user } = await verifyAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get job ID from query parameters
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Get job status from Firestore
    const jobDoc = await db.collection('processingJobs').doc(jobId).get();
    
    if (!jobDoc.exists) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    const jobData = jobDoc.data();
    
    // Verify that the job belongs to the current user
    if (jobData.userId !== user.uid) {
      return NextResponse.json(
        { error: 'Unauthorized access to job' },
        { status: 403 }
      );
    }

    // Return job status with appropriate calculated progress
    return NextResponse.json({
      id: jobId,
      ...jobData,
      // Calculate progress based on stage if not explicitly set
      progress: jobData.progress || calculateProgress(jobData.stage, jobData.status)
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve job status', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Helper function to calculate progress percentage based on stage
 * @param {string} stage - Current processing stage
 * @param {string} status - Current status (pending, processing, complete, error)
 * @returns {number} - Progress percentage (0-100)
 */
function calculateProgress(stage, status) {
  if (status === 'error') return 0;
  if (status === 'complete') return 100;
  
  // Default stage-based progress
  switch (stage) {
    case 'uploading':
      return 10;
    case 'extraction':
      return 30;
    case 'analyzing_structure':
      return 50;
    case 'data_generation':
      return 70;
    case 'saving':
      return 90;
    default:
      return 5;
  }
} 