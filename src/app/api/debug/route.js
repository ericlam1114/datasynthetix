import { NextResponse } from "next/server";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { initializeApp } from "firebase/app";

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase app locally for this route
const firebaseApp = initializeApp(firebaseConfig, 'debug-route');
const firestore = getFirestore(firebaseApp);

// Route handler for GET requests
export async function GET(request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const jobId = searchParams.get('jobId');
    const projectId = searchParams.get('projectId');
    const action = searchParams.get('action') || 'status';
    
    console.log(`Debug endpoint called with action: ${action}`);
    
    // Get job status from Firestore if jobId is provided
    if (jobId && userId) {
      console.log(`Looking up job status for jobId: ${jobId}, userId: ${userId}`);
      
      try {
        // Check both possible collections
        const collections = ['jobs', 'processingJobs'];
        let job = null;
        let collectionFound = null;
        
        for (const collection of collections) {
          console.log(`Checking in collection: ${collection}`);
          const jobDocRef = doc(firestore, collection, jobId);
          const jobSnapshot = await getDoc(jobDocRef);
          
          if (jobSnapshot.exists()) {
            job = jobSnapshot.data();
            collectionFound = collection;
            break;
          }
        }
        
        if (job) {
          console.log(`Job found in Firestore in collection: ${collectionFound}`);
          return NextResponse.json({ 
            message: `Job found in collection: ${collectionFound}`,
            job,
            exists: true,
            collection: collectionFound
          });
        } else {
          console.log(`Job not found in any Firestore collection`);
          return NextResponse.json({ 
            message: 'Job not found in Firestore',
            exists: false,
            collectionsChecked: collections
          });
        }
      } catch (error) {
        console.error('Error retrieving job from Firestore:', error);
        return NextResponse.json({
          error: 'Error retrieving job from Firestore',
          message: error.message
        }, { status: 500 });
      }
    }
    
    // Get batch project from Firestore if projectId is provided
    if (projectId && userId) {
      console.log(`Looking up batch project for projectId: ${projectId}, userId: ${userId}`);
      
      try {
        const projectDocRef = doc(firestore, 'users', userId, 'batchProjects', projectId);
        const projectSnapshot = await getDoc(projectDocRef);
        
        if (projectSnapshot.exists()) {
          console.log(`Batch project found in Firestore`);
          return NextResponse.json({ 
            message: 'Batch project found',
            project: projectSnapshot.data(),
            exists: true
          });
        } else {
          console.log(`Batch project not found in Firestore`);
          return NextResponse.json({ 
            message: 'Batch project not found in Firestore',
            exists: false
          });
        }
      } catch (error) {
        console.error('Error retrieving batch project from Firestore:', error);
        return NextResponse.json({
          error: 'Error retrieving batch project from Firestore',
          message: error.message
        }, { status: 500 });
      }
    }
    
    // If no specific action was requested, return environment info
    return NextResponse.json({
      message: 'Debug endpoint active',
      environment: process.env.NODE_ENV,
      simulation: process.env.NEXT_PUBLIC_USE_SIMULATION === 'true',
      timestamp: new Date().toISOString(),
      params: {
        userId,
        jobId,
        projectId,
        action
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json({ 
      error: 'Error in debug endpoint',
      message: error.message
    }, { status: 500 });
  }
} 