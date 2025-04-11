import * as pdfjs from 'pdfjs-dist';
const mammoth = require('mammoth');
import { extractTextWithTextract } from '../../../../lib/textract-service';

// Check if OCR is enabled based on environment variables (more flexible checking)
const USE_OCR = process.env.USE_OCR === 'true' || process.env.ENABLE_OCR === 'true' || process.env.NODE_ENV === 'development';

// Detect if running on server side
const isServer = typeof window === 'undefined';

// Configure PDF.js based on environment
if (isServer) {
  // Server-side configuration - uses Node.js canvas
  const PDFJS_WORKER_SRC = `${process.cwd()}/node_modules/pdfjs-dist/build/pdf.worker.js`;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
} else {
  // Client-side configuration
  pdfjs.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Add a promise timeout utility
function withTimeout(promise, timeoutMs, errorMessage) {
  let timeoutId;
  
  // Create a promise that rejects after the specified timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  // Race between the original promise and the timeout
  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Extract text from a PDF file
 * @param {Buffer} buffer - PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPdf(buffer, options = {}) {
  try {
    console.log(`Extracting text from PDF (${buffer.length} bytes)${options.useOcr ? ' with OCR enabled' : ''}`);
    
    // Use the enhanced PDF extractor
    const extractedText = await require('../../../../lib/pdf-extractor').extractTextFromPdf(buffer, {
      useOcr: options.useOcr || false,
      attemptAllMethods: true,
      logProgress: true
    });
    
    console.log(`Extracted ${extractedText.length} characters from PDF`);
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
}

/**
 * Extract text from a text file
 * @param {Buffer} buffer - Text file buffer
 * @returns {string} - Extracted text
 */
function extractTextFromTxt(buffer) {
  try {
    return buffer.toString('utf8');
  } catch (error) {
    console.error('Error extracting text from TXT:', error);
    return '';
  }
}

/**
 * Extract text from a DOCX file
 * @param {Buffer} buffer - DOCX file buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    return '';
  }
}

/**
 * Extract text from a file based on its type
 * @param {Buffer} buffer - File buffer
 * @param {string} fileType - MIME type of the file
 * @param {Object} options - Extraction options
 * @returns {Promise<{text: string, validation: Object}>} - Extracted text and validation result
 */
async function extractText(buffer, fileType, options = {}) {
  console.log(`Extracting text from file of type: ${fileType}`);
  
  try {
    let text = '';
    
    if (fileType.includes('pdf')) {
      text = await extractTextFromPdf(buffer, options);
    } else if (fileType.includes('text/plain')) {
      text = extractTextFromTxt(buffer);
    } else if (fileType.includes('word') || fileType.includes('docx')) {
      text = await extractTextFromDocx(buffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
    
    // Validate the extracted text
    const validation = validateExtractedText(text);
    
    return {
      text: validation.text || text,
      length: (validation.text || text).length,
      validation
    };
  } catch (error) {
    console.error('Error extracting text:', error);
    return {
      text: '',
      length: 0,
      validation: { valid: false, reason: error.message }
    };
  }
}

/**
 * Validates extracted text to ensure it's usable
 * @param {string} text - Extracted text to validate
 * @returns {Object} - Validation result
 */
function validateExtractedText(text) {
  // In development mode with BYPASS_TEXT_VALIDATION set, always treat any text as valid
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_TEXT_VALIDATION === 'true') {
    console.log("⚠️ Development mode - bypassing text validation checks");
    console.log(`Text length: ${text?.length || 0} characters`);
    // Return valid regardless of content
    return { valid: true, bypassed: true };
  }
  
  // Check if text exists and has minimum length
  if (!text || text.length < 10) {  // Reduced minimum threshold to 10 characters
    console.log("❌ Text extraction failed or produced insufficient content");
    console.log(`Text length: ${text?.length || 0} characters`);
    
    // In development, allow even very short text to proceed anyway
    if (process.env.NODE_ENV === 'development') {
      console.warn("Development mode - allowing short text to proceed despite validation failure");
      // Create a placeholder text for empty documents
      if (!text || text.length === 0) {
        return { 
          valid: true, 
          placeholder: true,
          text: "This document appears to be empty or contains only images. OCR processing may be required."
        };
      }
      return { valid: true, lenient: true };
    }
    
    return { valid: false, reason: "insufficient_content" };
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{2,}\b/.test(text); // Has words of at least 2 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  console.log(`Text length: ${text.length} characters`);
  
  // More lenient check: only require words OR spaces
  if (containsWords || hasSpaces) {
    console.log("✅ Text extraction appears successful");
    return { valid: true };
  } else {
    console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
    
    // In development, allow even problematic text to proceed
    if (process.env.NODE_ENV === 'development') {
      console.warn("Development mode - allowing text with quality issues to proceed");
      return { valid: true, qualityIssues: true };
    }
    
    return { valid: false, reason: "text_quality_issues" };
  }
}

/**
 * Extract text from a PDF file with enhanced accuracy using AWS Textract
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Object} options - Options for text extraction
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdfWithTextract(pdfBuffer, options = {}) {
  console.log("Extracting text from PDF using AWS Textract");
  
  try {
    // Use Textract for text extraction
    const extractedText = await extractTextWithTextract(pdfBuffer, options);
    
    // If extraction was successful and returned sufficient text, return it
    if (extractedText && extractedText.length > 25) {
      console.log(`Successfully extracted ${extractedText.length} characters with Textract`);
      return extractedText;
    }
    
    // If Textract extraction failed or returned insufficient text, fallback to traditional methods
    console.log("Textract extraction insufficient, falling back to traditional methods");
    return extractTextFromPdf(pdfBuffer, options);
  } catch (error) {
    console.error("Error in Textract PDF extraction:", error);
    console.log("Falling back to traditional PDF extraction methods");
    
    // Fallback to traditional extraction on error
    return extractTextFromPdf(pdfBuffer, options);
  }
}

module.exports = {
  extractText,
  extractTextFromPdf,
  extractTextFromTxt,
  extractTextFromDocx,
  validateExtractedText,
  extractTextFromPdfWithTextract
};