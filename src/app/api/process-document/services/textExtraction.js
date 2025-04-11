/**
 * Text extraction service for document processing
 * Centralizes text extraction from various document types with error handling
 */

import {
  extractTextFromPdf,
  extractTextFromTxt,
  extractTextFromDocx,
  validateExtractedText,
  extractTextFromPdfWithTextract
} from '../utils/extractText';
import { writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extracts text from various document formats
 * 
 * @param {Buffer} buffer - The file buffer
 * @param {String} mimeType - The file MIME type
 * @param {Object} options - Extraction options
 * @returns {Object} The extracted text and metadata
 */
export async function extractText(buffer, mimeType, options = {}) {
  const { enableOcr = false } = options;
  let text = '';
  let textExtractionMethod = 'standard';
  
  console.log(`Extracting text from ${mimeType} document, OCR enabled: ${enableOcr}`);
  
  try {
    // Validate input
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty file buffer provided');
    }
    
    // Set defaults
    const {
      validateContent = process.env.BYPASS_TEXT_VALIDATION !== 'true',
      minLength = 25,
    } = options;
    
    // Extract based on file type
    if (mimeType.includes('pdf')) {
      // Use Textract for PDF extraction if enabled in the environment
      if (process.env.USE_TEXTRACT === 'true') {
        text = await extractTextFromPdfWithTextract(buffer, { useOcr: enableOcr });
        textExtractionMethod = 'textract';
      } else {
        text = await extractTextFromPdf(buffer, { useOcr: enableOcr });
      }
    } else if (mimeType.includes('text/plain')) {
      text = extractTextFromTxt(buffer);
    } else if (mimeType.includes('word') || mimeType.includes('docx')) {
      text = await extractTextFromDocx(buffer);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
    
    // Validate the extracted text
    const validation = validateExtractedText(text, { minLength, validateContent });
    
    // Provide dev fallback if needed
    if (!validation.valid && process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Using placeholder text for invalid extraction');
      text = text || 'This is a placeholder text for development mode. Actual extraction failed.';
      validation.valid = true;
      validation.reason = 'dev_fallback';
    }
    
    return {
      text: validation.text || text,
      length: (validation.text || text).length,
      validation,
      mimeType,
      method: textExtractionMethod
    };
  } catch (error) {
    console.error('Text extraction error:', error);
    return {
      text: '',
      length: 0,
      validation: {
        valid: false,
        reason: 'extraction_error',
        error: error.message
      },
      mimeType,
      method: textExtractionMethod
    };
  }
}

/**
 * Validates the quality of extracted text
 * 
 * @param {String} text - The extracted text
 * @param {Object} options - Validation options
 * @returns {Object} Validation results
 */
export function validateExtractedText(text, options = {}) {
  const { minLength = 25, validateContent = true } = options;
  
  console.log(`Validating extracted text (${text?.length || 0} characters)`);
  
  // Skip validation if requested
  if (!validateContent) {
    return { valid: true, reason: 'validation_bypassed' };
  }
  
  if (!text || text.length < minLength) {
    console.log("❌ Text extraction failed or produced insufficient content");
    console.log(`Text length: ${text?.length || 0} characters`);
    return { valid: false, reason: "insufficient_content" };
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  
  // If the text doesn't have basic text indicators, it's likely poor quality
  if (!containsWords || !hasSpaces) {
    return { 
      valid: false, 
      reason: "poor_quality",
      issues: { containsWords, hasPunctuation, hasSpaces }
    };
  }
  
  // Check for potential OCR quality issues
  const hasExcessiveSymbols = (text.match(/[^\w\s.,;:?!'"()\-–—]/g) || []).length > text.length * 0.1;
  const hasUnusualPatterns = /(.)\1{5,}/.test(text); // Repeated characters
  
  if (hasExcessiveSymbols || hasUnusualPatterns) {
    return { 
      valid: true, 
      reason: "potential_ocr_issues",
      issues: { hasExcessiveSymbols, hasUnusualPatterns },
      quality: "low"
    };
  }
  
  return { valid: true, reason: "good_quality", quality: "good" };
}

/**
 * Saves a buffer to a temporary file for processing
 * 
 * @param {Buffer} buffer - The file buffer
 * @param {String} mimeType - The file MIME type
 * @returns {String} The temporary file path
 */
async function saveTempFile(buffer, mimeType) {
  try {
    // Create a unique directory in the temp folder
    const tempDir = path.join(tmpdir(), `docproc-${uuidv4()}`);
    await mkdir(tempDir, { recursive: true });
    
    // Determine file extension
    let extension = '.bin';
    if (mimeType === 'application/pdf') {
      extension = '.pdf';
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extension = '.docx';
    } else if (mimeType === 'application/msword') {
      extension = '.doc';
    } else if (mimeType.startsWith('text/')) {
      extension = '.txt';
    }
    
    // Create temp file path
    const tempFilePath = path.join(tempDir, `temp-${Date.now()}${extension}`);
    
    // Write buffer to file
    await writeFile(tempFilePath, buffer);
    
    return tempFilePath;
  } catch (error) {
    console.error('Error saving temporary file:', error);
    throw error;
  }
}

/**
 * Processes text into chunks for better handling in NLP tasks
 * 
 * @param {String} text - The full text to chunk
 * @param {Object} options - Chunking options
 * @returns {Array} Array of text chunks
 */
export function createTextChunks(text, options = {}) {
  const {
    chunkSize = 1000,
    overlap = 100,
    minLength = 50
  } = options;

  // If text is too short, return as single chunk
  if (text.length < minLength) {
    return [text];
  }

  const chunks = [];
  let position = 0;

  while (position < text.length) {
    // Calculate end position for this chunk
    let endPosition = Math.min(position + chunkSize, text.length);
    
    // Adjust end position to try to break at sentence boundaries
    if (endPosition < text.length) {
      // Look for sentence-ending characters within the last 20% of the chunk
      const lookbackRange = Math.max(endPosition - Math.floor(chunkSize * 0.2), position);
      
      // Find the last sentence boundary in the lookback range
      for (let i = endPosition; i >= lookbackRange; i--) {
        const char = text[i];
        if (char === '.' || char === '!' || char === '?') {
          endPosition = i + 1;
          break;
        }
      }
    }
    
    // Extract the chunk
    const chunk = text.substring(position, endPosition);
    if (chunk.trim().length >= minLength) {
      chunks.push(chunk);
    }
    
    // Move position for next chunk, accounting for overlap
    position = endPosition - overlap;
    
    // Ensure we're making forward progress
    if (position <= 0 || position >= text.length - minLength) {
      break;
    }
  }

  console.log(`Text chunked into ${chunks.length} segments (avg size: ${
    chunks.length ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length) : 0
  } chars)`);
  
  return chunks;
} 