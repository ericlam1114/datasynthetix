import * as pdfjs from 'pdfjs-dist';

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
 * Extract text from a PDF file, with OCR fallback if available
 * @param {Buffer} buffer - PDF file buffer
 * @param {Object} options - Extraction options
 * @param {boolean} options.useOcr - Whether to use OCR (if available)
 * @param {boolean} options.attemptAlternativeMethods - Try multiple extraction methods
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdf(buffer, options = {}) {
  const useOcr = options.useOcr || USE_OCR;
  const attemptAlternativeMethods = options.attemptAlternativeMethods || false;
  
  // Prepare an array to collect text from all pages
  let extractedText = '';
  
  // First try standard PDF.js extraction
  try {
    console.log('Loading PDF document with PDF.js');
    
    // Apply a timeout to prevent hanging on problematic PDFs (30 second timeout)
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdfDocument = await withTimeout(
      loadingTask.promise, 
      30000, 
      'PDF loading timed out - document may be corrupted or password-protected'
    );
    
    console.log(`PDF loaded successfully. Pages: ${pdfDocument.numPages}`);
    
    // Apply a timeout for the entire extraction process (2 minutes)
    const extractAllPages = async () => {
      let combinedText = '';
      
      // Limit to maximum 100 pages for performance
      const pageCount = Math.min(pdfDocument.numPages, 100);
      
      for (let i = 1; i <= pageCount; i++) {
        try {
          // Set a timeout for each page (15 seconds per page)
          const page = await withTimeout(
            pdfDocument.getPage(i), 
            15000, 
            `Timed out getting page ${i}`
          );
          
          // Extract text content from the page
          const content = await withTimeout(
            page.getTextContent(), 
            15000, 
            `Timed out extracting text from page ${i}`
          );
          
          // Combine text items
          const pageText = content.items
            .map(item => item.str)
            .join(' ');
          
          combinedText += pageText + '\n\n';
          
          console.log(`Extracted ${pageText.length} characters from page ${i}`);
        } catch (pageError) {
          console.error(`Error extracting text from page ${i}:`, pageError.message);
          
          // Continue with next page instead of failing completely
          combinedText += `[Error extracting page ${i}]\n\n`;
        }
      }
      
      return combinedText;
    };
    
    // Apply an overall timeout for the entire extraction
    extractedText = await withTimeout(
      extractAllPages(), 
      120000, 
      'PDF text extraction timed out - document may be too large or complex'
    );
    
    console.log(`Extracted ${extractedText.length} characters from PDF`);
    
    // If we got very little text and OCR is available, try OCR
    if (extractedText.length < 50 && useOcr) {
      console.log('Standard extraction produced little text, falling back to OCR');
      const ocrText = await performOCRExtraction(buffer);
      
      if (ocrText && ocrText.length > extractedText.length) {
        extractedText = ocrText;
        console.log(`Using OCR result: ${extractedText.length} characters`);
      }
    }
  } catch (error) {
    console.error('PDF.js extraction failed:', error.message);
    
    // Try OCR if available
    if (useOcr) {
      try {
        console.log('Falling back to OCR extraction');
        extractedText = await performOCRExtraction(buffer);
        console.log(`OCR extraction result: ${extractedText.length} characters`);
      } catch (ocrError) {
        console.error('OCR extraction also failed:', ocrError.message);
        
        // If both methods failed, return empty string
        if (!extractedText) {
          throw new Error(`PDF text extraction failed: ${error.message}. OCR failed: ${ocrError.message}`);
        }
      }
    } else {
      // Re-throw the error if OCR is not available
      throw error;
    }
  }
  
  return extractedText || '';
}

/**
 * Extract text from PDF using regular PDF.js text extraction
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text
 */
async function extractTextRegular(buffer) {
  try {
    // Load the PDF document
    const loadingTask = pdfjs.getDocument({ 
      data: buffer,
      disableFontFace: true, // Improved extraction by disabling font face
      ignoreErrors: true     // Continue even if there are non-critical errors
    });
    const pdf = await loadingTask.promise;
    
    // Get the number of pages and limit to first 50 pages
    const numPages = pdf.numPages;
    const pagesToProcess = Math.min(numPages, 50);
    console.log(`PDF has ${numPages} pages, processing first ${pagesToProcess}`);
    
    // Extract text from each page
    let fullText = '';
    for (let i = 1; i <= pagesToProcess; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map(item => item.str).join(' ');
        fullText += textItems + '\n';
      } catch (pageError) {
        console.error(`Error extracting text from page ${i}:`, pageError);
      }
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error in regular text extraction:', error);
    
    // In development, return empty string instead of throwing
    if (process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Treating text extraction error as empty text');
      return '';
    }
    
    throw error; // Re-throw in production
  }
}

/**
 * Perform OCR extraction on a PDF file
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text
 */
async function performOCRExtraction(buffer) {
  // Only run OCR on server-side
  if (!isServer) {
    console.warn('OCR can only be performed on server-side');
    return '';
  }
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  try {
    console.log('Dynamically importing OCR module');
    // Dynamic import OCR module to avoid client-side issues
    try {
      const { extractTextWithOCR } = await import('./ocrExtractor');
      console.log('OCR module imported successfully');
      
      // Call the OCR extraction function with a timeout (2 minutes)
      try {
        const ocrTextPromise = extractTextWithOCR(buffer);
        const ocrText = await withTimeout(
          ocrTextPromise,
          120000,
          'OCR processing timed out - document may be too large or complex'
        );
        
        return ocrText || '';
      } catch (ocrError) {
        console.error('OCR extraction function failed:', ocrError.message);
        
        // In development mode, return a placeholder
        if (isDevelopment) {
          return 'OCR processing failed. This is a placeholder text for development mode.';
        }
        throw ocrError;
      }
    } catch (importError) {
      console.error('Error importing OCR module:', importError.message);
      
      // Provide a fallback in development
      if (isDevelopment) {
        return 'OCR module not available. This is a placeholder text for development mode.';
      }
      throw importError;
    }
  } catch (error) {
    console.error('OCR extraction error:', error.message);
    return '';
  }
}

/**
 * Extract text from a txt file
 * @param {Buffer} buffer - The txt file buffer
 * @returns {Promise<string>} - The extracted text
 */
export function extractTextFromTxt(buffer) {
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    console.error('Error extracting text from txt file:', error);
    
    // In development, don't crash
    if (process.env.NODE_ENV === 'development') {
      return "Error extracting text from TXT file.";
    }
    
    throw new Error(`Failed to extract text from txt file: ${error.message}`);
  }
}