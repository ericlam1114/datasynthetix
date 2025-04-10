// src/app/api/process-status/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getDoc, doc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

// Store processing status in memory (would use a database in production)
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
    const jobStatus = processingJobs.get(jobId);
    
    // Add user's current credits
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().credits !== undefined) {
        jobStatus.creditsRemaining = userDoc.data().credits;
      }
    } catch (error) {
      console.error('Error getting user credits:', error);
    }
    
    return NextResponse.json(jobStatus);
  }
  
  // If no job found, check if the job is already complete
  const jsonlFileName = `${path.basename(fileName, path.extname(fileName))}_processed.jsonl`;
  const userUploadsDir = path.join(process.cwd(), 'api/uploads', userId);
  const jsonlFilePath = path.join(userUploadsDir, jsonlFileName);
  
  try {
    // Check if the JSONL file exists
    await fs.access(jsonlFilePath);
    
    // File exists, count the number of entries
    const fileContent = await fs.readFile(jsonlFilePath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const resultCount = lines.length;
    
    // Get classification stats
    const classificationStats = { Critical: 0, Important: 0, Standard: 0 };
    
    try {
      for (const line of lines.slice(0, Math.min(100, lines.length))) {
        const entry = JSON.parse(line);
        if (entry.classification && classificationStats[entry.classification] !== undefined) {
          classificationStats[entry.classification]++;
        }
      }
    } catch (error) {
      console.error('Error parsing JSONL for classification stats:', error);
    }
    
    // Get user's current credits
    let creditsRemaining = 0;
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().credits !== undefined) {
        creditsRemaining = userDoc.data().credits;
      }
    } catch (error) {
      console.error('Error getting user credits:', error);
    }
    
    // Return complete status
    return NextResponse.json({
      status: 'complete',
      result: {
        fileName: jsonlFileName,
        filePath: `${userId}/${jsonlFileName}`,
        resultCount,
        classificationStats
      },
      creditsRemaining
    });
  } catch (error) {
    // File doesn't exist or error accessing it
    return NextResponse.json({
      status: 'not_found',
      error: 'Processing job not found'
    }, { status: 404 });
  }
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