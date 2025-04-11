const { PDFDocument } = require('pdf-lib');
const pdfjs = require('pdfjs-dist/legacy/build/pdf');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

/**
 * Enhanced PDF text extraction with multiple methods and better error handling
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {Object} options - Options for extraction
 * @returns {Promise<string>} - The extracted text
 */
async function extractTextFromPdf(pdfBuffer, options = {}) {
  const {
    attemptAllMethods = true, // Whether to try all methods even if one succeeds
    logProgress = false,
    minimumAcceptableText = 200, // Minimum characters to consider successful
  } = options;

  let extractionMethods = [];
  
  // Log progress if enabled
  const log = (...args) => {
    if (logProgress) console.log(...args);
  };
  
  log(`Starting PDF text extraction using multiple methods`);
  
  try {
    // Method 1: PDF.js extraction (position-aware, groups lines correctly)
    try {
      log('Attempting extraction using PDF.js with position-aware layout...');
      
      // Set the PDF.js worker source
      const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
      if (typeof window === 'undefined') {
        // Node.js environment
        pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      }
      
      // Load the PDF document
      const pdfData = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({ 
        data: pdfData,
        disableFontFace: true,
        nativeImageDecoderSupport: 'none',
        ignoreErrors: true
      });
      const pdf = await loadingTask.promise;
      
      log(`PDF loaded with ${pdf.numPages} pages`);
      
      // Extract text from each page
      let allPageTexts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false
          });
          
          // Group text items by their approximate vertical position
          const yPositionThreshold = 5;
          const textByVerticalPosition = {};
          
          textContent.items.forEach(item => {
            const yPosition = Math.round(item.transform[5] / yPositionThreshold) * yPositionThreshold;
            
            if (!textByVerticalPosition[yPosition]) {
              textByVerticalPosition[yPosition] = [];
            }
            
            textByVerticalPosition[yPosition].push(item);
          });
          
          // Sort by vertical position (top to bottom)
          const sortedYPositions = Object.keys(textByVerticalPosition).sort((a, b) => b - a);
          
          // For each vertical position, sort items horizontally (left to right)
          let pageText = "";
          sortedYPositions.forEach(yPosition => {
            textByVerticalPosition[yPosition].sort((a, b) => a.transform[4] - b.transform[4]);
            
            // Add the text for this line
            const lineText = textByVerticalPosition[yPosition].map(item => item.str).join(" ");
            pageText += lineText + "\n";
          });
          
          allPageTexts.push(pageText);
          
          if (i % 10 === 0 || i === pdf.numPages) {
            log(`Processed ${i}/${pdf.numPages} pages with PDF.js`);
          }
        } catch (pageErr) {
          log(`Error extracting page ${i}: ${pageErr.message}`);
        }
      }
      
      const pdfJsText = allPageTexts.join('\n\n');
      log(`PDF.js position-aware extraction: ${pdfJsText.length} characters`);
      
      extractionMethods.push({
        method: 'pdfjs-position',
        text: pdfJsText,
        length: pdfJsText.length
      });
      
      if (pdfJsText.length > minimumAcceptableText && !attemptAllMethods) {
        log('PDF.js position-aware extraction successful, returning result');
        return pdfJsText;
      }
    } catch (e) {
      log('PDF.js position-aware extraction failed:', e.message);
    }
    
    // Method 2: PDF.js extraction (simple, less position aware but more reliable sometimes)
    try {
      log('Attempting extraction using PDF.js (simple method)...');
      
      // Set the PDF.js worker source again if needed
      if (typeof window === 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
        const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      }
      
      // Load the PDF document
      const pdfData = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({ 
        data: pdfData,
        disableFontFace: true,
        nativeImageDecoderSupport: 'none',
        ignoreErrors: true
      });
      const pdf = await loadingTask.promise;
      
      // Extract text from each page (simpler method)
      let allPageTexts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(" ");
          allPageTexts.push(pageText);
        } catch (pageErr) {
          log(`Error extracting page ${i} (simple method): ${pageErr.message}`);
        }
      }
      
      const pdfJsSimpleText = allPageTexts.join('\n\n');
      log(`PDF.js simple extraction: ${pdfJsSimpleText.length} characters`);
      
      extractionMethods.push({
        method: 'pdfjs-simple',
        text: pdfJsSimpleText,
        length: pdfJsSimpleText.length
      });
      
      if (pdfJsSimpleText.length > minimumAcceptableText && !attemptAllMethods) {
        log('PDF.js simple extraction successful, returning result');
        return pdfJsSimpleText;
      }
    } catch (e) {
      log('PDF.js simple extraction failed:', e.message);
    }
    
    // Method 3: pdf-parse extraction (simpler but sometimes works better)
    try {
      log('Attempting extraction using pdf-parse...');
      
      const data = await pdfParse(pdfBuffer);
      const parsedText = data.text || '';
      
      log(`pdf-parse extracted ${parsedText.length} characters`);
      
      extractionMethods.push({
        method: 'pdf-parse',
        text: parsedText,
        length: parsedText.length
      });
      
      if (parsedText.length > minimumAcceptableText && !attemptAllMethods) {
        log('pdf-parse extraction successful, returning result');
        return parsedText;
      }
    } catch (e) {
      log('pdf-parse extraction failed:', e.message);
    }
    
    // Choose the best extraction result
    if (extractionMethods.length > 0) {
      // Sort by text length (descending) to get the most comprehensive result
      extractionMethods.sort((a, b) => b.length - a.length);
      
      // Get the method with the most text
      const bestMethod = extractionMethods[0];
      log(`Using best extraction method: ${bestMethod.method} with ${bestMethod.length} characters`);
      
      // If the best method has a reasonable amount of text, use it
      if (bestMethod.length > 50) {
        return bestMethod.text;
      }
    }
    
    // Ultimate fallback: Basic string extraction from buffer (rarely useful but better than nothing)
    log('All extraction methods failed or produced minimal text, attempting basic fallback');
    const fallbackText = Buffer.from(pdfBuffer).toString('utf8', 0, 10000)
      .replace(/[^\x20-\x7E\n]/g, ' ') // Keep only ASCII printable chars
      .replace(/\s+/g, ' '); // Normalize whitespace
    
    return fallbackText;
  } catch (error) {
    log('PDF extraction error:', error);
    return '';
  }
}

/**
 * Validates extracted text to ensure quality
 * @param {string} text - The extracted text to validate
 * @returns {Object} Validation result with details
 */
function validateExtractedText(text) {
  if (!text || text.length < 50) {
    return {
      valid: false,
      reason: "Insufficient text extracted",
      details: { length: text?.length || 0 }
    };
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  if (containsWords && (hasPunctuation || hasSpaces)) {
    return {
      valid: true,
      details: {
        length: text.length,
        hasWords: containsWords,
        hasPunctuation,
        hasSpaces
      }
    };
  } else {
    return {
      valid: false,
      reason: "Content doesn't appear to be valid text",
      details: {
        length: text.length,
        hasWords: containsWords,
        hasPunctuation,
        hasSpaces
      }
    };
  }
}

module.exports = {
  extractTextFromPdf,
  validateExtractedText
}; 