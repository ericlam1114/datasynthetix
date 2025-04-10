// test-pdf-extraction.js
const fs = require('fs');
const path = require('path');
const { extractTextFromPdf } = require('./src/app/api/process-document/utils/extractText');

/**
 * Test PDF text extraction
 */
async function testPdfExtraction() {
  console.log('Starting PDF extraction test...');
  
  try {
    // Find a PDF file in the current directory
    const files = fs.readdirSync('.');
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.error('No PDF files found for testing');
      return;
    }
    
    const testFile = pdfFiles[0];
    console.log(`Testing with PDF file: ${testFile}`);
    
    // Read the file
    const pdfBuffer = fs.readFileSync(testFile);
    
    // Extract text
    console.log('Extracting text...');
    const extractedText = await extractTextFromPdf(pdfBuffer, { useOcr: false });
    
    // Output results
    console.log('\n--- EXTRACTION RESULTS ---');
    console.log(`Total extracted text length: ${extractedText.length} characters`);
    if (extractedText.length > 0) {
      console.log('\nFirst 500 characters of extracted text:');
      console.log(extractedText.substring(0, 500));
    } else {
      console.log('No text was extracted from the PDF.');
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during PDF extraction test:', error);
  }
}

// Run the test
testPdfExtraction().catch(console.error); 