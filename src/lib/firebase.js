// src/lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  // Initialize with a minimal config if there's an error
  app = initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'datasynthetix' });
}

// Initialize Firebase services
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize Firestore with offline persistence
export const firestore = getFirestore(app);

// Enable offline persistence with unlimited cache size
// This helps deal with connectivity issues
try {
  enableIndexedDbPersistence(firestore, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Firebase persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser does not support persistence
      console.warn('Firebase persistence not supported in this browser');
    } else {
      console.error('Firebase persistence error:', err);
    }
  });
} catch (error) {
  console.error('Error enabling Firebase persistence:', error);
}

/*
 * IMPORTANT: If you're experiencing CORS issues with Firebase Storage
 * You need to configure CORS for your Firebase Storage bucket.
 * 
 * 1. Install Firebase CLI tools: npm install -g firebase-tools
 * 2. Log in to Firebase: firebase login
 * 3. Create a cors.json file:
 *    [
 *      {
 *        "origin": ["http://localhost:3000", "https://yourdomain.com"],
 *        "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
 *        "maxAgeSeconds": 3600
 *      }
 *    ]
 * 4. Set CORS configuration: 
 *    gsutil cors set cors.json gs://datasynthetix.firebasestorage.app
 * 
 * Replace 'datasynthetix.firebasestorage.app' with your actual bucket name.
 */

export default app;