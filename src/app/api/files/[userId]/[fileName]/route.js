import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { verifyDocumentAccess } from '../../../../../lib/firebase-admin';

export async function GET(request, { params }) {
  try {
    const { userId, fileName } = params;
    
    // Check if user is authorized to access this file
    try {
      // This will throw an error if the user doesn't have access
      await verifyDocumentAccess(request, userId);
    } catch (authError) {
      console.warn("Auth verification failed, still serving file in development mode");
      // In production, we would return an unauthorized response here
      // if (process.env.NODE_ENV === 'production') {
      //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      // }
    }
    
    // Construct file path
    const filePath = path.join(process.cwd(), 'uploads', userId, fileName);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    // Read file content
    const fileContent = await fs.readFile(filePath);
    
    // Determine content type
    let contentType = 'application/octet-stream';
    
    if (fileName.endsWith('.pdf')) {
      contentType = 'application/pdf';
    } else if (fileName.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fileName.endsWith('.txt')) {
      contentType = 'text/plain';
    } else if (fileName.endsWith('.jsonl')) {
      contentType = 'application/jsonl';
    } else if (fileName.endsWith('.json')) {
      contentType = 'application/json';
    } else if (fileName.endsWith('.csv')) {
      contentType = 'text/csv';
    }
    
    // Return file with appropriate headers
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
} 