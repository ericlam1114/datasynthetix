/**
 * Text extraction service for document processing
 * Centralizes text extraction from various document types with error handling
 */

import { extractTextFromPdf } from '../utils/extractText';
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
  try {
    console.log(`Starting text extraction from ${mimeType} file, size: ${buffer.length}`);
    
    // Validate input
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty file buffer provided');
    }
    
    // Set defaults
    const {
      enableOcr = process.env.USE_OCR === 'true' || process.env.NODE_ENV === 'development',
      validateContent = process.env.BYPASS_TEXT_VALIDATION !== 'true',
      minLength = 25,
    } = options;
    
    let text = '';
    
    // Extract based on file type
    if (mimeType === 'application/pdf') {
      text = await extractTextFromPdf(buffer, { enableOcr });
    } else if (mimeType.startsWith('text/')) {
      // Handle plain text files
      text = buffer.toString('utf-8');
    } else if (['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                'application/msword'].includes(mimeType)) {
      // For Word documents, we need to save the file first
      const tempFilePath = await saveTempFile(buffer, mimeType);
      text = await extractTextFromDocx(tempFilePath);
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
      text,
      length: text?.length || 0,
      validation,
      mimeType,
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
      mimeType
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
 * Extracts text from a Word document
 * NOTE: This is a placeholder for the actual implementation
 * 
 * @param {String} filePath - Path to the Word document
 * @returns {String} The extracted text
 */
async function extractTextFromDocx(filePath) {
  // This is a placeholder - in a real implementation, you'd use a library like:
  // - docx-parser
  // - mammoth
  // - textract
  
  // For now, just return a placeholder
  return "Text extraction from Word documents is not yet implemented";
}

/**
 * Processes text into chunks for better handling in NLP tasks
 * 
 * @param {String} text - The full text to chunk
 * @param {Object} options - Chunking options
 * @returns {Array} Array of text chunks
 */
export function createTextChunks(text, options = {}) {
  try {
    // Default options
    const {
      maxChunkSize = 1000,
      overlapSize = 100,
      preserveSentences = true
    } = options;
    
    if (!text) return [];
    
    const chunks = [];
    let startPos = 0;
    
    while (startPos < text.length) {
      // Calculate end position
      let endPos = startPos + maxChunkSize;
      
      // Don't exceed text length
      if (endPos > text.length) {
        endPos = text.length;
      } 
      // Try to break at sentence if preserving sentences
      else if (preserveSentences && endPos < text.length) {
        // Look for sentence breaks (., !, ?)
        const sentenceBreaks = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        
        // Look for a natural break within the last 20% of the chunk
        const lookbackStart = Math.max(startPos, endPos - Math.floor(maxChunkSize * 0.2));
        
        let foundBreak = false;
        for (const breakChar of sentenceBreaks) {
          // Find the last occurrence of the break within our lookback window
          const breakPos = text.lastIndexOf(breakChar, endPos);
          if (breakPos > lookbackStart) {
            endPos = breakPos + 1; // Include the period but not the space
            foundBreak = true;
            break;
          }
        }
        
        // If no sentence break found, try to break at a paragraph at least
        if (!foundBreak) {
          const paragraphBreaks = ['\n\n', '\r\n\r\n'];
          for (const breakChar of paragraphBreaks) {
            const breakPos = text.lastIndexOf(breakChar, endPos);
            if (breakPos > lookbackStart) {
              endPos = breakPos + breakChar.length;
              foundBreak = true;
              break;
            }
          }
        }
        
        // Last resort: break at a space to avoid cutting words
        if (!foundBreak) {
          const lastSpace = text.lastIndexOf(' ', endPos);
          if (lastSpace > startPos) {
            endPos = lastSpace + 1;
          }
        }
      }
      
      // Extract the chunk
      const chunk = text.substring(startPos, endPos).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      
      // Move start position for next chunk, accounting for overlap
      startPos = Math.min(text.length, endPos - overlapSize);
      
      // Avoid infinite loops if we can't make progress
      if (startPos >= endPos) {
        startPos = endPos;
      }
    }
    
    console.log(`Split text into ${chunks.length} chunks`);
    return chunks;
  } catch (error) {
    console.error('Error creating text chunks:', error);
    // Return single chunk for safety
    return [text];
  }
} 