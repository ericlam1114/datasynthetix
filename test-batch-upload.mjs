// test-batch-upload.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import { readdir, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';

// Load environment variables
dotenv.config();

// Get current directory equivalent to __dirname in CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SOURCE_TEST_DIR = './test/data'; // Source directory with test PDFs
const TEST_DIR = './test-docs'; // Target directory for test files
const MAX_FILES = 3; // Limit the number of files for testing

/**
 * Prepare test directory and copy test files
 */
async function prepareTestDirectory() {
  try {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DIR)) {
      console.log(`Creating test directory: ${TEST_DIR}`);
      await mkdir(TEST_DIR, { recursive: true });
    }
    
    // Check if there are already files in the test directory
    const existingFiles = await readdir(TEST_DIR).catch(() => []);
    if (existingFiles.length > 0) {
      console.log(`Test directory already contains ${existingFiles.length} files`);
      return;
    }
    
    // Copy files from source directory
    console.log(`Copying test files from ${SOURCE_TEST_DIR} to ${TEST_DIR}`);
    const sourceFiles = await readdir(SOURCE_TEST_DIR);
    
    for (const file of sourceFiles) {
      const sourcePath = join(SOURCE_TEST_DIR, file);
      const targetPath = join(TEST_DIR, file);
      console.log(`Copying ${sourcePath} to ${targetPath}`);
      await copyFile(sourcePath, targetPath);
    }
    
    console.log(`Successfully copied ${sourceFiles.length} test files`);
  } catch (error) {
    console.error('Error preparing test directory:', error);
  }
}

/**
 * Find files in the test directory
 * @returns {Promise<string[]>} Array of file paths
 */
async function findTestFiles() {
  try {
    const files = await readdir(TEST_DIR);
    return files
      .filter(file => file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.txt'))
      .slice(0, MAX_FILES);
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
}

/**
 * Sleep for a specified time
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload files to the batch processing API
 * @param {string[]} files - Array of filenames to upload
 * @returns {Promise<string|null>} - Job ID if successful, null otherwise
 */
async function uploadBatchFiles(files) {
  if (!files.length) {
    console.log('No files found for testing');
    return null;
  }

  const formData = new FormData();
  
  // Add auth token (simulated for testing)
  const testUserId = 'test_user_' + Date.now();
  formData.append('authToken', testUserId);
  
  // Add project name
  formData.append('projectName', 'Batch Test ' + new Date().toISOString());
  
  // Add processing options
  formData.append('outputFormat', 'jsonl');
  formData.append('clausesToExtract', 'all');
  formData.append('classification', 'true');
  formData.append('maxVariantsPerClause', '3');
  formData.append('minLength', '50');
  formData.append('includeOriginal', 'true');
  formData.append('filterClassifications', 'critical,important');
  
  // Add each file to the form data
  for (const file of files) {
    const filePath = join(TEST_DIR, file);
    console.log(`Adding file: ${filePath}`);
    const fileObject = await fileFromPath(filePath);
    formData.append('files', fileObject, file);
  }

  try {
    console.log('Sending batch upload request...');
    const response = await fetch(`${SERVER_URL}/api/batch-process`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error uploading batch: ${response.status} ${response.statusText}`);
      console.error(errorText);
      return null;
    }

    const result = await response.json();
    console.log('Batch upload successful!');
    console.log(JSON.stringify(result, null, 2));
    return { jobId: result.jobId, userId: testUserId };
  } catch (error) {
    console.error('Error during fetch operation:', error);
    return null;
  }
}

/**
 * Check the status of a batch processing job
 * @param {string} jobId - The job ID to check
 * @param {string} userId - The user ID
 * @returns {Promise<object|null>} - Job status if successful, null otherwise
 */
async function checkJobStatus(jobId, userId) {
  if (!jobId) return null;
  
  try {
    const response = await fetch(`${SERVER_URL}/api/process-status?jobId=${jobId}&userId=${userId}`);
    
    if (!response.ok) {
      console.error(`Error checking job status: ${response.status} ${response.statusText}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error during status check:', error);
    return null;
  }
}

/**
 * Poll for job status until completion
 * @param {string} jobId - The job ID to poll
 * @param {string} userId - The user ID
 * @param {number} pollInterval - Milliseconds between polls
 * @param {number} maxAttempts - Maximum polling attempts
 * @returns {Promise<void>}
 */
async function pollJobStatus(jobId, userId, pollInterval = 10000, maxAttempts = 60) {
  if (!jobId) {
    console.log('No job ID provided for polling');
    return;
  }
  
  console.log(`Starting to poll job status for job ID: ${jobId}`);
  console.log(`Will check status every ${pollInterval/1000} seconds, up to ${maxAttempts} times`);
  let attempts = 0;
  
  const poll = async () => {
    if (attempts >= maxAttempts) {
      console.log('Max polling attempts reached, stopping');
      return;
    }
    
    attempts++;
    console.log(`\n[${new Date().toISOString()}] Polling attempt ${attempts}/${maxAttempts}...`);
    
    try {
      const status = await checkJobStatus(jobId, userId);
      if (!status) {
        console.log('Failed to get status, will retry');
        setTimeout(poll, pollInterval);
        return;
      }
      
      console.log(`Job status: ${status.status}`);
      
      // Check for progress indicators
      if (status.processedFiles && status.totalFiles) {
        console.log(`Progress: ${status.processedFiles}/${status.totalFiles} files processed (${Math.round((status.processedFiles / status.totalFiles) * 100)}%)`);
      } else if (status.percentComplete) {
        console.log(`Progress: ${status.percentComplete}%`);
      }
      
      // Check if job is complete or has failed
      if (['complete', 'completed', 'failed', 'error'].includes(status.status?.toLowerCase())) {
        console.log('Job processing finished!');
        if (status.error) {
          console.error(`Error: ${status.error}`);
        }
        if (status.batchProject) {
          console.log('Batch project details:');
          console.log(JSON.stringify(status.batchProject, null, 2));
        }
        return;
      }
      
      // Continue polling
      console.log(`Waiting ${pollInterval/1000} seconds before next check...`);
      setTimeout(poll, pollInterval);
    } catch (error) {
      console.error('Error during polling:', error);
      console.log(`Will retry in ${pollInterval/1000} seconds...`);
      setTimeout(poll, pollInterval);
    }
  };
  
  // Start polling
  await poll();
}

/**
 * Get batch processing results
 * @param {string} projectId - The batch project ID
 * @param {string} userId - The user ID
 * @returns {Promise<void>}
 */
async function getBatchResults(projectId, userId) {
  try {
    const response = await fetch(
      `${SERVER_URL}/api/batch-process?projectId=${projectId}&userId=${userId}`
    );
    
    if (!response.ok) {
      console.error(`Error response: ${response.status} ${response.statusText}`);
      return;
    }
    
    const result = await response.json();
    console.log('Batch project results:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check aggregated stats
    if (result.batchProject?.aggregatedStats) {
      console.log('\nAggregated Stats:');
      console.log(JSON.stringify(result.batchProject.aggregatedStats, null, 2));
    }
    
    // Check file results
    if (result.batchProject?.files) {
      console.log('\nProcessed Files:');
      console.log(JSON.stringify(result.batchProject.files, null, 2));
    }
    
  } catch (error) {
    console.error('Error getting batch results:', error);
  }
}

/**
 * Upload a single test file to the batch processing API (simplified test)
 * @returns {Promise<void>}
 */
async function simpleBatchTest() {
  console.log('Starting simplified batch test with a single file...');
  
  try {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DIR)) {
      console.log(`Creating test directory: ${TEST_DIR}`);
      await mkdir(TEST_DIR, { recursive: true });
    }
    
    // Check source files
    const sourcePath = join(SOURCE_TEST_DIR, '05-versions-space.pdf.txt');
    const targetPath = join(TEST_DIR, 'test-simple.txt');
    
    // Copy a single file for testing
    console.log(`Copying ${sourcePath} to ${targetPath}`);
    await copyFile(sourcePath, targetPath);
    
    // Create form data with just one file
    const formData = new FormData();
    
    // Add auth token (simulated for testing)
    const testUserId = 'test_user_simple_' + Date.now();
    formData.append('authToken', testUserId);
    
    // Add project name
    formData.append('projectName', 'Simple Batch Test ' + new Date().toISOString());
    
    // Add processing options - keep it minimal
    formData.append('outputFormat', 'jsonl');
    formData.append('minLength', '10'); // Small minimum length for test file
    
    // Add the file to the form data
    console.log(`Adding file: ${targetPath}`);
    const fileObject = await fileFromPath(targetPath);
    formData.append('files', fileObject, 'test-simple.txt');
    
    // Send the request
    console.log('Sending simplified batch upload request...');
    console.log(`Server URL: ${SERVER_URL}/api/batch-process`);
    
    const response = await fetch(`${SERVER_URL}/api/batch-process`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error uploading batch: ${response.status} ${response.statusText}`);
      console.error(errorText);
      return;
    }
    
    const result = await response.json();
    console.log('Simplified batch upload successful!');
    console.log(JSON.stringify(result, null, 2));
    
    const { jobId } = result;
    console.log(`Simple job started with ID: ${jobId} for user ${testUserId}`);
    
    // Poll for job status with shorter interval for quicker feedback
    await pollJobStatus(jobId, testUserId, 5000, 20);
    
  } catch (error) {
    console.error('Error during simplified batch test:', error);
  }
}

// Main execution
async function main() {
  console.log('Starting batch upload test...');
  
  // Choose which test to run
  const useSimpleTest = true; // Set to true for simplified testing
  
  if (useSimpleTest) {
    await simpleBatchTest();
    return;
  }
  
  // Original test with multiple files
  await prepareTestDirectory();
  
  // Find test files
  const files = await findTestFiles();
  if (files.length === 0) {
    console.error('No test files found in directory', TEST_DIR);
    return;
  }
  
  console.log(`Found ${files.length} files for testing: ${files.join(', ')}`);
  
  // Upload files and get job ID
  const result = await uploadBatchFiles(files);
  
  if (result?.jobId) {
    const { jobId, userId } = result;
    console.log(`Job started with ID: ${jobId} for user ${userId}`);
    
    // Check initial job status
    console.log('Checking initial job status...');
    const initialStatus = await checkJobStatus(jobId, userId);
    
    if (initialStatus) {
      console.log('Initial status:', JSON.stringify(initialStatus, null, 2));
      
      // Start polling for status updates
      console.log('Starting status polling...');
      await pollJobStatus(jobId, userId);
      
      // Get final results if we have a project ID
      if (initialStatus.batchProject?.projectId) {
        await getBatchResults(initialStatus.batchProject.projectId, userId);
      }
    } else {
      console.log('Failed to get initial job status');
    }
  } else {
    console.log('Failed to start batch job');
  }
}

main().catch(console.error); 