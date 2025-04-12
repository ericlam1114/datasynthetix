import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getDatasetDownloadUrl } from '@/utils/datasetService';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

/**
 * Get download URL for a dataset
 * @route GET /api/datasets/download
 */
export async function GET(request) {
  try {
    // Authenticate the user
    const { user, error } = await verifyAuth(request);
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get dataset ID from query parameters
    const url = new URL(request.url);
    const datasetId = url.searchParams.get('id');

    if (!datasetId) {
      return NextResponse.json(
        { error: 'Missing dataset ID' },
        { status: 400 }
      );
    }

    // Verify the dataset exists and belongs to the user
    const db = getFirestore();
    const datasetDoc = await getDoc(doc(db, 'datasets', datasetId));

    if (!datasetDoc.exists()) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const dataset = datasetDoc.data();

    // Check if the dataset belongs to the user
    if (dataset.userId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if jsonlUrl already exists
    if (dataset.jsonlUrl) {
      return NextResponse.json({
        success: true,
        downloadUrl: dataset.jsonlUrl,
        fileName: `dataset-${datasetId}.jsonl`
      });
    }

    // Generate a download URL
    const downloadUrl = await getDatasetDownloadUrl(datasetId, user.id);

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: `dataset-${datasetId}.jsonl`
    });
  } catch (error) {
    console.error('Error getting dataset download URL:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 