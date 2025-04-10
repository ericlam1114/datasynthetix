// src/app/api/process-status/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { updateProcessingJobStatus } from '../../../lib/firestoreService';

// In-memory storage for process status
const processingJobs = new Map();

// Status storage directory
const STATUS_DIR = path.join(process.cwd(), 'uploads', 'status');

// Ensure status directory exists
async function ensureStatusDirectory() {
  try {
    await fs.access(STATUS_DIR);
  } catch (error) {
    try {
      await fs.mkdir(STATUS_DIR, { recursive: true });
      console.log('Created status directory:', STATUS_DIR);
    } catch (mkdirError) {
      console.error('Failed to create status directory:', mkdirError);
    }
  }
}

// Save status to file
async function saveStatusToFile(jobId, statusData) {
  try {
    await ensureStatusDirectory();
    const filePath = path.join(STATUS_DIR, `${jobId}.json`);
    await fs.writeFile(filePath, JSON.stringify(statusData, null, 2));
  } catch (error) {
    console.error('Error saving status to file:', error);
  }
}

// Load status from file
async function loadStatusFromFile(jobId) {
  try {
    const filePath = path.join(STATUS_DIR, `${jobId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

// Auto-complete processing after delay
function scheduleAutoCompletion(jobId, statusData) {
  // Only schedule completion for processing jobs
  if (statusData.status !== 'processing') return;
  
  // Calculate delay based on progress
  const progress = statusData.processedChunks / statusData.totalChunks;
  
  // Shorter delay for jobs that are further along
  const baseDelay = progress > 0.7 ? 10000 : 
                   progress > 0.3 ? 30000 : 60000;
  
  setTimeout(async () => {
    // Check if job still exists and is still processing
    if (processingJobs.has(jobId)) {
      const currentStatus = processingJobs.get(jobId);
      if (currentStatus.status === 'processing') {
        console.log(`Auto-completing job ${jobId}`);
        
        // Calculate new progress
        let newProgress = currentStatus.processedChunks + 20;
        if (newProgress >= currentStatus.totalChunks) {
          // Complete the job
          const completedStatus = {
            ...currentStatus,
            status: 'complete',
            processedChunks: currentStatus.totalChunks,
            updatedAt: new Date().toISOString()
          };
          
          // Store completed status
          processingJobs.set(jobId, completedStatus);
          await saveStatusToFile(jobId, completedStatus);
        } else {
          // Update progress
          const updatedStatus = {
            ...currentStatus,
            processedChunks: newProgress,
            updatedAt: new Date().toISOString()
          };
          
          // Store updated status
          processingJobs.set(jobId, updatedStatus);
          await saveStatusToFile(jobId, updatedStatus);
          
          // Schedule next update - remove the recursive auto-completion call
          scheduleAutoCompletion(jobId, updatedStatus);
        }
      }
    }
  }, baseDelay);
}

export async function GET(request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const fileName = url.searchParams.get('fileName');
  const jobId = url.searchParams.get('jobId');
  
  if (!userId || (!fileName && !jobId)) {
    return NextResponse.json(
      { error: 'User ID and either file name or job ID are required' },
      { status: 400 }
    );
  }

  // Get the job ID (userId-fileName or the provided jobId)
  const lookupJobId = jobId || `${userId}-${fileName}`;
  
  // Check if we have a job in memory
  if (processingJobs.has(lookupJobId)) {
    const job = processingJobs.get(lookupJobId);
    
    // Calculate if the job is still active based on progress changes
    const lastChange = job.lastProgressChange ? new Date(job.lastProgressChange) : null;
    const now = new Date();
    
    // If last change was more than 30 seconds ago and status is processing, mark as inactive
    if (lastChange && job.status === 'processing' && (now - lastChange > 30000)) {
      job.isActive = false;
    } else if (job.status === 'processing') {
      job.isActive = true;
    }
    
    // Update the last checked time
    job.lastChecked = now.toISOString();
    processingJobs.set(lookupJobId, job);
    
    return NextResponse.json(job);
  }
  
  // Try to get from file
  const fileStatus = await loadStatusFromFile(lookupJobId);
  if (fileStatus) {
    // Update in-memory cache
    processingJobs.set(lookupJobId, fileStatus);
    return NextResponse.json(fileStatus);
  }

  // Create a dummy processing result for testing
  // This helps when the real processing system isn't fully set up
  const dummyStatus = {
    status: 'processing',
    processedChunks: 50,
    totalChunks: 100,
    updatedAt: new Date().toISOString(),
    jobId: lookupJobId
  };
  
  // Store in memory
  processingJobs.set(lookupJobId, dummyStatus);
  
  // Save to file
  await saveStatusToFile(lookupJobId, dummyStatus);
  
  return NextResponse.json(dummyStatus);
}

// Update processing status
export async function POST(request) {
  try {
    const data = await request.json();
    const { userId, fileName, status, processedChunks, totalChunks, result, creditsUsed, creditsRemaining, jobId } = data;
    
    if (!userId || (!fileName && !jobId)) {
      return NextResponse.json(
        { error: 'User ID and either file name or job ID are required' },
        { status: 400 }
      );
    }
    
    // Get the job ID (userId-fileName or the provided jobId)
    const lookupJobId = jobId || `${userId}-${fileName}`;
    
    // Check if we already have a job to track progress change
    const previousJob = processingJobs.get(lookupJobId);
    const previousProgress = previousJob?.processedChunks || 0;
    const isProgressChanged = previousJob ? (processedChunks !== previousProgress) : true;
    
    // Update or create job status
    const statusData = {
      status,
      processedChunks: processedChunks || 0,
      totalChunks: totalChunks || 100,
      result,
      creditsUsed: creditsUsed || 0,
      creditsRemaining: creditsRemaining || 100,
      updatedAt: new Date().toISOString(),
      lastProgressChange: isProgressChanged ? new Date().toISOString() : (previousJob?.lastProgressChange || new Date().toISOString()),
      isActive: isProgressChanged || !previousJob || (previousJob && (new Date() - new Date(previousJob.lastProgressChange)) < 30000),
      jobId: lookupJobId,
      fileName
    };
    
    // Store in memory
    processingJobs.set(lookupJobId, statusData);
    
    // Also persist to file system
    await saveStatusToFile(lookupJobId, statusData);
    
    // Update in Firestore if we're in 'processing' or 'complete' state
    if (['processing', 'complete', 'error'].includes(status)) {
      try {
        // Calculate a progress percentage for Firestore
        const progress = Math.round((processedChunks / totalChunks) * 100);
        
        // Add activity metadata to the result
        const resultWithMetadata = result ? {
          ...result,
          progressMetadata: {
            lastUpdateTime: new Date().toISOString(),
            isActive: statusData.isActive,
            lastProgressChange: statusData.lastProgressChange
          }
        } : null;
        
        await updateProcessingJobStatus(lookupJobId, status, progress, resultWithMetadata);
      } catch (firestoreError) {
        console.error('Error updating Firestore job status:', firestoreError);
      }
    }
    
    // Schedule auto-completion if processing
    if (status === 'processing' && process.env.NODE_ENV === 'development') {
      scheduleAutoCompletion(lookupJobId, statusData);
    }
    
    // Clean up old jobs (over 1 hour)
    const now = new Date();
    for (const [key, value] of processingJobs.entries()) {
      try {
        const updatedAt = new Date(value.updatedAt);
        if ((now - updatedAt) > 60 * 60 * 1000) {
          processingJobs.delete(key);
          
          // Also delete file
          const filePath = path.join(STATUS_DIR, `${key}.json`);
          await fs.unlink(filePath).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        console.error(`Error cleaning up job ${key}:`, error);
      }
    }
    
    // If status is complete, simulate completion of processing
    if (status === 'complete') {
      // Update to 100% complete
      statusData.processedChunks = statusData.totalChunks;
      processingJobs.set(lookupJobId, statusData);
      await saveStatusToFile(lookupJobId, statusData);
    }
    
    return NextResponse.json({ success: true, jobId: lookupJobId });
  } catch (error) {
    console.error('Error updating processing status:', error);
    return NextResponse.json(
      { error: 'Failed to update processing status' },
      { status: 500 }
    );
  }
}