import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter is required' },
        { status: 400 }
      );
    }
    
    // Check the uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const userDir = path.join(uploadsDir, userId);
    const statusDir = path.join(uploadsDir, 'status');
    
    // List files in directories
    let files = {
      uploads: [],
      userDir: [],
      status: []
    };
    
    try {
      files.uploads = await fs.readdir(uploadsDir);
    } catch (error) {
      console.error('Error reading uploads directory:', error);
    }
    
    try {
      files.userDir = await fs.readdir(userDir);
    } catch (error) {
      console.error(`Error reading user directory for ${userId}:`, error);
    }
    
    try {
      files.status = await fs.readdir(statusDir);
    } catch (error) {
      console.error('Error reading status directory:', error);
    }
    
    // Get contents of the most recent status file
    let latestStatus = null;
    if (files.status.length > 0) {
      const jobStatusFiles = files.status.filter(file => file.includes(userId) || file.includes('job-'));
      
      if (jobStatusFiles.length > 0) {
        const latestFile = jobStatusFiles[jobStatusFiles.length - 1];
        const statusContent = await fs.readFile(path.join(statusDir, latestFile), 'utf8');
        latestStatus = {
          filename: latestFile,
          content: JSON.parse(statusContent)
        };
      }
    }
    
    return NextResponse.json({
      directories: files,
      latestStatus
    });
  } catch (error) {
    console.error('Error getting debug files:', error);
    return NextResponse.json(
      { error: 'Failed to get debug files: ' + error.message },
      { status: 500 }
    );
  }
}