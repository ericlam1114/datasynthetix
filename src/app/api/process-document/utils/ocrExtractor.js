/**
 * OCR extractor module for server-side OCR processing
 * This module is dynamically imported only on the server side
 */

// Ensure this file is only executed on the server side
if (typeof window !== 'undefined') {
  throw new Error('OCR extractor should only be used on the server side');
}

// Import server-only dependencies
import { createCanvas } from 'canvas';
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js for server environment
const PDFJS_WORKER_SRC = `${process.cwd()}/node_modules/pdfjs-dist/build/pdf.worker.js`;
pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

/**
 * Extract text from a PDF buffer using OCR
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text from OCR
 */
export async function extractTextWithOCR(buffer) {
  try {
    console.log('Starting OCR extraction process');
    
    // Load PDF document
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    
    // Get the number of pages and limit to a reasonable number
    const numPages = pdf.numPages;
    const pagesToProcess = Math.min(numPages, 20); // Process maximum 20 pages for OCR
    console.log(`OCR processing ${pagesToProcess} of ${numPages} pages`);
    
    // Process each page with OCR
    let fullText = '';
    
    // Initialize Tesseract worker
    console.log('Initializing Tesseract worker...');
    const worker = await createWorker('eng');
    console.log('Tesseract worker initialized');
    
    // Process each page
    for (let i = 1; i <= pagesToProcess; i++) {
      try {
        console.log(`OCR processing page ${i} of ${pagesToProcess}`);
        
        // Render PDF page to canvas
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better OCR
        
        // Create canvas with correct dimensions
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        // Render PDF page to canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Get image data from canvas for OCR
        const imageBuffer = canvas.toBuffer('image/png');
        
        // Perform OCR on the image
        console.log(`Running OCR on page ${i} image...`);
        const { data } = await worker.recognize(imageBuffer);
        const pageText = data.text;
        
        console.log(`OCR extracted ${pageText.length} characters from page ${i}`);
        fullText += pageText + '\n\n';
      } catch (pageError) {
        console.error(`Error processing page ${i} with OCR:`, pageError);
      }
    }
    
    // Terminate Tesseract worker
    console.log('Terminating Tesseract worker...');
    await worker.terminate();
    console.log('Tesseract worker terminated');
    
    console.log(`OCR extraction completed with ${fullText.length} total characters`);
    return fullText.trim();
  } catch (error) {
    console.error('OCR extraction failed:', error);
    throw error;
  }
} 