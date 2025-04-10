// src/app/api/process-document-direct/route.js
import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../../lib/firebase';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId');
    const documentId = formData.get('documentId');
    
    if (!documentId || !userId) {
      return NextResponse.json(
        { error: 'Document ID and user ID are required' },
        { status: 400 }
      );
    }

    // Get document data from Firestore
    const docRef = doc(firestore, 'documents', documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    const documentData = docSnap.data();
    
    // Verify the document belongs to the user
    if (documentData.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized access to document' },
        { status: 403 }
      );
    }
    
    // Return success and navigate to the process page programmatically
    return NextResponse.json({
      success: true,
      message: 'Document processing started',
      redirect: `/dashboard/process?documentId=${documentId}&autoStart=true`
    });
    
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json(
      { error: 'Failed to process document: ' + error.message },
      { status: 500 }
    );
  }
}