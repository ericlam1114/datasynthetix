// src/app/api/process-status/route.js
import { NextResponse } from 'next/server';

// In-memory storage for process status (would use a database in production)
const processingJobs = new Map();

export async function GET(request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const fileName = url.searchParams.get('fileName');
  
  if (!userId || !fileName) {
    return NextResponse.json(
      { error: 'User ID and file name are required' },
      { status: 400 }
    );
  }

  // Get the job ID (userId-fileName)
  const jobId = `${userId}-${fileName}`;
  
  // Check if we have a job in memory
  if (processingJobs.has(jobId)) {
    return NextResponse.json(processingJobs.get(jobId));
  }
  
  // If job not found in memory, return a default response
  // In the future, you might want to check database or filesystem
  return NextResponse.json({
    status: 'not_found',
    error: 'Processing job not found'
  }, { status: 404 });
}

// Update processing status
export async function POST(request) {
  try {
    const data = await request.json();
    const { userId, fileName, status, processedChunks, totalChunks, result, creditsUsed, creditsRemaining } = data;
    
    if (!userId || !fileName) {
      return NextResponse.json(
        { error: 'User ID and file name are required' },
        { status: 400 }
      );
    }
    
    // Get the job ID (userId-fileName)
    const jobId = `${userId}-${fileName}`;
    
    // Update or create job status
    processingJobs.set(jobId, {
      status,
      processedChunks,
      totalChunks,
      result,
      creditsUsed,
      creditsRemaining,
      updatedAt: new Date().toISOString()
    });
    
    // Clean up old jobs (over 1 hour)
    const now = new Date();
    for (const [key, value] of processingJobs.entries()) {
      const updatedAt = new Date(value.updatedAt);
      if ((now - updatedAt) > 60 * 60 * 1000) {
        processingJobs.delete(key);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating processing status:', error);
    return NextResponse.json(
      { error: 'Failed to update processing status' },
      { status: 500 }
    );
  }
}