// CommonJS version of extractText for testing
const pdfjs = require('pdfjs-dist');

// Configure pdfjs worker
try {
  // Import the worker directly
  const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.entry');
  
  // Check if GlobalWorkerOptions exists before setting workerSrc
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    console.log("PDF.js worker configured successfully (CJS)");
  } else {
    console.log("GlobalWorkerOptions not available in PDF.js");
  }
} catch (error) {
  console.error("Error configuring PDF.js worker:", error);
}

/**
 * Extract text from a PDF buffer
 * @param {Buffer} buffer - The PDF file buffer
 * @param {Object} options - Options for text extraction
 * @param {boolean} options.useOcr - Whether to use OCR if text extraction fails
 * @returns {Promise<string>} The extracted text
 */
async function extractTextFromPdf(buffer, options = {}) {
  try {
    console.log("Starting PDF text extraction");
    const uint8Array = new Uint8Array(buffer);
    
    // Load document
    const loadingTask = pdfjs.getDocument({ 
      data: uint8Array,
      disableFontFace: true,
      ignoreErrors: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    
    let extractedText = "";
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract text items and join with proper spacing
        const pageText = textContent.items.map((item) => item.str).join(" ");
        
        extractedText += pageText + "\n\n";
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
      }
    }
    
    // If no text was extracted and OCR is enabled, try OCR
    if (extractedText.trim().length === 0 && options.useOcr) {
      console.log("No text extracted, OCR would be used here if implemented");
      // OCR implementation would go here
    }
    
    return extractedText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "";
  }
}

/**
 * Extract text from a text file buffer
 * @param {Buffer} buffer - The text file buffer
 * @returns {string} The extracted text
 */
function extractTextFromTxt(buffer) {
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    console.error("Error extracting text from TXT:", error);
    return "";
  }
}

module.exports = {
  extractTextFromPdf,
  extractTextFromTxt
}; 