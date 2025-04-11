import { NextResponse } from 'next/server';
import { verifyAuth } from '@/app/api/auth/auth-utils';
import { createChunkedUpload } from '../utils';

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Initializes a chunked upload
 * @route POST /api/upload/init
 */
export async function POST(request) {
  try {
    // Verify user is authenticated
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { filename, contentType, fileSize, chunkSize = DEFAULT_CHUNK_SIZE } = body;
    
    // Validate required fields
    if (!filename || !contentType || !fileSize) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file type (PDF only for now)
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Only PDF files are allowed.' },
        { status: 400 }
      );
    }

    // Create upload job
    const upload = await createChunkedUpload(
      authResult.user.uid,
      filename,
      contentType,
      fileSize,
      chunkSize
    );

    // Return upload info
    return NextResponse.json({
      success: true,
      uploadId: upload.uploadId,
      chunkSize: upload.chunkSize,
      totalChunks: upload.totalChunks
    });
  } catch (error) {
    console.error('Error initializing upload:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
} 