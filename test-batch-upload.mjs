// test-batch-upload.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';

// Load environment variables
dotenv.config();

// Get current directory equivalent to __dirname in CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test the batch document upload API
 */
async function testBatchUpload() {
  console.log('Starting batch upload test...');
  
  try {
    // Find PDF files in the root directory
    const files = await findPdfFiles();
    
    if (files.length === 0) {
      console.error('No PDF files found for testing');
      return;
    }
    
    console.log(`Found ${files.length} PDF files for testing: ${files.map(f => path.basename(f)).join(', ')}`);
    
    // Limit to maximum 3 files for testing
    const testFiles = files.slice(0, 3);
    console.log(`Using ${testFiles.length} files for test: ${testFiles.map(f => path.basename(f)).join(', ')}`);
    
    // Create form data with multiple files
    const formData = new FormData();
    
    // Add test user ID
    const testUserId = 'test_user_' + Date.now();
    formData.set('userId', testUserId);
    
    // Add project name
    formData.set('projectName', 'Batch Upload Test ' + new Date().toISOString());
    
    // Add processing options
    formData.set('chunkSize', '1000');
    formData.set('overlap', '100');
    formData.set('outputFormat', 'jsonl');
    formData.set('classFilter', 'all');
    
    // Add files
    for (const filePath of testFiles) {
      const file = await fileFromPath(filePath, {
        filename: path.basename(filePath),
        type: 'application/pdf'
      });
      formData.append('files', file);
    }
    
    // Send the request to the batch API
    console.log('Submitting batch upload request...');
    const baseUrl = 'http://localhost:3000';
    
    try {
      const response = await fetch(`${baseUrl}/api/batch-process`, {
        method: 'POST',
        body: formData,
      });
      
      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : {};
      
      if (!response.ok) {
        console.error('Error response:', responseText);
        throw new Error(`Batch upload failed: ${result.error || 'Unknown error'}`);
      }
      
      console.log('Batch upload initiated successfully!');
      console.log('Result:', result);
      
      // Poll for processing status (simplified, would use proper interval in production code)
      console.log('Batch process started with job ID:', result.jobId);
      console.log('You can check the status using the /api/process-status endpoint');
      console.log(`GET ${baseUrl}/api/process-status?jobId=${result.jobId}&userId=${testUserId}`);
      
      console.log('\nBatch Project ID for record:', result.batchProjectId);
      console.log('After processing completes, you can retrieve the results using:');
      console.log(`GET ${baseUrl}/api/batch-process?batchProjectId=${result.batchProjectId}&userId=${testUserId}`);
    } catch (fetchError) {
      console.error('Error making API request:', fetchError);
      console.error('Make sure the Next.js development server is running on port 3000');
    }
    
  } catch (error) {
    console.error('Error during batch upload test:', error);
  }
}

/**
 * Find PDF files in the root directory
 * @returns {Promise<string[]>} Array of PDF file paths
 */
async function findPdfFiles() {
  const rootDir = process.cwd();
  const files = fs.readdirSync(rootDir);
  
  // Filter for PDF files
  return files
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(rootDir, file));
}

// Run the test
testBatchUpload(); 