import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract";
import pdfParse from 'pdf-parse';

// Helper to get file from S3
async function getFileFromS3(bucket, key) {
  try {
    const s3Client = new S3Client({ 
      region: process.env.AWS_REGION 
    });
    
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const response = await s3Client.send(command);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error("Error retrieving file from S3:", error);
    throw error;
  }
}

// Extract text using multiple methods
export async function extractTextFromPdf(fileBuffer, options = {}) {
  console.log(`Attempting to extract text from PDF using multiple methods`);
  
  let text = "";
  let errors = [];
  
  // Method 1: Use pdf-parse (simplest)
  try {
    console.log("Trying pdf-parse extraction...");
    const data = await pdfParse(fileBuffer);
    text = data.text;
    console.log(`pdf-parse extracted ${text.length} characters`);
    
    if (text.length > 100) {
      return text;
    }
  } catch (error) {
    console.error("pdf-parse extraction failed:", error);
    errors.push(`pdf-parse: ${error.message}`);
  }
  
  // Method 2: Use AWS Textract if enabled
  if (options.useTextract) {
    try {
      console.log("Trying AWS Textract extraction...");
      // Upload to S3 temporarily for Textract processing
      const s3Client = new S3Client({ region: process.env.AWS_REGION });
      const tempKey = `temp/extract-${Date.now()}.pdf`;
      
      await s3Client.send({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: tempKey,
        Body: fileBuffer
      });
      
      // Process with Textract
      const textractClient = new TextractClient({ region: process.env.AWS_REGION });
      
      // Start document detection
      const startCommand = new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: process.env.AWS_S3_BUCKET,
            Name: tempKey
          }
        }
      });
      
      const startResponse = await textractClient.send(startCommand);
      const jobId = startResponse.JobId;
      
      console.log(`Textract job started with ID: ${jobId}`);
      
      // Poll until job completes
      let jobComplete = false;
      let textractText = "";
      
      while (!jobComplete) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        const checkCommand = new GetDocumentTextDetectionCommand({
          JobId: jobId
        });
        
        const checkResponse = await textractClient.send(checkCommand);
        
        if (checkResponse.JobStatus === 'SUCCEEDED') {
          console.log("Textract job completed successfully");
          jobComplete = true;
          
          // Collect all blocks of text
          let textBlocks = [];
          let nextToken = undefined;
          
          do {
            const getCommand = new GetDocumentTextDetectionCommand({
              JobId: jobId,
              NextToken: nextToken
            });
            
            const result = await textractClient.send(getCommand);
            textBlocks = textBlocks.concat(result.Blocks.filter(b => b.BlockType === 'LINE').map(b => b.Text));
            nextToken = result.NextToken;
          } while (nextToken);
          
          textractText = textBlocks.join("\n");
          console.log(`Textract extracted ${textractText.length} characters`);
        } else if (checkResponse.JobStatus === 'FAILED') {
          console.error("Textract job failed:", checkResponse.StatusMessage);
          jobComplete = true;
        }
      }
      
      if (textractText.length > 100) {
        return textractText;
      }
    } catch (textractError) {
      console.error("AWS Textract extraction failed:", textractError);
      errors.push(`Textract: ${textractError.message}`);
    }
  }
  
  // Return the best text we got, or an error
  if (text.length > 0) {
    return text;
  }
  
  throw new Error(`PDF text extraction failed: ${errors.join(', ')}`);
}
