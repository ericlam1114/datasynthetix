// Test script for diagnosing PDF extraction issues
const fs = require('fs');
const pdfjs = require('pdfjs-dist');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

// Function to validate text extraction
function validateExtractedText(text) {
  if (!text || text.length < 50) {
    console.log("❌ Text extraction failed or produced insufficient content");
    console.log(`Text length: ${text?.length || 0} characters`);
    return false;
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  console.log(`Text length: ${text.length} characters`);
  
  if (containsWords && (hasPunctuation || hasSpaces)) {
    console.log("✅ Text extraction appears successful");
    return true;
  } else {
    console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
    return false;
  }
}

// Function to examine binary content of PDF
function examineFileBytes(buffer) {
  console.log("Examining file bytes:");
  console.log(`File size: ${buffer.length} bytes`);
  
  // Check PDF signature
  const signature = buffer.slice(0, 5).toString();
  console.log(`File signature: ${signature}`);
  
  if (signature !== '%PDF-') {
    console.log("❌ Invalid PDF signature! This may not be a valid PDF file.");
  } else {
    console.log("✅ Valid PDF signature detected");
    
    // Check PDF version
    const versionByte = buffer[5];
    console.log(`PDF version: 1.${versionByte - 48}`);
  }
  
  // Check for encryption/protection
  const fileStr = buffer.toString('utf8', 0, Math.min(2000, buffer.length));
  if (fileStr.includes('/Encrypt')) {
    console.log("⚠️ PDF appears to be encrypted or password-protected");
  }
}

// Standard extraction
async function standardExtractText(buffer) {
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    
    // Load document
    const loadingTask = pdfjs.getDocument({ 
      data: uint8Array,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none',
      ignoreErrors: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    
    // Check for permissions and encryption
    try {
      const permissions = await pdf.getPermissions();
      console.log("PDF permissions:", permissions);
    } catch (e) {
      console.log("Could not retrieve permissions");
    }
    
    try {
      const metadata = await pdf.getMetadata();
      console.log("PDF metadata:", metadata);
    } catch (e) {
      console.log("Could not retrieve metadata");
    }
    
    let extractedText = "";
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        console.log(`Found ${textContent.items.length} text items on page ${i}`);
        
        // Extract text items and join with proper spacing
        const pageText = textContent.items.map((item) => item.str).join(" ");
        console.log(`Page ${i} sample text: "${pageText.substring(0, 100)}..."`);
        
        extractedText += pageText + "\n\n";
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error("Error in standard extraction:", error);
    throw error;
  }
}

// Enhanced extraction with position awareness
async function enhancedExtractText(buffer) {
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    
    // Load document
    const loadingTask = pdfjs.getDocument({ 
      data: uint8Array,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none',
      ignoreErrors: true
    });
    
    const pdf = await loadingTask.promise;
    let extractedText = "";
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Enhanced processing page ${i}/${pdf.numPages}`);
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Group text items by their approximate vertical position (y-coordinate)
        const yPositionThreshold = 5;
        const textByVerticalPosition = {};
        
        textContent.items.forEach(item => {
          // Round the y-position to group nearby items
          const yPosition = Math.round(item.transform[5] / yPositionThreshold) * yPositionThreshold;
          
          if (!textByVerticalPosition[yPosition]) {
            textByVerticalPosition[yPosition] = [];
          }
          
          textByVerticalPosition[yPosition].push(item);
        });
        
        // Sort by vertical position (top to bottom)
        const sortedYPositions = Object.keys(textByVerticalPosition).sort((a, b) => b - a);
        
        let pageText = "";
        // For each vertical position, sort items horizontally (left to right)
        sortedYPositions.forEach(yPosition => {
          textByVerticalPosition[yPosition].sort((a, b) => a.transform[4] - b.transform[4]);
          
          // Add the text for this line
          const lineText = textByVerticalPosition[yPosition].map(item => item.str).join(" ");
          pageText += lineText + "\n";
        });
        
        extractedText += pageText + "\n\n";
      } catch (pageError) {
        console.error(`Error in enhanced processing page ${i}:`, pageError);
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error("Error in enhanced extraction:", error);
    throw error;
  }
}

// Debug a PDF file
async function debugPdf(filePath) {
  try {
    console.log(`Testing PDF extraction with file: ${filePath}`);
    
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`File loaded successfully: ${fileBuffer.length} bytes`);
    
    // Examine the binary content
    examineFileBytes(fileBuffer);
    
    // Test standard extraction
    console.log('\n=== STANDARD EXTRACTION ===');
    let standardText;
    try {
      standardText = await standardExtractText(fileBuffer);
      validateExtractedText(standardText);
      console.log('\nStandard extraction sample:');
      console.log('--------------------------------------------------');
      console.log(standardText.substring(0, 300) + '...');
      console.log('--------------------------------------------------');
    } catch (error) {
      console.error('Standard extraction failed:', error);
    }
    
    // Test enhanced extraction
    console.log('\n=== ENHANCED EXTRACTION ===');
    try {
      const enhancedText = await enhancedExtractText(fileBuffer);
      validateExtractedText(enhancedText);
      console.log('\nEnhanced extraction sample:');
      console.log('--------------------------------------------------');
      console.log(enhancedText.substring(0, 300) + '...');
      console.log('--------------------------------------------------');
      
      // Compare the results
      if (standardText && enhancedText) {
        console.log('\n=== COMPARISON ===');
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

// Run the test on the PDF file
debugPdf('./Commercial Tax Appeal Inquiry Questionnaire.pdf'); 