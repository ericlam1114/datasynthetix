import { TextractClient, DetectDocumentTextCommand, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract";

// Initialize Textract client
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Extract text from a document using Textract's synchronous API (for small documents)
 * @param {Buffer} documentBuffer - Buffer containing the document data
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextSync(documentBuffer) {
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
 * Extract text from a document using Textract's asynchronous API (for larger documents)
 * @param {Buffer} documentBuffer - Buffer containing the document data
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextAsync(documentBuffer) {
  console.log("Extracting text using AWS Textract (asynchronous mode)");
  
  try {
    // Start the asynchronous text detection job
    const startParams = {
      DocumentLocation: {
        S3Object: {
          Bucket: process.env.AWS_S3_BUCKET,
          Name: `temp-documents/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.pdf`
        }
      }
    };
    
    // Upload the document to S3 first (implementation needed)
    // const s3Key = await uploadDocumentToS3(documentBuffer, startParams.DocumentLocation.S3Object.Name);
    
    const startCommand = new StartDocumentTextDetectionCommand(startParams);
    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;
    
    console.log(`Started Textract job: ${jobId}`);
    
    // Poll for job completion
    let jobComplete = false;
    let extractedText = "";
    
    while (!jobComplete) {
      // Wait before checking status
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get the results
      const getResultsParams = { JobId: jobId };
      const getResultsCommand = new GetDocumentTextDetectionCommand(getResultsParams);
      const getResultsResponse = await textractClient.send(getResultsCommand);
      
      // Check if job is complete
      if (getResultsResponse.JobStatus === 'SUCCEEDED') {
        // Process results
        const textBlocks = getResultsResponse.Blocks.filter(block => block.BlockType === 'LINE');
        extractedText = textBlocks.map(block => block.Text).join('\n');
        jobComplete = true;
        
        // Handle pagination if NextToken is returned
        if (getResultsResponse.NextToken) {
          // Implementation for handling pagination needed
          // This would involve making additional GetDocumentTextDetectionCommand calls with the NextToken
        }
        
        console.log(`Textract extracted ${textBlocks.length} text lines (${extractedText.length} characters)`);
      } else if (getResultsResponse.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${getResultsResponse.StatusMessage || 'Unknown error'}`);
      }
    }
    
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
export async function extractTextWithTextract(documentBuffer, options = {}) {
  // For documents larger than 5MB, use async API (requires S3)
  const useAsyncApi = documentBuffer.length > 5 * 1024 * 1024 || options.forceAsync;
  
  try {
    if (useAsyncApi && process.env.AWS_S3_BUCKET) {
      return await extractTextAsync(documentBuffer);
    } else {
      return await extractTextSync(documentBuffer);
    }
  } catch (error) {
    console.error("Textract extraction error:", error);
    throw error;
  }
}

export default {
  extractTextSync,
  extractTextAsync,
  extractTextWithTextract
}; 