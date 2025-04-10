/**
 * OCR extractor module for server-side OCR processing
 * This module is dynamically imported only on the server side
 */

import { createCanvas } from 'canvas';
import * as Tesseract from 'tesseract.js';
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
    const worker = await Tesseract.createWorker('eng');
    
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
        const { data } = await worker.recognize(imageBuffer);
        const pageText = data.text;
        
        console.log(`OCR extracted ${pageText.length} characters from page ${i}`);
        fullText += pageText + '\n\n';
      } catch (pageError) {
        console.error(`Error processing page ${i} with OCR:`, pageError);
      }
    }
    
    // Terminate Tesseract worker
    await worker.terminate();
    
    console.log(`OCR extraction completed with ${fullText.length} total characters`);
    return fullText.trim();
  } catch (error) {
    console.error('OCR extraction failed:', error);
    throw error;
  }
} 