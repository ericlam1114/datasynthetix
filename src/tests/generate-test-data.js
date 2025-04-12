/**
 * Test data generator for Document Management testing
 * 
 * This script creates sample documents in Firestore for testing the document management API.
 * Run it with: node src/tests/generate-test-data.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK with service account credentials
try {
  // Get project credentials from environment variables
  const serviceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  });

  console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  process.exit(1);
}

// Get Firestore reference
const db = admin.firestore();

// Get Storage bucket reference
const bucket = admin.storage().bucket();

// Test user ID - this should be a valid user ID in your Firebase Auth
// You can get this by checking Firebase Console or using the admin SDK
const TEST_USER_ID = process.env.TEST_USER_ID || 'YOUR_TEST_USER_ID';

// Sample document data
const SAMPLE_DOCUMENTS = [
  {
    name: 'Company Annual Report',
    description: 'Annual financial report with key metrics and growth projections',
    fileType: 'pdf',
    size: 1258000,
    status: 'completed',
    complexity: 'high',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    deleted: false
  },
  {
    name: 'Project Requirements',
    description: 'Technical specifications for the new software project',
    fileType: 'docx',
    size: 568000,
    status: 'completed',
    complexity: 'medium',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    deleted: false
  },
  {
    name: 'User Research Results',
    description: 'Summary of user interviews and behavior analysis',
    fileType: 'txt',
    size: 125000,
    status: 'processing',
    complexity: 'low',
    progress: 65,
    jobId: 'job-' + Math.random().toString(36).substring(2, 10),
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    deleted: false
  },
  {
    name: 'Marketing Campaign Brief',
    description: 'Overview of Q4 marketing strategy and campaign assets',
    fileType: 'pdf',
    size: 876000,
    status: 'completed',
    complexity: 'medium',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
    deleted: true,
    deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
  }
];

/**
 * Generate test documents in Firestore
 */
async function generateTestData() {
  try {
    console.log(`📝 Generating test documents for user ID: ${TEST_USER_ID}`);
    
    // Create an array of promises to add documents
    const addPromises = SAMPLE_DOCUMENTS.map(async (docData, index) => {
      // Create a reference path for the file (doesn't actually create the file)
      const filePath = `documents/${TEST_USER_ID}/${docData.name.replace(/\s+/g, '-').toLowerCase()}.${docData.fileType}`;
      
      // Add the document to Firestore
      const docRef = await db.collection('documents').add({
        ...docData,
        userId: TEST_USER_ID,
        filePath,
        lastUpdated: new Date()
      });
      
      console.log(`✅ Added document: ${docData.name} (${docRef.id})`);
      return docRef.id;
    });
    
    // Wait for all documents to be added
    const documentIds = await Promise.all(addPromises);
    
    console.log('\n✅ Test data generation complete!');
    console.log('----------------------------------------');
    console.log(`📊 Created ${documentIds.length} test documents`);
    console.log('📝 Document IDs for testing:');
    documentIds.forEach(id => console.log(`  - ${id}`));
    console.log('\n👉 You can now run the API tests or test the UI directly');
    
  } catch (error) {
    console.error('❌ Error generating test data:', error);
    process.exit(1);
  }
}

// Run the data generator
generateTestData(); 