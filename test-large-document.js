// Test script for large document processing
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Path to our large sample PDF
const LARGE_PDF_PATH = path.join(__dirname, 'temp', 'large_sample.pdf');
const OUTPUT_DIR = path.join(__dirname, 'temp', 'split-large');

// Mock function to split PDF
async function splitPDF(pdfPath, numParts) {
  try {
    console.log(`Splitting PDF at ${pdfPath} into ${numParts} parts...`);
    
    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    console.log(`Total pages: ${pageCount}`);
    
    // Calculate pages per part (rounded up)
    const pagesPerPart = Math.ceil(pageCount / numParts);
    console.log(`Pages per part: ${pagesPerPart}`);
    
    // Create the split documents
    const splitDocuments = [];
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Track performance
    const startTime = Date.now();
    
    for (let i = 0; i < numParts; i++) {
      const startPage = i * pagesPerPart;
      const endPage = Math.min(startPage + pagesPerPart, pageCount) - 1;
      
      if (startPage >= pageCount) {
        break; // Don't create empty parts
      }
      
      console.log(`Creating part ${i+1}/${numParts}, pages ${startPage}-${endPage}`);
      
      // Create a new document
      const newPdf = await PDFDocument.create();
      
      // Calculate page indexes to copy
      const pageIndexes = Array.from(
        { length: endPage - startPage + 1 },
        (_, j) => startPage + j
      );
      
      // Copy pages from original document
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndexes);
      
      // Add pages to new document
      copiedPages.forEach(page => newPdf.addPage(page));
      
      // Save the document
      const pdfBytes = await newPdf.save();
      
      // Generate new filename
      const fileName = `large_part_${i+1}_of_${numParts}.pdf`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      
      // Write file to disk
      fs.writeFileSync(filePath, Buffer.from(pdfBytes));
      console.log(`Saved ${fileName}`);
      
      // Add to result
      splitDocuments.push({
        name: fileName,
        path: filePath,
        size: pdfBytes.length,
        pages: endPage - startPage + 1
      });
    }
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    console.log(`PDF splitting completed in ${processingTime.toFixed(2)} seconds`);
    
    return {
      success: true,
      parts: splitDocuments,
      processingTime
    };
    
  } catch (error) {
    console.error('Error splitting PDF:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test with the large PDF
async function runTest() {
  try {
    console.log('Starting large document processor test...');
    
    // Check if large sample PDF exists
    if (!fs.existsSync(LARGE_PDF_PATH)) {
      console.error(`Large sample PDF not found at: ${LARGE_PDF_PATH}`);
      return;
    }
    
    // Get file info
    const stats = fs.statSync(LARGE_PDF_PATH);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Sample PDF size: ${fileSizeMB} MB`);
    
    // Analyze the PDF
    const pdfBytes = fs.readFileSync(LARGE_PDF_PATH);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    console.log(`PDF has ${pageCount} pages`);
    
    // Calculate recommended split parts based on page count
    // Typical recommendation: split into parts of 50 pages each
    const recommendedParts = Math.ceil(pageCount / 50);
    console.log(`Recommended number of parts: ${recommendedParts}`);
    
    // Split the PDF into recommended parts
    console.log(`\nSplitting PDF into ${recommendedParts} parts...`);
    const result = await splitPDF(LARGE_PDF_PATH, recommendedParts);
    
    if (result.success) {
      console.log('Split successful!');
      console.log(`Processing time: ${result.processingTime.toFixed(2)} seconds`);
      
      // Calculate total pages in all parts
      const totalPages = result.parts.reduce((total, part) => total + part.pages, 0);
      
      console.log('\nSummary:');
      console.log(`- Original PDF: ${pageCount} pages, ${fileSizeMB} MB`);
      console.log(`- Split into: ${result.parts.length} parts`);
      console.log(`- Total pages across all parts: ${totalPages}`);
      console.log(`- Average pages per part: ${(totalPages / result.parts.length).toFixed(1)}`);
      
      // List all parts with their details
      console.log('\nGenerated parts:');
      result.parts.forEach((part, index) => {
        const partSizeMB = (part.size / (1024 * 1024)).toFixed(2);
        console.log(`Part ${index + 1}: ${part.pages} pages, ${partSizeMB} MB - ${part.name}`);
      });
    } else {
      console.error('Split failed:', result.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest().then(() => {
  console.log('\nTest completed successfully');
}).catch(error => {
  console.error('\nUnexpected error:', error);
}); 