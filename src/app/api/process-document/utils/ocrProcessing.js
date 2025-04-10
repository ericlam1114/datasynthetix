// OCR Processing Module
// This is a server-side only module for processing PDF documents using OCR
// It is separated to ensure it doesn't get imported on the client side

if (typeof window !== 'undefined') {
  throw new Error('This module is intended for server-side use only');
}

let tesseract;
let createScheduler;
let createWorker;
let PSM;

// Asynchronously initialize Tesseract components
async function initTesseract() {
  try {
    // Dynamic import of Tesseract.js modules
    const tesseractModule = await import('tesseract.js');
    tesseract = tesseractModule.default;
    createScheduler = tesseractModule.createScheduler;
    createWorker = tesseractModule.createWorker;
    PSM = tesseractModule.PSM;
    
    console.log("Tesseract.js modules loaded successfully");
    return true;
  } catch (error) {
    console.error("Failed to load Tesseract.js:", error);
    return false;
  }
}

// Import other needed server-side modules
let Canvas;
let Image;

try {
  // These imports might fail in a browser environment 
  // but will work in Node.js
  ({ Canvas, Image } = require('canvas'));
  console.log("Canvas module loaded successfully");
} catch (error) {
  console.error("Failed to load canvas module:", error);
}

// Convert PDF to images for OCR processing
async function convertPdfToImages(pdfBuffer, numPages) {
  if (!Canvas || !Image) {
    throw new Error("Canvas module not available for PDF to image conversion");
  }
  
  try {
    // Import pdf-lib and pdfjs-dist as needed for conversion
    const { PDFDocument } = await import('pdf-lib');
    const pdfjs = await import('pdfjs-dist');
    
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const images = [];
    
    // Load the PDF with pdf.js
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdf = await loadingTask.promise;
    
    console.log(`Preparing to convert ${Math.min(numPages, pdf.numPages)} pages to images`);
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        
        // Create canvas for rendering
        const canvas = new Canvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        // Render the page to canvas
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // Get image data
        const imageData = canvas.toBuffer('image/png');
        images.push(imageData);
        
        console.log(`Converted page ${i} to image (${imageData.length} bytes)`);
      } catch (pageError) {
        console.error(`Error converting page ${i} to image:`, pageError);
      }
    }
    
    return images;
  } catch (error) {
    console.error("Error converting PDF to images:", error);
    throw error;
  }
}

/**
 * Process images with OCR
 * @param {Buffer[]} images - Array of image buffers to process
 * @returns {Promise<string>} Combined OCR text from all images
 */
async function processImagesWithOCR(images) {
  const tesseractInitialized = await initTesseract();
  if (!tesseractInitialized) {
    throw new Error("Could not initialize Tesseract.js");
  }
  
  try {
    console.log(`Processing ${images.length} images with OCR`);
    
    // Create a scheduler to manage multiple workers
    const scheduler = createScheduler();
    const workerCount = Math.min(images.length, 2); // Limit workers to avoid memory issues
    
    // Create workers and add to scheduler
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      const worker = await createWorker({
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.floor(m.progress * 100)}%`);
          }
        }
      });
      
      // Initialize the worker with English language
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tessedit_ocr_engine_mode: 1, // Use LSTM only
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
      });
      
      workers.push(worker);
      scheduler.addWorker(worker);
    }
    
    // Process all images
    const results = [];
    for (let i = 0; i < images.length; i++) {
      try {
        console.log(`OCR processing image ${i + 1} of ${images.length}`);
        const { data } = await scheduler.addJob('recognize', images[i]);
        results.push(data.text);
        console.log(`OCR completed for image ${i + 1} (extracted ${data.text.length} characters)`);
      } catch (error) {
        console.error(`OCR processing failed for image ${i + 1}:`, error);
      }
    }
    
    // Terminate workers
    console.log("Terminating OCR workers");
    await Promise.all(workers.map(worker => worker.terminate()));
    
    // Combine results
    return results.join('\n\n');
  } catch (error) {
    console.error("Error processing images with OCR:", error);
    throw error;
  }
}

/**
 * Extract text from a PDF using OCR
 * @param {Buffer} pdfBuffer - Buffer containing PDF data
 * @param {number} numPages - Number of pages in the PDF
 * @returns {Promise<string>} Extracted text from OCR
 */
export async function extractTextWithOCR(pdfBuffer, numPages) {
  try {
    console.log("Starting OCR-based text extraction");
    
    // Convert PDF pages to images
    const images = await convertPdfToImages(pdfBuffer, numPages);
    
    if (images.length === 0) {
      console.error("No images were generated from the PDF");
      return "";
    }
    
    console.log(`Successfully generated ${images.length} images from PDF`);
    
    // Process images with OCR
    const extractedText = await processImagesWithOCR(images);
    
    console.log(`OCR extraction completed with ${extractedText.length} characters`);
    return extractedText;
  } catch (error) {
    console.error("OCR extraction failed:", error);
    return "";
  }
} 