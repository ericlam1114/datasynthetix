// test_splitter_internal.js
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Configuration
const TEST_PDF_PATH = path.join(__dirname, 'test_docs', 'sample.pdf');
const OUTPUT_DIR = path.join(__dirname, 'test_output');
const CHUNK_COUNT = 3;

// Make sure directories exist
async function ensureDirectories() {
  // Create test_docs directory if it doesn't exist
  const testDocsDir = path.join(__dirname, 'test_docs');
  if (!fs.existsSync(testDocsDir)) {
    fs.mkdirSync(testDocsDir, { recursive: true });
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// Create a sample PDF for testing if it doesn't exist
async function createSamplePdf() {
  if (fs.existsSync(TEST_PDF_PATH)) {
    console.log('Sample PDF already exists, using existing file.');
    return;
  }

  console.log('Creating sample PDF for testing...');
  const pdfDoc = await PDFDocument.create();
  
  // Create 30 pages with page numbers
  for (let i = 0; i < 30; i++) {
    const page = pdfDoc.addPage([500, 700]);
    const { width, height } = page.getSize();
    
    // Add page number
    page.drawText(`Page ${i + 1}`, {
      x: 50,
      y: height - 50,
      size: 30,
    });
    
    // Add some content
    page.drawText(`This is test content for page ${i + 1}`, {
      x: 50,
      y: height / 2,
      size: 20,
    });
  }
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(TEST_PDF_PATH, pdfBytes);
  console.log(`Created sample PDF with 30 pages at ${TEST_PDF_PATH}`);
}

// Split the PDF into chunks
async function splitPdf() {
  console.log(`Splitting PDF into ${CHUNK_COUNT} chunks...`);
  
  // Read the sample PDF
  const pdfBytes = fs.readFileSync(TEST_PDF_PATH);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();
  
  console.log(`PDF has ${totalPages} pages`);
  
  // Calculate pages per chunk
  const pagesPerChunk = Math.ceil(totalPages / CHUNK_COUNT);
  console.log(`Pages per chunk: ${pagesPerChunk}`);
  
  // Create and save the split documents
  const splitDocumentPaths = [];
  
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const startPage = i * pagesPerChunk;
    const endPage = Math.min((i + 1) * pagesPerChunk, totalPages);
    
    if (startPage >= totalPages) {
      break; // Don't create empty chunks
    }
    
    console.log(`Creating chunk ${i+1}: pages ${startPage+1}-${endPage} (${endPage-startPage} pages)`);
    
    // Create a new PDF document
    const subDocument = await PDFDocument.create();
    
    // Copy pages from the original document
    const pageIndexes = Array.from(
      { length: endPage - startPage }, 
      (_, j) => startPage + j
    );
    
    const copiedPages = await subDocument.copyPages(pdfDoc, pageIndexes);
    
    // Add pages to the new document
    copiedPages.forEach(page => {
      subDocument.addPage(page);
    });
    
    // Save the new document
    const outputPath = path.join(OUTPUT_DIR, `sample_part${i+1}_of_${CHUNK_COUNT}.pdf`);
    const subDocBytes = await subDocument.save();
    fs.writeFileSync(outputPath, subDocBytes);
    
    splitDocumentPaths.push(outputPath);
    console.log(`Created: ${outputPath} (${subDocBytes.length} bytes)`);
  }
  
  return splitDocumentPaths;
}

// Verify the split PDFs
async function verifySplitPdfs(splitPaths) {
  console.log('\nVerifying split PDFs:');
  
  let totalSplitPages = 0;
  
  for (const pdfPath of splitPaths) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    totalSplitPages += pageCount;
    
    console.log(`${path.basename(pdfPath)}: ${pageCount} pages`);
  }
  
  // Read original PDF to compare
  const originalPdfBytes = fs.readFileSync(TEST_PDF_PATH);
  const originalPdfDoc = await PDFDocument.load(originalPdfBytes);
  const originalPageCount = originalPdfDoc.getPageCount();
  
  console.log('\nVerification results:');
  console.log(`Original PDF page count: ${originalPageCount}`);
  console.log(`Total pages in split PDFs: ${totalSplitPages}`);
  console.log(`All pages accounted for: ${originalPageCount === totalSplitPages ? 'YES ✅' : 'NO ❌'}`);
  
  return originalPageCount === totalSplitPages;
}

// Main test function
async function runTest() {
  console.log('Starting document splitter internal test');
  
  try {
    // Setup
    await ensureDirectories();
    await createSamplePdf();
    
    // Split the document
    const splitPaths = await splitPdf();
    
    // Verify the results
    const verified = await verifySplitPdfs(splitPaths);
    
    console.log(`\nTest ${verified ? 'PASSED ✅' : 'FAILED ❌'}`);
    
    return verified;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test
runTest()
  .then(result => {
    console.log(`\nTest completed with ${result ? 'success' : 'failure'}`);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Test script error:', err);
    process.exit(1);
  }); 