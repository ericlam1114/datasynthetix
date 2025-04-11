// Test script for async Textract processing with SNS/SQS
require('dotenv').config({ path: '.env.local' }); // Load env vars from .env.local
const fs = require('fs');
const path = require('path');
const https = require('https');
const { 
  TextractClient, 
  StartDocumentTextDetectionCommand, 
  GetDocumentTextDetectionCommand 
} = require('@aws-sdk/client-textract');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Import our Textract service
// Note: Need to use CommonJS import since this is a Node.js script outside Next.js
const textractService = require('./textract-service-wrapper');

// Sample PDF URL
const SAMPLE_PDF_URL = 'https://documentcloud.adobe.com/view-sdk-demo/PDFs/Bodea Brochure.pdf';
const SAMPLE_PDF_PATH = path.join(__dirname, 'large-test-doc.pdf');

// Initialize clients with the correct regions
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || "us-east-2",  // Explicitly use the S3 region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Download the PDF file
async function downloadPdf() {
  return new Promise((resolve, reject) => {
    // Check if already exists
    if (fs.existsSync(SAMPLE_PDF_PATH)) {
      console.log(`Using existing PDF at ${SAMPLE_PDF_PATH}`);
      return resolve(SAMPLE_PDF_PATH);
    }
    
    console.log(`Downloading large PDF from ${SAMPLE_PDF_URL}...`);
    const file = fs.createWriteStream(SAMPLE_PDF_PATH);
    
    https.get(SAMPLE_PDF_URL, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download PDF: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded PDF to ${SAMPLE_PDF_PATH}`);
        resolve(SAMPLE_PDF_PATH);
      });
    }).on('error', err => {
      fs.unlink(SAMPLE_PDF_PATH, () => {}); // Delete file on error
      reject(err);
    });
  });
}

// Upload document to S3
async function uploadToS3(fileBuffer) {
  const bucketName = process.env.AWS_S3_BUCKET;
  if (!bucketName) {
    throw new Error("AWS_S3_BUCKET environment variable is not set");
  }

  const key = `temp-documents/manual-test-${Date.now()}.pdf`;
  console.log(`Uploading document to S3: ${bucketName}/${key}`);
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: 'application/pdf'
  });

  await s3Client.send(command);
  console.log(`Document uploaded successfully to: s3://${bucketName}/${key}`);
  
  return { 
    bucket: bucketName, 
    key: key 
  };
}

// Test the async Textract functionality
async function testAsyncTextract() {
  try {
    console.log("Starting test of async Textract processing with SNS/SQS");
    console.log("Environment check:");
    console.log(`AWS_REGION (Textract): ${process.env.AWS_REGION || 'default: us-east-1'}`);
    console.log(`AWS_S3_REGION (S3): ${process.env.AWS_S3_REGION || 'default: us-east-2'}`);
    console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Missing'}`);
    console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✓ Set (hidden)' : '✗ Missing'}`);
    console.log(`AWS_S3_BUCKET: ${process.env.AWS_S3_BUCKET ? '✓ Set' : '✗ Missing'}`);
    console.log(`SNS_TOPIC_ARN: ${process.env.SNS_TOPIC_ARN ? '✓ Set' : '✗ Missing'}`);
    console.log(`SQS_QUEUE_URL: ${process.env.SQS_QUEUE_URL ? '✓ Set' : '✗ Missing'}`);
    console.log(`AWS_IAM_ROLE_ARN: ${process.env.AWS_IAM_ROLE_ARN ? '✓ Set' : '✗ Missing'}`);
    
    // Download the large PDF if needed
    await downloadPdf();
    
    // Read the PDF buffer
    const pdfBuffer = await fs.promises.readFile(SAMPLE_PDF_PATH);
    console.log(`PDF loaded: ${pdfBuffer.length} bytes (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Upload to S3
    console.log('\nUploading document to S3...');
    const s3Object = await uploadToS3(pdfBuffer);
    
    // Start async Textract job
    console.log('\nStarting async Textract job...');
    const startParams = {
      DocumentLocation: {
        S3Object: {
          Bucket: s3Object.bucket,
          Name: s3Object.key
        }
      },
      NotificationChannel: {
        SNSTopicArn: process.env.SNS_TOPIC_ARN,
        RoleArn: process.env.AWS_IAM_ROLE_ARN
      }
    };
    
    const startCommand = new StartDocumentTextDetectionCommand(startParams);
    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;
    console.log(`Started Textract job with ID: ${jobId}`);
    
    // Poll for completion (simple polling approach)
    console.log('\nPolling for job completion...');
    console.log('This may take several minutes for a large document...');
    
    let jobComplete = false;
    let paginationToken = null;
    let allBlocks = [];
    
    // Maximum wait time: 5 minutes
    const maxAttempts = 30;
    let attempts = 0;
    
    while (!jobComplete && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between polls
      
      const getResultsParams = {
        JobId: jobId,
        ...(paginationToken ? { NextToken: paginationToken } : {})
      };
      
      console.log(`Checking job status (attempt ${attempts}/${maxAttempts})...`);
      const getResultsCommand = new GetDocumentTextDetectionCommand(getResultsParams);
      const getResultsResponse = await textractClient.send(getResultsCommand);
      
      if (getResultsResponse.JobStatus === 'SUCCEEDED') {
        console.log(`Job completed successfully!`);
        // Add these blocks to our collection
        allBlocks = allBlocks.concat(getResultsResponse.Blocks || []);
        
        // Check if there are more pages of results
        paginationToken = getResultsResponse.NextToken;
        
        if (!paginationToken) {
          jobComplete = true;
        } else {
          console.log(`Getting next page of results...`);
        }
      } else if (getResultsResponse.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${getResultsResponse.StatusMessage || 'Unknown error'}`);
      } else {
        console.log(`Job still in progress (status: ${getResultsResponse.JobStatus})...`);
      }
    }
    
    if (!jobComplete) {
      throw new Error("Timed out waiting for Textract job to complete");
    }
    
    // Process all collected blocks
    const textBlocks = allBlocks.filter(block => block.BlockType === 'LINE');
    const extractedText = textBlocks.map(block => block.Text).join('\n');
    
    console.log(`\n✅ Async Textract extraction complete!`);
    console.log(`Extracted ${textBlocks.length} text lines (${extractedText.length} characters)`);
    console.log('\nSample of extracted text:');
    console.log('-----------------');
    console.log(extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''));
    console.log('-----------------');
    
    // Save the extracted text to a file
    const outputPath = path.join(__dirname, 'async-textract-output.txt');
    await fs.promises.writeFile(outputPath, extractedText);
    console.log(`Full extracted text saved to: ${outputPath}`);
    
    console.log('\n✅ Async Textract test PASSED');
    return true;
  } catch (error) {
    console.error('\n❌ Async Textract test failed with error:', error);
    return false;
  }
}

// Run test
testAsyncTextract()
  .then(success => {
    console.log(`\nTest completed with ${success ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  }); 