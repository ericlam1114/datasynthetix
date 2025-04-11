// Script to upload and process a test document
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Import Firebase (this depends on your environment)
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, getIdToken } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Path to the test PDF
const pdfPath = path.join(__dirname, 'test_doc.pdf');

async function main() {
  try {
    console.log('Starting document upload test...');

    // Step 1: Initialize Firebase and get auth token
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    // To get a token, you'd need to sign in
    // Normally you would have an actual user sign in
    // For testing, you might use a test account
    // This is a placeholder - adjust with actual credentials
    console.log('Authenticating...');
    const email = process.env.TEST_USER_EMAIL || 'test@example.com'; 
    const password = process.env.TEST_USER_PASSWORD || 'testpassword';
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      console.log('Successfully authenticated');
      
      // Step 2: Upload the file
      console.log('Uploading and processing document...');
      const formData = new FormData();
      formData.append('file', fs.createReadStream(pdfPath));
      formData.append('name', 'NFPA_70E_Standard');
      formData.append('description', 'Electrical Safety in the Workplace Standard');
      formData.append('chunkSize', '1000');
      formData.append('overlap', '100');
      formData.append('outputFormat', 'jsonl');
      formData.append('classFilter', 'all');
      formData.append('prioritizeImportant', 'false');
      
      // Make the API request
      const response = await fetch('http://localhost:3003/api/process-document', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      // Process the response
      const data = await response.json();
      console.log('API Response:', data);
      
      if (response.ok) {
        console.log('Document uploaded and processing started successfully!');
        console.log(`Job ID: ${data.jobId}`);
        console.log(`Document ID: ${data.documentId}`);
        
        // Poll for processing status
        await pollProcessingStatus(data.jobId, token);
      } else {
        console.error('Error uploading document:', data.error);
      }
    } catch (authError) {
      console.error('Authentication error:', authError);
      console.log('Proceeding with unauthenticated request (will likely fail)...');
      
      // Try without authentication (will likely fail)
      const formData = new FormData();
      formData.append('file', fs.createReadStream(pdfPath));
      formData.append('name', 'NFPA_70E_Standard');
      formData.append('outputFormat', 'jsonl');
      
      const response = await fetch('http://localhost:3003/api/process-document', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('API Response (unauthenticated):', data);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

async function pollProcessingStatus(jobId, token) {
  console.log('Polling for processing status...');
  let completed = false;
  let attempts = 0;
  
  while (!completed && attempts < 30) {
    attempts++;
    try {
      const response = await fetch(`http://localhost:3003/api/process-status?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Status: ${data.status}, Progress: ${data.progress}%`);
        
        if (data.status === 'complete' || data.progress === 100) {
          completed = true;
          console.log('Processing completed successfully!');
          console.log('Result:', data.result);
          return;
        }
      } else {
        console.error('Error checking status:', await response.text());
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
    
    // Wait 5 seconds between polls
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  if (!completed) {
    console.log('Polling timeout - processing may still be ongoing');
  }
}

main().catch(console.error); 