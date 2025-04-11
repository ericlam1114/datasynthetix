import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import { 
  doc, 
  getDoc, 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  getStorage 
} from 'firebase/storage';
import { verifyAuthToken } from '../../../lib/auth-helpers';
import { auth } from '../../../lib/firebase';

// Create temporary directory for file processing
const TEMP_DIR = path.join(process.cwd(), 'tmp');

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.access(TEMP_DIR);
  } catch (error) {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
}

export async function POST(request) {
  console.log('Document splitting API called');
  
  try {
    // Step 1: Authenticate the user
    const user = await verifyAuthToken(request, auth);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Step 2: Parse the form data
    const formData = await request.formData();
    const documentId = formData.get('documentId');
    const numParts = parseInt(formData.get('numParts') || '2', 10);
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }
    
    console.log(`Splitting document: ${documentId} into ${numParts} parts`);
    
    // Step 3: Retrieve the document from Firestore
    const db = getFirestore();
    const docRef = doc(db, "documents", documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    const documentData = docSnap.data();
    
    // Check if document belongs to the authenticated user
    if (documentData.userId !== user.uid) {
      return NextResponse.json({ error: 'Not authorized to access this document' }, { status: 403 });
    }
    
    // Step 4: Get the PDF file from storage
    let pdfBuffer = null;
    
    if (documentData.filePath) {
      try {
        const storage = getStorage();
        const fileRef = ref(storage, documentData.filePath);
        const downloadUrl = await getDownloadURL(fileRef);
        
        // Download the file
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }
        
        pdfBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`Successfully downloaded PDF, size: ${pdfBuffer.length} bytes`);
      } catch (error) {
        console.error('Error downloading PDF from storage:', error);
        return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Document has no file path' }, { status: 400 });
    }
    
    // Step 5: Split the PDF
    await ensureTempDir();
    
    try {
      console.log('Loading PDF document...');
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      console.log(`PDF has ${pageCount} pages, splitting into ${numParts} parts`);
      
      // Calculate pages per part (at least 1 page per part)
      const pagesPerPart = Math.max(1, Math.ceil(pageCount / numParts));
      
      // Set up storage for the parts
      const storage = getStorage();
      const parts = [];
      
      // Process each part
      for (let i = 0; i < numParts; i++) {
        const startPage = i * pagesPerPart;
        let endPage = Math.min((i + 1) * pagesPerPart - 1, pageCount - 1);
        
        // Skip if we've run out of pages
        if (startPage >= pageCount) break;
        
        console.log(`Creating part ${i+1}: pages ${startPage} to ${endPage}`);
        
        // Create a new PDF document
        const newPdf = await PDFDocument.create();
        
        // Copy pages from the original
        const pageIndexes = [];
        for (let j = startPage; j <= endPage; j++) {
          pageIndexes.push(j);
        }
        
        const copiedPages = await newPdf.copyPages(pdfDoc, pageIndexes);
        
        // Add the copied pages to the new document
        copiedPages.forEach(page => {
          newPdf.addPage(page);
        });
        
        // Save the new PDF
        const newPdfBytes = await newPdf.save();
        const fileName = `${path.basename(documentData.fileName || 'document', '.pdf')}_part_${i+1}_of_${numParts}.pdf`;
        const filePath = path.join(TEMP_DIR, fileName);
        
        // Write to temp directory
        await fs.writeFile(filePath, Buffer.from(newPdfBytes));
        console.log(`Saved part ${i+1} to ${filePath}`);
        
        // Upload to Firebase Storage
        const storagePath = `documents/${user.uid}/${fileName}`;
        const fileRef = ref(storage, storagePath);
        
        await uploadBytes(fileRef, Buffer.from(newPdfBytes), {
          contentType: 'application/pdf'
        });
        
        console.log(`Uploaded part ${i+1} to ${storagePath}`);
        
        // Get download URL
        const downloadURL = await getDownloadURL(fileRef);
        
        // Create a document record in Firestore
        const docRef = await addDoc(collection(db, "documents"), {
          userId: user.uid,
          name: fileName,
          fileName,
          filePath: storagePath,
          downloadUrl: downloadURL,
          contentType: 'application/pdf',
          fileSize: newPdfBytes.length,
          originalDocumentId: documentId,
          partInfo: {
            partNumber: i + 1,
            totalParts: numParts,
            startPage,
            endPage,
            pageCount: endPage - startPage + 1
          },
          totalPages: endPage - startPage + 1,
          createdAt: serverTimestamp(),
          status: 'ready'
        });
        
        // Update with document ID
        const id = docRef.id;
        
        // Add to parts list
        parts.push({
          id,
          name: fileName,
          pages: endPage - startPage + 1,
          size: newPdfBytes.length,
          downloadUrl: downloadURL
        });
        
        console.log(`Created Firestore record for part ${i+1}: ${id}`);
      }
      
      // Return success with parts information
      return NextResponse.json({
        success: true,
        message: `Document split into ${parts.length} parts`,
        parts
      });
    } catch (error) {
      console.error('Error splitting PDF:', error);
      return NextResponse.json({ error: 'Failed to split document: ' + error.message }, { status: 500 });
    }
  } catch (error) {
    console.error('Document splitting error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

// Helper functions
async function verifyAuthTokenHelper(request, auth) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split('Bearer ')[1];
    if (!token) {
      return null;
    }
    
    // Verify token with Firebase
    return await auth.verifyIdToken(token);
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
} 