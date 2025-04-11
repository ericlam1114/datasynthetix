// Integration test for document processing with Textract
const fs = require('fs');
const path = require('path');
const https = require('https');
const { extractTextFromPdfWithTextract } = require('./src/app/api/process-document/utils/extractText');

// Sample PDF URL
const SAMPLE_PDF_URL = 'https://www.africau.edu/images/default/sample.pdf';
const SAMPLE_PDF_PATH = path.join(__dirname, 'test-doc.pdf');

// Download the PDF file
async function downloadPdf() {
  return new Promise((resolve, reject) => {
    // Check if already exists
    if (fs.existsSync(SAMPLE_PDF_PATH)) {
      console.log(`Using existing PDF at ${SAMPLE_PDF_PATH}`);
      return resolve(SAMPLE_PDF_PATH);
    }
    
    console.log(`Downloading PDF from ${SAMPLE_PDF_URL}...`);
    const file = fs.createWriteStream(SAMPLE_PDF_PATH);
    
    https.get(SAMPLE_PDF_URL, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download PDF: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded PDF to ${SAMPLE_PDF_PATH}`);
        resolve(SAMPLE_PDF_PATH);
      });
    }).on('error', err => {
      fs.unlink(SAMPLE_PDF_PATH, () => {}); // Delete file on error
      reject(err);
    });
  });
}

// Test the integration
async function testIntegration() {
  try {
    console.log('Starting document processing integration test with Textract');
    
    // Download the PDF (or use existing)
    await downloadPdf();
    
    // Read the PDF buffer
    const pdfBuffer = await fs.promises.readFile(SAMPLE_PDF_PATH);
    console.log(`PDF loaded: ${pdfBuffer.length} bytes`);
    
    // Extract text using our app's Textract integration
    console.log('\nExtracting text using app code with Textract...');
    console.time('textractExtraction');
    const extractedText = await extractTextFromPdfWithTextract(pdfBuffer, { useOcr: true });
    console.timeEnd('textractExtraction');
    
    // Print results
    console.log(`\n✅ Textract extraction complete!`);
    console.log(`Extracted ${extractedText.length} characters`);
    console.log('\nSample extracted text:');
    console.log('-----------------');
    console.log(extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''));
    console.log('-----------------');
    
    // Verify results
    const success = extractedText && extractedText.length > 100; // Arbitrary success threshold
    
    if (success) {
      console.log('\n✅ Integration test PASSED - Textract is working correctly with your app code');
    } else {
      console.log('\n❌ Integration test FAILED - Extracted text too short or empty');
    }
    
    return success;
  } catch (error) {
    console.error('\n❌ Integration test failed with error:', error);
    return false;
  }
}

// Run test
testIntegration()
  .then(success => {
    console.log(`\nTest completed with ${success ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  }); 