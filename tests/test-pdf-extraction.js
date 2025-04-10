require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Import pdf.js directly (not dynamically)
const pdfjs = require('pdfjs-dist');
// Set worker path properly
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

// Utility function to extract text from PDF buffer
async function extractTextFromPdf(buffer) {
  console.log('Starting PDF extraction');
  console.log('Loading PDF document');
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    // Load document
    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    let extractedText = "";

    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      console.log(`Found ${textContent.items.length} text items on page ${i}`);
      // Extract text items and join with proper spacing
      const pageText = textContent.items.map((item) => item.str).join(" ");

      extractedText += pageText + "\n\n";
    }

    return extractedText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// Enhanced extraction with better text positioning
async function enhancedExtractTextFromPdf(buffer) {
  console.log('Starting enhanced PDF extraction');
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    // Load document
    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    let extractedText = "";

    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      console.log(`Found ${textContent.items.length} text items on page ${i}`);

      // Group text items by their vertical position to preserve reading order
      const textItems = textContent.items;
      
      // Group text items by their approximate vertical position (y-coordinate)
      // This helps maintain reading order when text is arranged in columns
      const yPositionThreshold = 5; // Adjust based on document characteristics
      const textByVerticalPosition = {};
      
      textItems.forEach(item => {
        // Round the y-position to group nearby items
        const yPosition = Math.round(item.transform[5] / yPositionThreshold) * yPositionThreshold;
        
        if (!textByVerticalPosition[yPosition]) {
          textByVerticalPosition[yPosition] = [];
        }
        
        textByVerticalPosition[yPosition].push(item);
      });
      
      // Sort by vertical position (top to bottom)
      const sortedYPositions = Object.keys(textByVerticalPosition).sort((a, b) => b - a);
      
      // For each vertical position, sort items horizontally (left to right)
      sortedYPositions.forEach(yPosition => {
        textByVerticalPosition[yPosition].sort((a, b) => a.transform[4] - b.transform[4]);
        
        // Add the text for this line
        const lineText = textByVerticalPosition[yPosition].map(item => item.str).join(" ");
        extractedText += lineText + "\n";
      });
      
      extractedText += "\n"; // Add extra newline between pages
    }

    return extractedText;
  } catch (error) {
    console.error("Error in enhanced PDF extraction:", error);
    throw new Error(`Enhanced PDF extraction failed: ${error.message}`);
  }
}

// Function to check if text extraction worked
function validateExtractedText(text) {
  if (!text || text.length < 50) {
    console.log("❌ Text extraction failed or produced insufficient content");
    return false;
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  
  if (containsWords && (hasPunctuation || hasSpaces)) {
    console.log("✅ Text extraction appears successful");
    return true;
  } else {
    console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
    return false;
  }
}

// Main test function
async function testPdfExtraction(filePath) {
  console.log(`Testing PDF extraction with file: ${filePath}`);
  
  try {
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`File loaded successfully: ${fileBuffer.length} bytes`);
    
    // Inspect the PDF structure
    console.log('\n========= INSPECTING PDF STRUCTURE =========');
    try {
      await inspectPdfStructure(fileBuffer);
    } catch (error) {
      console.error('PDF inspection failed:', error.message);
    }
    
    // Test standard extraction
    console.log('\n========= TESTING STANDARD EXTRACTION =========');
    let standardText;
    try {
      standardText = await extractTextFromPdf(fileBuffer);
      console.log('Standard extraction result:');
      console.log('--------------------------------------------------');
      console.log(standardText.substring(0, 500) + '...');
      console.log('--------------------------------------------------');
      console.log(`Extracted ${standardText.length} characters`);
    } catch (error) {
      console.error('Standard extraction failed:', error);
    }
    
    // Test enhanced extraction
    console.log('\n========= TESTING ENHANCED EXTRACTION =========');
    try {
      const enhancedText = await enhancedExtractTextFromPdf(fileBuffer);
      console.log('Enhanced extraction result:');
      console.log('--------------------------------------------------');
      console.log(enhancedText.substring(0, 500) + '...');
      console.log('--------------------------------------------------');
      console.log(`Extracted ${enhancedText.length} characters`);
      
      // Compare the results
      if (standardText && enhancedText) {
        console.log('\n========= COMPARISON =========');
        console.log(`Standard extraction: ${standardText.length} characters`);
        console.log(`Enhanced extraction: ${enhancedText.length} characters`);
        console.log(`Difference: ${Math.abs(standardText.length - enhancedText.length)} characters`);
      }
    } catch (error) {
      console.error('Enhanced extraction failed:', error);
    }
    
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
  }
}

// Debugging utility to inspect PDF structure
async function inspectPdfStructure(buffer) {
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF Document loaded successfully.`);
    console.log(`Number of pages: ${pdf.numPages}`);
    
    // Get metadata if available
    try {
      const metadata = await pdf.getMetadata();
      console.log('PDF Metadata:', JSON.stringify(metadata, null, 2));
    } catch (e) {
      console.log('Metadata not available');
    }
    
    // Examine the first page in detail
    const page = await pdf.getPage(1);
    console.log(`Page 1 size: width=${page.view[2]}, height=${page.view[3]}`);
    
    const textContent = await page.getTextContent();
    console.log(`Page 1 has ${textContent.items.length} text items`);
    
    // Log the first few text items to understand structure
    if (textContent.items.length > 0) {
      console.log('Sample of first 5 text items:');
      textContent.items.slice(0, 5).forEach((item, i) => {
        console.log(`Item ${i}:`, {
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          fontSize: item.fontSize,
          fontName: item.fontName
        });
      });
    }
    
    return {
      numPages: pdf.numPages,
      firstPageTextItems: textContent.items.length
    };
  } catch (error) {
    console.error("Error inspecting PDF:", error);
    throw new Error(`PDF inspection failed: ${error.message}`);
  }
}

// Check if a file path was provided
const filePath = process.argv[2];
if (!filePath) {
  console.error("Please provide a PDF file path as an argument");
  process.exit(1);
}

// Run the test
testPdfExtraction(filePath); 