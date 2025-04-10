import * as pdfjs from 'pdfjs-dist';

// Check if OCR is enabled based on environment variable
const USE_OCR = process.env.USE_OCR === 'true';

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

/**
 * Extract text from a PDF file, with OCR fallback if enabled and on server
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text
 */
export async function extractTextFromPdf(buffer) {
  try {
    console.log('Starting text extraction from PDF');
    
    // First try regular text extraction
    const extractedText = await extractTextRegular(buffer);
    
    // Check if the extracted text is too short (indicating a scanned PDF)
    if (extractedText.length < 100 && USE_OCR && isServer) {
      console.log('Text extraction yielded insufficient results, attempting OCR');
      try {
        const ocrText = await performOCRExtraction(buffer);
        console.log('OCR extraction completed successfully');
        return ocrText;
      } catch (ocrError) {
        console.error('OCR extraction failed:', ocrError);
        // Return whatever text we got from regular extraction
        return extractedText;
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Extract text from PDF using regular PDF.js text extraction
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text
 */
async function extractTextRegular(buffer) {
  try {
    // Load the PDF document
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    
    // Get the number of pages and limit to first 50 pages
    const numPages = pdf.numPages;
    const pagesToProcess = Math.min(numPages, 50);
    console.log(`PDF has ${numPages} pages, processing first ${pagesToProcess}`);
    
    // Extract text from each page
    let fullText = '';
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const textItems = textContent.items.map(item => item.str).join(' ');
      fullText += textItems + '\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error in regular text extraction:', error);
    return ''; // Return empty string to trigger OCR if available
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
  
  try {
    console.log('Dynamically importing OCR module');
    // Dynamic import OCR module to avoid client-side issues
    const { extractTextWithOCR } = await import('./ocrExtractor');
    console.log('OCR module imported successfully');
    
    // Call the OCR extraction function
    const ocrText = await extractTextWithOCR(buffer);
    return ocrText;
  } catch (error) {
    console.error('Error in OCR extraction:', error);
    throw error;
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
    throw new Error(`Failed to extract text from txt file: ${error.message}`);
  }
}