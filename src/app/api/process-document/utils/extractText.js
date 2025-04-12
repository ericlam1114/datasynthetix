// src/app/api/process-document/utils/extractText.js
import { join } from 'path';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import pdf from 'pdf-parse';

/**
 * Extracts text from a PDF buffer
 * @param {Buffer} buffer - The PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<string>} The extracted text
 */
export async function extractTextFromPdf(buffer, options = {}) {
  try {
    const { useOcr = false, attemptAlternativeMethods = true } = options;
    
    console.log(`Extracting text from PDF (OCR: ${useOcr})`);
    
    if (useOcr) {
      // Use OCR for PDF if requested
      return await extractTextWithOcr(buffer, 'pdf');
    }
    
    // Try standard PDF parsing first
    try {
      const data = await pdf(buffer, {
        // PDF parsing options
        pagerender: useOcr ? null : renderPage
      });
      
      const extractedText = data.text || '';
      
      // If we got very little text and alternative methods are enabled, try another method
      if (extractedText.length < 50 && attemptAlternativeMethods) {
        console.log("Standard PDF extraction yielded minimal text, trying alternative method");
        
        // Try an alternative method (depends on your implementation)
        // For now we'll just return what we have
        return extractedText;
      }
      
      return extractedText;
    } catch (pdfError) {
      console.error("PDF extraction error:", pdfError);
      
      if (attemptAlternativeMethods) {
        console.log("Error in primary extraction method, trying alternatives");
        // Implement alternative methods here if needed
        
        // If all else fails and OCR wasn't the initial method, try OCR
        if (!useOcr) {
          console.log("Falling back to OCR extraction");
          return await extractTextWithOcr(buffer, 'pdf');
        }
      }
      
      throw pdfError;
    }
  } catch (error) {
    console.error("PDF text extraction failed:", error);
    return "";
  }
}

/**
 * Helper function for PDF page rendering
 * @param {Object} pageData - The PDF page data
 * @returns {Promise<string>} The rendered text
 */
function renderPage(pageData) {
  // Check if page contains text
  if (pageData.operators.length === 0) {
    return Promise.resolve('');
  }
  
  // Return the text content
  return pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false
  }).then(textContent => {
    let lastY;
    let text = '';
    
    // Combine text items with proper spacing
    for (const item of textContent.items) {
      if (lastY !== item.transform[5] && text.length > 0) {
        text += '\n';
      }
      text += item.str;
      lastY = item.transform[5];
    }
    
    return text;
  });
}

/**
 * Extracts text from a plain text buffer
 * @param {Buffer} buffer - The text file buffer
 * @returns {string} The extracted text
 */
export function extractTextFromTxt(buffer) {
  try {
    return buffer.toString('utf8');
  } catch (error) {
    console.error("Text file extraction failed:", error);
    return "";
  }
}

/**
 * Extracts text from a Word document buffer
 * @param {Buffer} buffer - The DOCX file buffer
 * @returns {Promise<string>} The extracted text
 */
export async function extractTextFromDocx(buffer) {
  try {
    // Dynamically import mammoth to avoid issues if it's not available
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error("DOCX extraction failed:", error);
    return "";
  }
}

/**
 * Extracts text using OCR
 * @param {Buffer} buffer - The file buffer
 * @param {string} fileType - The file type
 * @returns {Promise<string>} The extracted text
 */
async function extractTextWithOcr(buffer, fileType) {
  // This is a placeholder for OCR functionality
  console.log(`OCR extraction requested for ${fileType} file`);
  
  // In a real implementation, you would:
  // 1. Save the buffer to a temporary file
  // 2. Call an OCR library/service (like Tesseract)
  // 3. Return the extracted text
  
  // For now, we'll just return a placeholder
  if (process.env.NODE_ENV === 'development') {
    return "This is placeholder text from OCR extraction in development mode.";
  }
  
  throw new Error("OCR extraction not implemented");
}

/**
 * Extracts text from a PDF using AWS Textract
 * @param {Buffer} buffer - The PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<string>} The extracted text
 */
export async function extractTextFromPdfWithTextract(buffer, options = {}) {
  try {
    const { useOcr = true } = options; // Default to true for Textract
    
    console.log(`Extracting PDF text with AWS Textract (OCR enabled: ${useOcr})`);
    
    // Check if AWS credentials are available
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn("AWS credentials not found, Textract may not work properly");
    }
    
    // If AWS SDK is not available in development, use a placeholder
    if (process.env.NODE_ENV === 'development' && !isAwsSdkAvailable()) {
      console.log("AWS SDK not available in development, using placeholder text");
      return "This is placeholder text from AWS Textract extraction in development mode. The actual document would be processed using AWS Textract in production.";
    }
    
    try {
      // Try to dynamically import AWS SDK
      const { TextractClient, DetectDocumentTextCommand, AnalyzeDocumentCommand } = await import('@aws-sdk/client-textract');
      
      // Configure AWS
      const textractClient = new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      
      // Call the appropriate Textract API based on useOcr flag
      let result;
      if (useOcr) {
        // Use DetectDocumentText for OCR (scanned documents)
        const command = new DetectDocumentTextCommand({
          Document: { Bytes: buffer }
        });
        result = await textractClient.send(command);
      } else {
        // Use AnalyzeDocument for digital documents
        const command = new AnalyzeDocumentCommand({
          Document: { Bytes: buffer },
          FeatureTypes: ['TABLES', 'FORMS']
        });
        result = await textractClient.send(command);
      }
      
      // Process the response
      let extractedText = '';
      
      if (result.Blocks) {
        // Process response (both commands return similar structures)
        for (const block of result.Blocks) {
          if (block.BlockType === 'LINE') {
            extractedText += block.Text + '\n';
          } else if (block.BlockType === 'WORD' && !useOcr) {
            // Only add words separately for AnalyzeDocument
            if (block.Text) {
              extractedText += block.Text + ' ';
            }
          }
        }
      }
      
      console.log(`Extracted ${extractedText.length} characters using AWS Textract`);
      return extractedText;
    } catch (awsError) {
      console.error("AWS Textract extraction error:", awsError);
      
      // If we're in development mode, return a placeholder instead of failing
      if (process.env.NODE_ENV === 'development') {
        console.log("Providing development placeholder for Textract extraction");
        return "This text is a placeholder for AWS Textract extraction. In production, the actual text would be extracted from the PDF using Amazon Textract service.";
      }
      
      throw awsError;
    }
  } catch (error) {
    console.error("Textract extraction failed:", error);
    
    // Fall back to standard extraction if Textract fails
    console.log("Falling back to standard PDF extraction");
    return await extractTextFromPdf(buffer, options);
  }
}

/**
 * Check if AWS SDK is available
 * @returns {boolean} Whether AWS SDK is available
 */
function isAwsSdkAvailable() {
  try {
    require.resolve('@aws-sdk/client-textract');
    return true;
  } catch (e) {
    return false;
  }
}