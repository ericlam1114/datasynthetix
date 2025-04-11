import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { initializeAdminApp, getAdminFirestore } from '../../../lib/firebase-admin';

export async function GET(request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const jobId = url.searchParams.get('jobId');
  const documentId = url.searchParams.get('documentId');
  
  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
      { status: 400 }
    );
  }
  
  try {
    // Load status directory
    const STATUS_DIR = path.join(process.cwd(), 'uploads', 'status');
    let statusFiles = [];
    
    try {
      const files = await fs.readdir(STATUS_DIR);
      statusFiles = files.filter(f => f.includes(userId) || (jobId && f.includes(jobId)));
      
      // If we have a specific job ID, prioritize that file
      if (jobId) {
        const jobFile = files.find(f => f === `${jobId}.json`);
        if (jobFile) {
          const jobData = JSON.parse(await fs.readFile(path.join(STATUS_DIR, jobFile), 'utf-8'));
          console.log(`Found job data for ${jobId}`);
          
          // Check uploads directory for output files
          const userDir = path.join(process.cwd(), 'uploads', userId);
          let outputFiles = [];
          
          try {
            outputFiles = await fs.readdir(userDir);
          } catch (dirError) {
            console.error(`Error reading user directory: ${dirError.message}`);
          }
          
          return NextResponse.json({
            jobStatus: jobData,
            statusFiles: statusFiles.length,
            outputFiles,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (fsError) {
      console.error(`Error accessing status directory: ${fsError.message}`);
    }
    
    // Check Firestore for job status
    let firestoreJobs = [];
    try {
      // Try to use Admin SDK
      const adminApp = await initializeAdminApp();
      if (adminApp) {
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          // Query processing_jobs collection
          const jobsSnapshot = await adminDb
            .collection('processing_jobs')
            .where('userId', '==', userId)
            .orderBy('updatedAt', 'desc')
            .limit(5)
            .get();
          
          firestoreJobs = jobsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
          }));
        }
      } else {
        // Fall back to client SDK
        const db = getFirestore();
        const q = query(
          collection(db, 'processing_jobs'),
          where('userId', '==', userId),
          orderBy('updatedAt', 'desc'),
          limit(5)
        );
        
        const jobsSnapshot = await getDocs(q);
        firestoreJobs = jobsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
        }));
      }
    } catch (firestoreError) {
      console.error(`Error querying Firestore: ${firestoreError.message}`);
    }
    
    // Check document info if documentId provided
    let documentInfo = null;
    if (documentId) {
      try {
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          const docSnapshot = await adminDb
            .collection('documents')
            .doc(documentId)
            .get();
          
          if (docSnapshot.exists) {
            documentInfo = {
              id: docSnapshot.id,
              ...docSnapshot.data(),
              updatedAt: docSnapshot.data().updatedAt?.toDate?.() || docSnapshot.data().updatedAt
            };
          }
        } else {
          // Fall back to client SDK
          const db = getFirestore();
          const docRef = doc(db, 'documents', documentId);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            documentInfo = {
              id: docSnapshot.id,
              ...docSnapshot.data(),
              updatedAt: docSnapshot.data().updatedAt?.toDate?.() || docSnapshot.data().updatedAt
            };
          }
        }
      } catch (docError) {
        console.error(`Error accessing document: ${docError.message}`);
      }
    }
    
    // Return the combined debug info
    return NextResponse.json({
      userId,
      statusFiles: statusFiles.length,
      statusFilesList: statusFiles.slice(0, 10),
      firestoreJobs,
      documentInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Debug error: ${error.message}`);
    return NextResponse.json(
      { error: 'Debug query failed', message: error.message },
      { status: 500 }
    );
  }
} 