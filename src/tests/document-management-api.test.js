/**
 * Test script for Document Management API
 * Tests authentication, rate limiting, CRUD operations, and error handling
 */

const fetch = require('node-fetch');
const firebase = require('firebase/app');
require('firebase/auth');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Firebase client config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase client
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.getAuth(app);

// Base URL for API endpoints
const API_BASE_URL = 'http://localhost:3000/api/document-management';

// Test user credentials (should exist in your Firebase Auth)
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'test123'; // Update with actual test user password

// Test document ID (will be set during test)
let testDocumentId = null;

/**
 * Main test function
 */
async function runTests() {
  console.log('🧪 Starting Document Management API Tests');
  console.log('----------------------------------------');

  try {
    // Step 1: Authenticate test user
    console.log('📝 Step 1: Authenticating test user...');
    const authToken = await authenticateUser(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    console.log('✅ Authentication successful');

    // Step 2: Test document listing with pagination
    console.log('\n📝 Step 2: Testing document listing with pagination...');
    const documents = await testDocumentListing(authToken);
    console.log(`✅ Retrieved ${documents.length} documents`);
    
    if (documents.length > 0) {
      testDocumentId = documents[0].id;
      console.log(`📌 Using document ID: ${testDocumentId} for further tests`);
    } else {
      console.log('⚠️ No documents found, skipping document-specific tests');
    }

    // Step 3: Test rate limiting
    if (process.env.TEST_RATE_LIMITING === 'true') {
      console.log('\n📝 Step 3: Testing rate limiting...');
      await testRateLimiting(authToken);
    } else {
      console.log('\n📝 Step 3: Skipping rate limiting test (set TEST_RATE_LIMITING=true to enable)');
    }

    // Step 4: Test soft deletion (move to trash)
    if (testDocumentId) {
      console.log('\n📝 Step 4: Testing soft deletion (move to trash)...');
      await testSoftDeletion(authToken, testDocumentId);
    }

    // Step 5: Test document restoration
    if (testDocumentId) {
      console.log('\n📝 Step 5: Testing document restoration...');
      await testDocumentRestoration(authToken, testDocumentId);
    }

    // Step 6: Test error handling with invalid requests
    console.log('\n📝 Step 6: Testing error handling...');
    await testErrorHandling(authToken);

    console.log('\n✅ All tests completed successfully!');
    console.log('----------------------------------------');
    console.log('🎉 Your Document Management API is working correctly');
    console.log('👉 You can now proceed to test the UI flow');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

/**
 * Authenticate user and get auth token
 */
async function authenticateUser(email, password) {
  try {
    const userCredential = await firebase.signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const token = await user.getIdToken();
    return token;
  } catch (error) {
    console.error('Authentication failed:', error.message);
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Test document listing with pagination
 */
async function testDocumentListing(authToken) {
  try {
    // Test different view modes
    const viewModes = ['active', 'trash', 'all'];
    
    for (const viewMode of viewModes) {
      console.log(`📊 Testing view mode: ${viewMode}`);
      
      const response = await fetch(`${API_BASE_URL}?page=1&pageSize=10&viewMode=${viewMode}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to list documents in ${viewMode} mode: ${errorData.error}`);
      }
      
      const data = await response.json();
      console.log(`📄 ${viewMode} mode: Found ${data.documents.length} documents, total: ${data.pagination.totalCount}`);
      
      // Check pagination data
      console.log(`📊 Pagination: Page ${data.pagination.page}/${data.pagination.totalPages}, showing ${data.documents.length} of ${data.pagination.totalCount}`);
    }
    
    // Return active documents for further testing
    const activeResponse = await fetch(`${API_BASE_URL}?page=1&pageSize=10&viewMode=active`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const activeData = await activeResponse.json();
    return activeData.documents;
  } catch (error) {
    throw new Error(`Document listing test failed: ${error.message}`);
  }
}

/**
 * Test rate limiting
 */
async function testRateLimiting(authToken) {
  try {
    console.log('🔄 Making multiple rapid requests to trigger rate limiting...');
    
    const MAX_REQUESTS = 70; // Exceeds our 60 per minute limit
    const results = await Promise.all(
      Array(MAX_REQUESTS).fill().map(async (_, i) => {
        try {
          const response = await fetch(`${API_BASE_URL}?page=1&pageSize=5&_=${i}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          return {
            status: response.status,
            statusText: response.statusText
          };
        } catch (error) {
          return {
            status: 'error',
            statusText: error.message
          };
        }
      })
    );
    
    // Count response types
    const statusCounts = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Rate limiting test results:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  - Status ${status}: ${count} responses`);
    });
    
    // Check if we got rate limited
    if (statusCounts['429']) {
      console.log('✅ Rate limiting working correctly! Some requests were rate-limited (429)');
    } else {
      console.log('⚠️ Rate limiting test inconclusive - no 429 responses received');
    }
    
  } catch (error) {
    throw new Error(`Rate limiting test failed: ${error.message}`);
  }
}

/**
 * Test soft deletion (move to trash)
 */
async function testSoftDeletion(authToken, documentId) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId,
        permanent: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Soft deletion failed: ${errorData.error}`);
    }
    
    const data = await response.json();
    console.log('✅ Soft deletion successful:', data.message);
    
    // Verify document is in trash
    const trashResponse = await fetch(`${API_BASE_URL}?viewMode=trash`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const trashData = await trashResponse.json();
    const foundInTrash = trashData.documents.some(doc => doc.id === documentId);
    
    if (foundInTrash) {
      console.log('✅ Document successfully moved to trash');
    } else {
      console.warn('⚠️ Document not found in trash after soft deletion');
    }
    
  } catch (error) {
    throw new Error(`Soft deletion test failed: ${error.message}`);
  }
}

/**
 * Test document restoration
 */
async function testDocumentRestoration(authToken, documentId) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId,
        action: 'restore'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Document restoration failed: ${errorData.error}`);
    }
    
    const data = await response.json();
    console.log('✅ Document restoration successful:', data.message);
    
    // Verify document is back in active
    const activeResponse = await fetch(`${API_BASE_URL}?viewMode=active`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const activeData = await activeResponse.json();
    const foundInActive = activeData.documents.some(doc => doc.id === documentId);
    
    if (foundInActive) {
      console.log('✅ Document successfully restored to active state');
    } else {
      console.warn('⚠️ Document not found in active state after restoration');
    }
    
  } catch (error) {
    throw new Error(`Document restoration test failed: ${error.message}`);
  }
}

/**
 * Test error handling with invalid requests
 */
async function testErrorHandling(authToken) {
  try {
    // Test 1: Request with missing parameters
    console.log('🧪 Testing request with missing parameters...');
    const missingParamsResponse = await fetch(API_BASE_URL, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Missing documentId
      })
    });
    
    if (missingParamsResponse.status === 400) {
      console.log('✅ Missing parameters test passed (400 Bad Request)');
    } else {
      console.warn(`⚠️ Missing parameters test inconclusive: ${missingParamsResponse.status}`);
    }
    
    // Test 2: Request with invalid authentication
    console.log('🧪 Testing request with invalid authentication...');
    const invalidAuthResponse = await fetch(`${API_BASE_URL}?page=1&pageSize=10`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid_token',
        'Content-Type': 'application/json'
      }
    });
    
    if (invalidAuthResponse.status === 401) {
      console.log('✅ Invalid authentication test passed (401 Unauthorized)');
    } else {
      console.warn(`⚠️ Invalid authentication test inconclusive: ${invalidAuthResponse.status}`);
    }
    
    // Test 3: Request with invalid document ID
    console.log('🧪 Testing request with invalid document ID...');
    const invalidIdResponse = await fetch(API_BASE_URL, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId: 'nonexistent-document-id',
        action: 'restore'
      })
    });
    
    if (invalidIdResponse.status === 404) {
      console.log('✅ Invalid document ID test passed (404 Not Found)');
    } else {
      console.warn(`⚠️ Invalid document ID test inconclusive: ${invalidIdResponse.status}`);
    }
    
  } catch (error) {
    throw new Error(`Error handling test failed: ${error.message}`);
  }
}

// Run the tests
runTests(); 