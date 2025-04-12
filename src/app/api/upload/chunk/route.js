import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { uploadChunk } from '@/utils/uploadService';

/**
 * API endpoint for uploading a chunk of a file
 * @param {Request} request - The request object
 * @returns {Promise<NextResponse>} - The response
 */
export async function POST(request) {
  try {
    // Authenticate the user
    const { user, error: authError } = await verifyAuth(request);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authError },
        { status: 401 }
      );
    }

    // Get upload ID and chunk index from query parameters
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('uploadId');
    const chunkIndex = url.searchParams.get('chunkIndex');

    if (!uploadId) {
      return NextResponse.json(
        { error: 'Missing upload ID' },
        { status: 400 }
      );
    }

    if (!chunkIndex || isNaN(parseInt(chunkIndex))) {
      return NextResponse.json(
        { error: 'Missing or invalid chunk index' },
        { status: 400 }
      );
    }

    // Get chunk data from request
    const formData = await request.formData();
    const chunkFile = formData.get('chunk');

    if (!chunkFile) {
      return NextResponse.json(
        { error: 'No chunk file provided' },
        { status: 400 }
      );
    }

    // Process the chunk upload
    const result = await uploadChunk({
      uploadId,
      chunkIndex: parseInt(chunkIndex),
      chunkData: chunkFile,
      userId: user.id
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}