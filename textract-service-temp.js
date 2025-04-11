const {  TextractClient, DetectDocumentTextCommand, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand  } = require('@aws-sdk/client-textract');
const {  S3Client, PutObjectCommand  } = require('@aws-sdk/client-s3');
const {  SQSClient, ReceiveMessageCommand, DeleteMessageCommand  } = require('@aws-sdk/client-sqs');

// Initialize Textract client
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Initialize S3 client with the correct region (us-east-2 for your bucket)
const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "us-east-2", // Use specific S3 region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: false, // Important for addressing the bucket correctly
});

// Initialize SQS client
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Upload document to S3 for async processing
 * @param {Buffer} documentBuffer - Document buffer
 * @param {string} key - S3 object key
 * @returns {Promise<string>} - S3 object key
 */
async function uploadDocumentToS3(documentBuffer, key) {
  try {
    const bucketName = process.env.AWS_S3_BUCKET;
    if (!bucketName) {
      throw new Error("AWS_S3_BUCKET environment variable is not set");
    }

    console.log(`Uploading document to S3: ${bucketName}/${key}`);
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: documentBuffer
    });

    await s3Client.send(command);
    return key;
  } catch (error) {
    console.error("Error uploading document to S3:", error);
    throw error;
  }
}

/**
 * Extract text from a document using Textract's synchronous API (for small documents)
 * @param {Buffer} documentBuffer - Buffer containing the document data
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextSync(documentBuffer) {
  console.log("Extracting text using AWS Textract (synchronous mode)");
  
  try {
    // Create command input with the document bytes
    const params = {
      Document: {
        Bytes: documentBuffer
      }
    };
    
    // Execute Textract text detection command
    const command = new DetectDocumentTextCommand(params);
    const response = await textractClient.send(command);
    
    // Process the response to extract text blocks
    const textBlocks = response.Blocks.filter(block => block.BlockType === 'LINE');
    const extractedText = textBlocks.map(block => block.Text).join('\n');
    
    console.log(`Textract extracted ${textBlocks.length} text lines (${extractedText.length} characters)`);
    return extractedText;
  } catch (error) {
    console.error("Error in Textract synchronous text extraction:", error);
    throw new Error(`Textract extraction failed: ${error.message}`);
  }
}

/**
 * Poll SQS queue for Textract job completion
 * @param {string} jobId - Textract job ID 
 * @returns {Promise<Object>} - Message from SQS
 */
async function pollSQSQueue(jobId) {
  const sqsQueueUrl = process.env.SQS_QUEUE_URL;
  if (!sqsQueueUrl) {
    throw new Error("SQS_QUEUE_URL environment variable not set");
  }

  console.log(`Polling SQS queue for job completion: ${jobId}`);
  
  // Maximum number of polling attempts
  const maxAttempts = 60; // 5 minutes with 5-second wait time
  let attempts = 0;
  
  return new Promise(async (resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await sqsClient.send(new ReceiveMessageCommand({
          QueueUrl: sqsQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5
        }));
        
        if (!response.Messages || response.Messages.length === 0) {
          attempts++;
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            reject(new Error("Timed out waiting for Textract job completion"));
          }
          return;
        }
        
        for (const message of response.Messages) {
          try {
            const body = JSON.parse(message.Body);
            const messageJobId = body.JobId || (body.Message && JSON.parse(body.Message).JobId);
            
            if (messageJobId === jobId) {
              console.log(`Received completion message for job: ${jobId}`);
              
              // Delete the message from the queue
              await sqsClient.send(new DeleteMessageCommand({
                QueueUrl: sqsQueueUrl,
                ReceiptHandle: message.ReceiptHandle
              }));
              
              clearInterval(pollInterval);
              resolve(message);
              return;
            } else {
              console.log(`Received message for different job: ${messageJobId}`);
            }
          } catch (parseError) {
            console.warn("Error parsing SQS message:", parseError);
          }
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error("Timed out waiting for Textract job completion"));
        }
      } catch (error) {
        console.error("Error polling SQS queue:", error);
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(error);
        }
      }
    }, 5000);
  });
}

/**
 * Extract text from a document using Textract's asynchronous API (for larger documents)
 * @param {Buffer} documentBuffer - Buffer containing the document data
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextAsync(documentBuffer) {
  console.log("Extracting text using AWS Textract (asynchronous mode)");
  
  try {
    // Verify required environment variables
    const bucketName = process.env.AWS_S3_BUCKET;
    const snsTopic = process.env.SNS_TOPIC_ARN;
    const sqsQueue = process.env.SQS_QUEUE_URL;
    
    if (!bucketName || !snsTopic || !sqsQueue) {
      throw new Error("Missing required environment variables for async Textract (AWS_S3_BUCKET, SNS_TOPIC_ARN, SQS_QUEUE_URL)");
    }
    
    // Generate a unique object key
    const objectKey = `temp-documents/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.pdf`;
    
    // Upload the document to S3
    await uploadDocumentToS3(documentBuffer, objectKey);
    console.log(`Document uploaded to S3: ${bucketName}/${objectKey}`);
    
    // Start the asynchronous text detection job
    const startParams = {
      DocumentLocation: {
        S3Object: {
          Bucket: bucketName,
          Name: objectKey
        }
      },
      NotificationChannel: {
        SNSTopicArn: snsTopic,
        RoleArn: process.env.AWS_IAM_ROLE_ARN // Optional, depending on your setup
      }
    };
    
    const startCommand = new StartDocumentTextDetectionCommand(startParams);
    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;
    
    console.log(`Started Textract job: ${jobId}`);
    
    // Poll SQS or directly check status
    let extractedText = "";
    
    if (sqsQueue) {
      // When using SNS/SQS, wait for notification
      await pollSQSQueue(jobId);
    } else {
      // Poll directly if not using SQS
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Get the job results
    let paginationToken = null;
    let allBlocks = [];
    
    do {
      const getResultsParams = { 
        JobId: jobId,
        ...(paginationToken ? { NextToken: paginationToken } : {})
      };
      
      const getResultsCommand = new GetDocumentTextDetectionCommand(getResultsParams);
      const getResultsResponse = await textractClient.send(getResultsCommand);
      
      if (getResultsResponse.JobStatus === 'SUCCEEDED') {
        // Add these blocks to our collection
        allBlocks = allBlocks.concat(getResultsResponse.Blocks || []);
        
        // Check if there are more pages of results
        paginationToken = getResultsResponse.NextToken;
      } else if (getResultsResponse.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${getResultsResponse.StatusMessage || 'Unknown error'}`);
      } else {
        // Job is still in progress, wait a bit longer
        await new Promise(resolve => setTimeout(resolve, 5000));
        paginationToken = null; // Reset to retry from the beginning
      }
    } while (paginationToken);
    
    // Process all collected blocks
    const textBlocks = allBlocks.filter(block => block.BlockType === 'LINE');
    extractedText = textBlocks.map(block => block.Text).join('\n');
    
    console.log(`Textract extracted ${textBlocks.length} text lines (${extractedText.length} characters)`);
    return extractedText;
  } catch (error) {
    console.error("Error in Textract asynchronous text extraction:", error);
    throw new Error(`Textract extraction failed: ${error.message}`);
  }
}

/**
 * Smart text extraction using Textract, choosing between sync and async based on document size
 * @param {Buffer} documentBuffer - Buffer containing the document data
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextWithTextract(documentBuffer, options = {}) {
  // For documents larger than 5MB, use async API (requires S3)
  // But only if explicitly enabled since it requires additional permissions
  const useAsyncApi = options.forceAsync === true && 
                      process.env.AWS_S3_BUCKET && 
                      documentBuffer.length > 5 * 1024 * 1024;
  
  try {
    // Use synchronous API by default
    if (useAsyncApi) {
      try {
        console.log("Using asynchronous Textract API for large document");
        return await extractTextAsync(documentBuffer);
      } catch (asyncError) {
        // If async fails, try sync as fallback
        console.warn(`Async Textract failed (${asyncError.message}), falling back to sync API`);
        return await extractTextSync(documentBuffer);
      }
    } else {
      // Default to synchronous API - simpler and doesn't require S3/SNS/SQS setup
      return await extractTextSync(documentBuffer);
    }
  } catch (error) {
    console.error("Textract extraction error:", error);
    throw error;
  }
}

module.exports = {
  extractTextSync,
  extractTextAsync,
  extractTextWithTextract,
  uploadDocumentToS3
}; 