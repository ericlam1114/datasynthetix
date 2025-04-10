// src/app/api/process-document/route.js
import '@ungap/with-resolvers'; // Polyfill for Promise.withResolvers
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  serverTimestamp,
  collection,
  setDoc,
  addDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from '../../../lib/firebase';
import { initializeAdminApp, getAdminFirestore, getAdminStorage, verifyDocumentAccess } from '../../../lib/firebase-admin'; // Import admin Firebase app and admin Firestore
import { addDataSet } from '../../../lib/firestoreService';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import { auth } from '../../../lib/firebase';

// Dynamically import Firebase Admin Auth - this prevents build errors if the module is not available
let adminAuthModule;
try {
  adminAuthModule = require('firebase-admin/auth');
} catch (error) {
  console.warn('Firebase Admin Auth module not available:', error.message);
  // Create a mock implementation
  adminAuthModule = {
    getAuth: () => null
  };
}

const { getAuth } = adminAuthModule;

// Function to check if Firebase Admin credentials are properly configured
function hasFirebaseAdminCredentials() {
  const hasProjectId = !!process.env.FIREBASE_ADMIN_PROJECT_ID;
  const hasClientEmail = !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const hasPrivateKey = !!process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  
  const isConfigured = hasProjectId && hasClientEmail && hasPrivateKey;
  
  if (!isConfigured && process.env.NODE_ENV === 'development') {
    console.warn('Firebase Admin SDK is not fully configured:');
    if (!hasProjectId) console.warn('- Missing FIREBASE_ADMIN_PROJECT_ID');
    if (!hasClientEmail) console.warn('- Missing FIREBASE_ADMIN_CLIENT_EMAIL');
    if (!hasPrivateKey) console.warn('- Missing FIREBASE_ADMIN_PRIVATE_KEY');
    console.warn('Add these to your .env.local file to enable server-side Firebase authentication');
  }
  
  return isConfigured;
}

// Get the admin auth instance
async function getAdminAuth() {
  try {
    const app = await initializeAdminApp();
    if (!app) return null;
    return getAuth(app);
  } catch (error) {
    console.error("Failed to get Admin Auth:", error);
    return null;
  }
}

// Verify an auth token using the admin SDK
async function verifyAuthToken(token) {
  try {
    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      console.warn("Admin Auth not available for token verification");
      // Fall back to client auth
      return auth.verifyIdToken(token);
    }
    
    return adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Token verification failed:", error);
    throw error;
  }
}

// Simple PDF text extraction - does not rely on external libraries
async function extractTextFromPdf(buffer) {
  try {
    console.log('Starting simple PDF text extraction...');
    
    // Convert buffer to string
    const pdfText = buffer.toString('utf8');
    
    // Simple pattern matching to find text in PDF
    // This is a basic approach and won't work perfectly for all PDFs
    // but it avoids compatibility issues with libraries
    let extractedText = '';
    
    // Look for text objects in PDF (very simplified approach)
    const stringPattern = /\((.*?)\)/g;
    const textMatches = pdfText.match(stringPattern) || [];
    
    extractedText = textMatches
      .map(match => match.substring(1, match.length - 1))
      .filter(text => text.length > 1) // Filter out single characters
      .join(' ');
    
    // If we didn't get much text, just return a placeholder
    if (extractedText.length < 200) {
      extractedText = `PDF text extraction produced limited results. For better results, consider using a dedicated PDF processing service.\n\n` +
                      `Sample of extracted content: ${extractedText}\n\n` +
                      `The document will be processed with the limited text available.`;
    }
    
    console.log(`PDF text extraction complete. Extracted ${extractedText.length} characters`);
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    
    // Return a fallback message so processing can continue
    return `PDF text extraction failed with error: ${error.message}. Processing will continue with limited content.`;
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
async function ensureUploadsDirectory() {
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
}

// Verify that Firebase Admin credentials are available
async function checkFirebaseAdminCredentials() {
  try {
    const adminDb = await getAdminFirestore();
    return !!adminDb;
  } catch (error) {
    console.error("Firebase Admin credentials check failed:", error);
    return false;
  }
}

export async function POST(request) {
  console.log("Processing document request received");
  
  try {
    // Check for admin credentials availability first
    const hasAdminCredentials = await checkFirebaseAdminCredentials();
    console.log(`Firebase Admin credentials available: ${hasAdminCredentials}`);
    
    const formData = await request.formData();
    const file = formData.get('file');
    const documentId = formData.get('documentId');
    const authToken = formData.get('authToken') || request.headers.get('authorization')?.split('Bearer ')[1] || null;
    const userId = formData.get('userId');
    
    console.log(`Auth token provided: ${!!authToken}`);
    if (authToken) {
      console.log(`Auth token format valid: ${authToken.length > 100}`);
    } else {
      console.warn("No authentication token provided - may result in permission issues");
    }
    
    // Initialize a user ID variable for tracking ownership
    let verifiedUserId = null;
    
    // Verify token and get userId if possible
    if (authToken) {
      try {
        if (hasAdminCredentials) {
          // Try to verify the auth token to get the user ID using admin SDK
          const decodedToken = await verifyAuthToken(authToken);
          verifiedUserId = decodedToken.uid;
          console.log(`Successfully verified token for user: ${verifiedUserId}`);
        } else {
          // No admin credentials available, trust the provided user ID
          console.log(`Admin SDK not available. Using provided userId: ${userId}`);
          verifiedUserId = userId;
        }
        
        // If we have a document ID, verify access
        if (documentId && hasAdminCredentials) {
          const hasAccess = await verifyDocumentAccess(documentId, verifiedUserId);
          if (!hasAccess) {
            return NextResponse.json({ 
              error: "Permission denied. You don't have access to this document." 
            }, { status: 403 });
          }
        }
      } catch (error) {
        console.error("Token verification error:", error);
        if (error.code === 'auth/id-token-expired') {
          return NextResponse.json({ 
            error: "Authentication error: Your session has expired.",
            message: "Please refresh the page and sign in again."
          }, { status: 401 });
        } else if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
          return NextResponse.json({ 
            error: "Authentication error: Invalid authentication token.",
            message: "Please sign out and sign in again to refresh your session."
          }, { status: 401 });
        }
        // Fall back to using the provided user ID if authentication fails
        verifiedUserId = userId;
        console.log(`Auth verification failed. Falling back to provided userId: ${verifiedUserId}`);
      }
    } else if (userId) {
      // No auth token but we have a user ID from the form data
      verifiedUserId = userId;
      console.log(`No auth token provided. Using userId from form data: ${verifiedUserId}`);
    }
    
    if (!verifiedUserId) {
      return NextResponse.json({ 
        error: "Authentication required", 
        message: "Please sign in before processing documents."
      }, { status: 401 });
    }
    
    if (!file && !documentId) {
      return NextResponse.json({ error: "No file or document ID provided" }, { status: 400 });
    }
    
    // Variables to store document data
    let text = '';
    let docData = null;
    
    // If we have a document ID, fetch the existing document
    if (documentId) {
      console.log(`Processing existing document with ID: ${documentId}`);
      
      try {
        // Try to retrieve the document content
        if (hasAdminCredentials) {
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            const docRef = adminDb.collection('documents').doc(documentId);
            const docSnap = await docRef.get();
            
            if (!docSnap.exists) {
              return NextResponse.json({ error: "Document not found" }, { status: 404 });
            }
            
            docData = docSnap.data();
            text = docData.content || '';
            console.log(`Retrieved document content: ${text.length} characters`);
          }
        }
        
        if (!docData) {
          // Fall back to client SDK
          const db = getFirestore();
          const docRef = doc(db, 'documents', documentId);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
          }
          
          docData = docSnap.data();
          text = docData.content || '';
          console.log(`Retrieved document content: ${text.length} characters`);
        }
      } catch (error) {
        console.error("Error retrieving document:", error);
        return NextResponse.json({ 
          error: "Failed to retrieve document content",
          message: error.message
        }, { status: 500 });
      }
    }
    
    // Process file upload if a file was provided
    let uploadResult = null;
    
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Extract content from the file
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.pdf')) {
        text = extractTextFromPdf(buffer);
      } else if (fileName.endsWith('.txt')) {
        text = buffer.toString('utf-8');
      } else {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
      }
      
      // Save the file to Firebase Storage
      if (hasAdminCredentials && verifiedUserId) {
        try {
          // Try to use Admin SDK for storage
          const adminStorage = await getAdminStorage();
          if (adminStorage) {
            const bucket = adminStorage.bucket();
            const filePath = `documents/${verifiedUserId}/${Date.now()}_${file.name}`;
            const fileRef = bucket.file(filePath);
            
            await fileRef.save(buffer, {
              metadata: {
                contentType: file.type,
              }
            });
            
            uploadResult = {
              fileName: file.name,
              path: filePath,
              url: `https://storage.googleapis.com/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/${filePath}`
            };
          }
        } catch (error) {
          console.error("Admin Storage upload failed:", error);
          // Will fall back to client SDK
        }
      }
      
      // Fall back to client SDK if admin upload failed
      if (!uploadResult) {
        try {
          const storage = getStorage();
          const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, buffer, {
            contentType: file.type,
          });
          const downloadURL = await getDownloadURL(snapshot.ref);
          
          uploadResult = {
            fileName: file.name,
            path: snapshot.ref.fullPath,
            url: downloadURL
          };
        } catch (error) {
          console.error("Error uploading to Firebase Storage:", error);
          return NextResponse.json({ error: "Failed to upload file to storage" }, { status: 500 });
        }
      }
    }
    
    // Process the text with OpenAI
    let summary = '';
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that summarizes documents clearly and concisely." },
          { role: "user", content: `Summarize this text in 2-3 paragraphs:\n\n${text.substring(0, 15000)}` }
        ],
        max_tokens: 500,
      });
      
      summary = completion.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API error:", error);
      return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }
    
    // Save or update document in Firestore
    let documentData = {
      summary: summary,
      content: text.substring(0, 100000), // Limit text length
      updatedAt: hasAdminCredentials ? new Date() : serverTimestamp()
    };
    
    // Add file info if we uploaded a file
    if (uploadResult) {
      documentData = {
        ...documentData,
        fileName: uploadResult.fileName,
        filePath: uploadResult.path,
        fileUrl: uploadResult.url,
        createdAt: docData?.createdAt || (hasAdminCredentials ? new Date() : serverTimestamp())
      };
    }
    
    // Set the user ID
    documentData.userId = verifiedUserId;
    
    let docRef;
    if (documentId) {
      // Update existing document
      if (hasAdminCredentials) {
        try {
          // Try to use Admin SDK
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            docRef = adminDb.collection('documents').doc(documentId);
            await docRef.update({
              ...documentData,
              id: documentId
            });
          }
        } catch (error) {
          console.error("Admin Firestore update failed:", error);
          // Will fall back to client SDK
        }
      }
      
      if (!docRef) {
        // Fall back to client SDK
        const db = getFirestore();
        docRef = doc(db, 'documents', documentId);
        await updateDoc(docRef, {
          ...documentData,
          id: documentId
        });
      }
    } else {
      // Create a new document
      if (hasAdminCredentials) {
        try {
          // Try to use Admin SDK
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            docRef = await adminDb.collection('documents').add({
              ...documentData
            });
            await docRef.update({ id: docRef.id });
            documentId = docRef.id;
          }
        } catch (error) {
          console.error("Admin Firestore create failed:", error);
          // Will fall back to client SDK
        }
      }
      
      if (!documentId) {
        // Fall back to client SDK
        const db = getFirestore();
        docRef = await addDoc(collection(db, 'documents'), {
          ...documentData
        });
        
        await updateDoc(docRef, { id: docRef.id });
        documentId = docRef.id;
      }
    }
    
    // Create a dataset record for the processed document
    await createDatasetRecord(documentId, text, summary, hasAdminCredentials, documentData.userId);
    
    // Return the results
    return NextResponse.json({
      documentId,
      summary: summary,
      textLength: text.length,
    });
    
  } catch (error) {
    console.error("Document processing error:", error);
    
    if (error.code === 'permission-denied') {
      return NextResponse.json({ 
        error: "Authentication error: The server couldn't authenticate with Firebase.",
        message: "Please try the following steps:\n1. Refresh the page\n2. Sign out and sign in again\n3. If using an older tab, open a fresh browser tab\n4. If the problem persists, your session may have expired or you may not have access to this document."
      }, { status: 403 });
    }
    
    return NextResponse.json({ 
      error: "Failed to process document",
      message: error.message
    }, { status: 500 });
  }
}

// Create a dataset record for the processed document
async function createDatasetRecord(documentId, text, summary, hasAdminCredentials, userId) {
  try {
    if (!userId) {
      console.warn("No userId provided for dataset record - skipping creation");
      return null;
    }
    
    console.log(`Creating dataset record for document ${documentId} for user ${userId}`);
    
    const datasetData = {
      documentId,
      length: text.length,
      summary,
      createdAt: hasAdminCredentials ? new Date() : serverTimestamp(),
      processed: false, // will be processed by the training pipeline later
      userId  // Always include the userId
    };
    
    if (hasAdminCredentials) {
      try {
        // Try Admin SDK first
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          const datasetRef = adminDb.collection('datasets').doc();
          await datasetRef.set({
            ...datasetData,
            id: datasetRef.id,
            createdAt: hasAdminCredentials ? new Date() : serverTimestamp()
          });
          console.log(`Created dataset record ${datasetRef.id} using Admin SDK`);
          return datasetRef.id;
        }
      } catch (error) {
        console.error("Admin Firestore dataset creation failed:", error);
        // Will fall back to client method
      }
    }
    
    // Fall back to client method
    const db = getFirestore();
    const datasetRef = await addDoc(collection(db, 'datasets'), datasetData);
    await updateDoc(datasetRef, { id: datasetRef.id });
    console.log(`Created dataset record ${datasetRef.id} using client SDK`);
    return datasetRef.id;
    
  } catch (error) {
    console.error("Error creating dataset record:", error);
    // Continue without throwing - this is a non-critical operation
    return null;
  }
}

// API route for downloading files
export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('file');
  
  if (!filePath) {
    return NextResponse.json(
      { error: 'File path is required' },
      { status: 400 }
    );
  }

  try {
    // Parse file path to get userId and fileName
    const [userId, fileName] = filePath.split('/');
    
    if (!userId || !fileName) {
      throw new Error('Invalid file path format');
    }
    
    const fullPath = path.join(process.cwd(), 'uploads', userId, fileName);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Read file content
    const fileContent = await fs.readFile(fullPath);
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.jsonl')) {
      contentType = 'application/json';
    } else if (fileName.endsWith('.csv')) {
      contentType = 'text/csv';
    }
    
    // Return file
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename=${fileName}`
      }
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    );
  }
}