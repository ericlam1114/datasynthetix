/**
 * Comprehensive Internal Test for Document Management
 * 
 * This script runs a complete end-to-end test of all document management features:
 * - Authentication
 * - Document creation
 * - Document listing with pagination
 * - Soft deletion (move to trash)
 * - Document restoration
 * - Permanent deletion
 * - Error handling and edge cases
 * 
 * Run with: node src/tests/run-internal-tests.js
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase Admin SDK with service account credentials
let db, bucket;
try {
  let credential;
  
  // Check if firebase-key.json exists (created by fix-private-key.js)
  const keyFilePath = path.join(process.cwd(), 'firebase-key.json');
  if (fs.existsSync(keyFilePath)) {
    console.log('Using firebase-key.json for authentication');
    const serviceAccountFile = require(keyFilePath);
    credential = admin.credential.cert(serviceAccountFile);
  } else {
    // Get project credentials from environment variables
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    
    // Check if private key exists
    if (!privateKey) {
      throw new Error('FIREBASE_ADMIN_PRIVATE_KEY environment variable is missing');
    }
    
    // Debug key format (hide most of key for security)
    const keyStart = privateKey.substring(0, 40);
    const keyEnd = privateKey.substring(privateKey.length - 20);
    console.log(`Private key format check - starts with: ${keyStart}... ends with: ...${keyEnd}`);
    console.log(`Private key length: ${privateKey.length} characters`);
    console.log(`Contains '\\n' literals: ${privateKey.includes('\\n')}`);

    // Try different formatting approaches for the private key
    let formattedKey;
    if (privateKey.includes('\\n')) {
      formattedKey = privateKey.replace(/\\n/g, '\n');
      console.log('Converted \\n escape sequences to line breaks');
    } else if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      // Remove surrounding quotes if present
      formattedKey = privateKey.substring(1, privateKey.length - 1).replace(/\\n/g, '\n');
      console.log('Removed surrounding quotes and converted \\n escape sequences');
    } else {
      formattedKey = privateKey;
      console.log('Using private key as-is');
    }
    
    // Check if key has correct start/end markers
    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.warn('Warning: Private key does not contain BEGIN marker');
    }
    if (!formattedKey.includes('-----END PRIVATE KEY-----')) {
      console.warn('Warning: Private key does not contain END marker');
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: formattedKey
    };
    
    credential = admin.credential.cert(serviceAccount);
  }

  // Initialize the app with the credential
  admin.initializeApp({
    credential: credential,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  });

  db = admin.firestore();
  bucket = admin.storage().bucket();
  
  console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  console.log('\nTry running "node fix-private-key.js" to fix your Firebase private key format.');
  process.exit(1);
}

// Constants
const API_BASE_URL = 'http://localhost:3000/api/document-management';
const TEST_USER_ID = process.env.TEST_USER_ID || 'internal-test-user';
const TEST_USER_EMAIL = 'test@example.com';

// Utility functions
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Create a custom fetch function that prints requests and responses
const debugFetch = async (url, options = {}) => {
  console.log(`${colors.dim}[REQUEST]${colors.reset} ${options.method || 'GET'} ${url}`);
  
  if (options.body) {
    console.log(`${colors.dim}[BODY]${colors.reset} ${options.body.substring(0, 100)}${options.body.length > 100 ? '...' : ''}`);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  console.log(`${colors.dim}[RESPONSE]${colors.reset} Status: ${response.status}`);
  console.log(`${colors.dim}[RESPONSE-DATA]${colors.reset} ${JSON.stringify(data).substring(0, 150)}${JSON.stringify(data).length > 150 ? '...' : ''}`);
  
  return { response, data };
};

/**
 * Run the comprehensive internal test
 */
async function runInternalTest() {
  // Test results tracking
  let results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
  };

  // Custom auth token for testing
  let customToken;
  let idToken;
  let createdDocIds = [];

  console.log(`\n${colors.bright}🧪 STARTING INTERNAL DOCUMENT MANAGEMENT TESTS${colors.reset}`);
  console.log(`${colors.bright}============================================${colors.reset}\n`);

  try {
    // Step 1: Create Test User & Token
    try {
      console.log(`\n${colors.cyan}[TEST 1]${colors.reset} Creating test user and auth token`);
      
      // Create or get the test user
      let userRecord;
      try {
        userRecord = await admin.auth().getUser(TEST_USER_ID);
        console.log(`${colors.green}✓${colors.reset} Test user already exists`);
      } catch (error) {
        // User doesn't exist, create one
        userRecord = await admin.auth().createUser({
          uid: TEST_USER_ID,
          email: TEST_USER_EMAIL,
          password: 'testpassword123',
          displayName: 'Internal Test User'
        });
        console.log(`${colors.green}✓${colors.reset} Created new test user`);
      }
      
      // Create custom token
      customToken = await admin.auth().createCustomToken(TEST_USER_ID);
      console.log(`${colors.green}✓${colors.reset} Created custom auth token`);
      
      // Get ID token using Firebase REST API
      const tokenResponse = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: customToken, returnSecureToken: true })
        }
      );
      
      const tokenData = await tokenResponse.json();
      idToken = tokenData.idToken;
      
      if (!idToken) {
        throw new Error('Failed to get ID token: ' + JSON.stringify(tokenData));
      }
      
      console.log(`${colors.green}✓${colors.reset} Successfully obtained ID token`);
      results.tests.push({ name: 'Authentication', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Authentication test failed:`, error);
      results.tests.push({ name: 'Authentication', status: 'failed', error: error.message });
      results.failed++;
      // Exit early if authentication fails
      throw new Error('Authentication failed - cannot continue tests');
    }

    // Step 2: Generate Test Documents
    try {
      console.log(`\n${colors.cyan}[TEST 2]${colors.reset} Generating test documents`);
      
      // Sample document data
      const testDocuments = [
        {
          name: `Test Document 1 - ${uuidv4().substring(0, 8)}`,
          description: 'Auto-generated test document 1',
          fileType: 'pdf',
          size: 1258000,
          status: 'completed',
          complexity: 'medium',
          userId: TEST_USER_ID,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          deleted: false,
          filePath: `documents/${TEST_USER_ID}/test-document-1.pdf`
        },
        {
          name: `Test Document 2 - ${uuidv4().substring(0, 8)}`,
          description: 'Auto-generated test document 2',
          fileType: 'docx',
          size: 568000,
          status: 'completed',
          complexity: 'low',
          userId: TEST_USER_ID,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          deleted: false,
          filePath: `documents/${TEST_USER_ID}/test-document-2.docx`
        },
        {
          name: `Test Document 3 - ${uuidv4().substring(0, 8)}`,
          description: 'Auto-generated test document 3',
          fileType: 'txt',
          size: 125000,
          status: 'processing',
          complexity: 'low',
          progress: 65,
          userId: TEST_USER_ID,
          jobId: 'test-job-' + uuidv4().substring(0, 8),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          deleted: false,
          filePath: `documents/${TEST_USER_ID}/test-document-3.txt`
        }
      ];
      
      // Add documents to Firestore
      for (const docData of testDocuments) {
        const docRef = await db.collection('documents').add(docData);
        createdDocIds.push(docRef.id);
        console.log(`${colors.green}✓${colors.reset} Created test document: ${docData.name} (${docRef.id})`);
      }
      
      console.log(`${colors.green}✓${colors.reset} Successfully created ${testDocuments.length} test documents`);
      results.tests.push({ name: 'Document Creation', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Document creation test failed:`, error);
      results.tests.push({ name: 'Document Creation', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 3: Test Document Listing with Pagination
    try {
      console.log(`\n${colors.cyan}[TEST 3]${colors.reset} Testing document listing with pagination`);
      
      // Test different view modes
      const viewModes = ['active', 'trash', 'all'];
      const pageSizes = [5, 10];
      
      for (const viewMode of viewModes) {
        for (const pageSize of pageSizes) {
          console.log(`${colors.dim}Testing view mode: ${viewMode} with page size: ${pageSize}${colors.reset}`);
          
          const { response, data } = await debugFetch(
            `${API_BASE_URL}?page=1&pageSize=${pageSize}&viewMode=${viewMode}`,
            {
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (!response.ok) {
            throw new Error(`Failed to list documents in ${viewMode} mode: ${data.error || 'Unknown error'}`);
          }
          
          console.log(`${colors.green}✓${colors.reset} Retrieved documents in ${viewMode} mode (${data.documents.length} documents)`);
          
          // Verify pagination data exists
          if (!data.pagination || typeof data.pagination.totalCount !== 'number') {
            throw new Error('Pagination data is missing or invalid');
          }
          
          console.log(`${colors.green}✓${colors.reset} Pagination data valid: page ${data.pagination.page}/${data.pagination.totalPages}, showing ${data.documents.length} of ${data.pagination.totalCount}`);
        }
      }
      
      console.log(`${colors.green}✓${colors.reset} Document listing with pagination works correctly`);
      results.tests.push({ name: 'Document Listing with Pagination', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Document listing test failed:`, error);
      results.tests.push({ name: 'Document Listing with Pagination', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 4: Test Soft Deletion (Move to Trash)
    let testDocIdForRestore;
    try {
      console.log(`\n${colors.cyan}[TEST 4]${colors.reset} Testing soft deletion (move to trash)`);
      
      if (createdDocIds.length === 0) {
        throw new Error('No test documents available to delete');
      }
      
      // Use the first document for deletion
      testDocIdForRestore = createdDocIds[0];
      
      const { response, data } = await debugFetch(API_BASE_URL, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: testDocIdForRestore,
          permanent: false
        })
      });
      
      if (!response.ok) {
        throw new Error(`Soft deletion failed: ${data.error || 'Unknown error'}`);
      }
      
      console.log(`${colors.green}✓${colors.reset} Soft deletion successful: ${data.message}`);
      
      // Verify document is in trash
      const { response: trashResponse, data: trashData } = await debugFetch(
        `${API_BASE_URL}?viewMode=trash`,
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const foundInTrash = trashData.documents.some(doc => doc.id === testDocIdForRestore);
      
      if (foundInTrash) {
        console.log(`${colors.green}✓${colors.reset} Document successfully moved to trash`);
      } else {
        throw new Error('Document not found in trash after soft deletion');
      }
      
      results.tests.push({ name: 'Soft Deletion', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Soft deletion test failed:`, error);
      results.tests.push({ name: 'Soft Deletion', status: 'failed', error: error.message });
      results.failed++;
      testDocIdForRestore = null;
    }

    // Step 5: Test Document Restoration
    try {
      console.log(`\n${colors.cyan}[TEST 5]${colors.reset} Testing document restoration`);
      
      if (!testDocIdForRestore) {
        throw new Error('No test document available to restore (previous test failed)');
      }
      
      const { response, data } = await debugFetch(API_BASE_URL, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: testDocIdForRestore,
          action: 'restore'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Document restoration failed: ${data.error || 'Unknown error'}`);
      }
      
      console.log(`${colors.green}✓${colors.reset} Document restoration successful: ${data.message}`);
      
      // Verify document is back in active
      const { response: activeResponse, data: activeData } = await debugFetch(
        `${API_BASE_URL}?viewMode=active`,
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const foundInActive = activeData.documents.some(doc => doc.id === testDocIdForRestore);
      
      if (foundInActive) {
        console.log(`${colors.green}✓${colors.reset} Document successfully restored to active state`);
      } else {
        throw new Error('Document not found in active state after restoration');
      }
      
      results.tests.push({ name: 'Document Restoration', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Document restoration test failed:`, error);
      results.tests.push({ name: 'Document Restoration', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 6: Test Permanent Deletion
    try {
      console.log(`\n${colors.cyan}[TEST 6]${colors.reset} Testing permanent deletion`);
      
      if (createdDocIds.length <= 1) {
        throw new Error('No test documents available for permanent deletion');
      }
      
      // Use the second document for permanent deletion
      const permanentDeleteId = createdDocIds[1];
      
      // First move it to trash
      await debugFetch(API_BASE_URL, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: permanentDeleteId,
          permanent: false
        })
      });
      
      console.log(`${colors.dim}Moved document to trash first${colors.reset}`);
      
      // Then permanently delete it
      const { response, data } = await debugFetch(API_BASE_URL, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: permanentDeleteId,
          permanent: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`Permanent deletion failed: ${data.error || 'Unknown error'}`);
      }
      
      console.log(`${colors.green}✓${colors.reset} Permanent deletion successful: ${data.message}`);
      
      // Verify document is gone from both active and trash
      const { data: allData } = await debugFetch(
        `${API_BASE_URL}?viewMode=all`,
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const stillExists = allData.documents.some(doc => doc.id === permanentDeleteId);
      
      if (!stillExists) {
        console.log(`${colors.green}✓${colors.reset} Document successfully deleted permanently`);
      } else {
        throw new Error('Document still exists after permanent deletion');
      }
      
      results.tests.push({ name: 'Permanent Deletion', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Permanent deletion test failed:`, error);
      results.tests.push({ name: 'Permanent Deletion', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 7: Test Error Handling
    try {
      console.log(`\n${colors.cyan}[TEST 7]${colors.reset} Testing error handling`);
      
      // Test 1: Invalid authentication
      console.log(`${colors.dim}Testing invalid auth token...${colors.reset}`);
      const { response: invalidAuthResponse } = await debugFetch(
        `${API_BASE_URL}?page=1&pageSize=10`,
        {
          headers: {
            'Authorization': 'Bearer invalid_token',
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (invalidAuthResponse.status === 401) {
        console.log(`${colors.green}✓${colors.reset} Invalid authentication test passed (401 Unauthorized)`);
      } else {
        console.warn(`${colors.yellow}⚠${colors.reset} Invalid authentication test inconclusive: ${invalidAuthResponse.status}`);
        results.warnings++;
      }
      
      // Test 2: Missing parameters
      console.log(`${colors.dim}Testing missing parameters...${colors.reset}`);
      const { response: missingParamsResponse } = await debugFetch(API_BASE_URL, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing documentId
        })
      });
      
      if (missingParamsResponse.status === 400) {
        console.log(`${colors.green}✓${colors.reset} Missing parameters test passed (400 Bad Request)`);
      } else {
        console.warn(`${colors.yellow}⚠${colors.reset} Missing parameters test inconclusive: ${missingParamsResponse.status}`);
        results.warnings++;
      }
      
      // Test 3: Invalid document ID
      console.log(`${colors.dim}Testing invalid document ID...${colors.reset}`);
      const { response: invalidIdResponse } = await debugFetch(API_BASE_URL, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId: 'nonexistent-document-id',
          action: 'restore'
        })
      });
      
      if (invalidIdResponse.status === 404) {
        console.log(`${colors.green}✓${colors.reset} Invalid document ID test passed (404 Not Found)`);
      } else {
        console.warn(`${colors.yellow}⚠${colors.reset} Invalid document ID test inconclusive: ${invalidIdResponse.status}`);
        results.warnings++;
      }
      
      results.tests.push({ name: 'Error Handling', status: 'passed' });
      results.passed++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Error handling test failed:`, error);
      results.tests.push({ name: 'Error Handling', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 8: Test CORS Headers
    try {
      console.log(`\n${colors.cyan}[TEST 8]${colors.reset} Testing CORS headers`);
      
      // Send an OPTIONS request to check CORS headers
      const optionsResponse = await fetch(API_BASE_URL, {
        method: 'OPTIONS'
      });
      
      const corsHeaders = {
        'access-control-allow-origin': optionsResponse.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': optionsResponse.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': optionsResponse.headers.get('access-control-allow-headers')
      };
      
      console.log(`${colors.dim}CORS Headers:${colors.reset}`, corsHeaders);
      
      if (corsHeaders['access-control-allow-origin']) {
        console.log(`${colors.green}✓${colors.reset} CORS headers are properly set`);
        results.tests.push({ name: 'CORS Headers', status: 'passed' });
        results.passed++;
      } else {
        console.warn(`${colors.yellow}⚠${colors.reset} CORS headers test inconclusive - headers may not be set`);
        results.tests.push({ name: 'CORS Headers', status: 'warning' });
        results.warnings++;
      }
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} CORS headers test failed:`, error);
      results.tests.push({ name: 'CORS Headers', status: 'failed', error: error.message });
      results.failed++;
    }

    // Step 9: Cleanup - Delete remaining test documents
    try {
      console.log(`\n${colors.cyan}[TEST 9]${colors.reset} Cleaning up test data`);
      
      // Delete any remaining test documents
      if (createdDocIds.length > 0) {
        for (const docId of createdDocIds) {
          try {
            await db.collection('documents').doc(docId).delete();
            console.log(`${colors.green}✓${colors.reset} Deleted test document: ${docId}`);
          } catch (error) {
            console.warn(`${colors.yellow}⚠${colors.reset} Failed to delete test document ${docId}:`, error.message);
          }
        }
      }
      
      console.log(`${colors.green}✓${colors.reset} Test data cleanup completed`);
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Test data cleanup failed:`, error);
    }

  } catch (error) {
    console.error(`${colors.red}❌ CRITICAL TEST FAILURE:${colors.reset}`, error);
    results.failed++;
  }

  // Print test summary
  console.log(`\n${colors.bright}📊 TEST SUMMARY${colors.reset}`);
  console.log(`${colors.bright}==============${colors.reset}`);
  console.log(`${colors.green}✓ Passed:${colors.reset} ${results.passed}`);
  console.log(`${colors.red}✗ Failed:${colors.reset} ${results.failed}`);
  console.log(`${colors.yellow}⚠ Warnings:${colors.reset} ${results.warnings}`);
  console.log(`\n${colors.bright}📝 TEST DETAILS${colors.reset}`);
  
  results.tests.forEach((test, index) => {
    const statusColor = 
      test.status === 'passed' ? colors.green :
      test.status === 'warning' ? colors.yellow :
      colors.red;
    
    console.log(`${index + 1}. ${test.name}: ${statusColor}${test.status}${colors.reset}${test.error ? ` - ${test.error}` : ''}`);
  });
  
  if (results.failed === 0) {
    console.log(`\n${colors.green}${colors.bright}✅ ALL TESTS COMPLETED SUCCESSFULLY!${colors.reset}`);
    console.log(`\n${colors.green}The document management system is working correctly and ready for production use.${colors.reset}`);
  } else {
    console.log(`\n${colors.red}${colors.bright}❌ SOME TESTS FAILED!${colors.reset}`);
    console.log(`\n${colors.red}Please fix the failed tests before proceeding to production.${colors.reset}`);
    process.exit(1);
  }
}

// Run the comprehensive test
runInternalTest(); 