// Test script for document processor and document splitter
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Mock document to process
const mockDocument = {
  name: 'test-document.pdf',
  size: 2000000, // 2MB
  type: 'application/pdf',
  lastModified: Date.now()
};

// Mock function to split PDF
async function splitPDF(fileBuffer, numParts) {
  try {
    console.log(`Splitting PDF into ${numParts} parts...`);
    
    // Load the PDF
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();
    console.log(`Total pages: ${pageCount}`);
    
    // Calculate pages per part (rounded up)
    const pagesPerPart = Math.ceil(pageCount / numParts);
    console.log(`Pages per part: ${pagesPerPart}`);
    
    // Create the split documents
    const splitDocuments = [];
    
    for (let i = 0; i < numParts; i++) {
      const startPage = i * pagesPerPart;
      const endPage = Math.min(startPage + pagesPerPart, pageCount) - 1;
      
      console.log(`Creating part ${i+1}/${numParts}, pages ${startPage}-${endPage}`);
      
      // Create a new document
      const newPdf = await PDFDocument.create();
      
      // Copy pages from original document
      const copiedPages = await newPdf.copyPages(
        pdfDoc, 
        Array.from({ length: endPage - startPage + 1 }, (_, j) => startPage + j)
      );
      
      // Add pages to new document
      copiedPages.forEach(page => newPdf.addPage(page));
      
      // Save the document
      const pdfBytes = await newPdf.save();
      
      // Generate new filename
      const fileName = `part_${i+1}_of_${numParts}.pdf`;
      const filePath = path.join(__dirname, 'temp', fileName);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(__dirname, 'temp'))) {
        fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
      }
      
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
    
    return {
      success: true,
      parts: splitDocuments
    };
    
  } catch (error) {
    console.error('Error splitting PDF:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test with a sample PDF
async function runTest() {
  try {
    console.log('Starting document processor test...');
    
    // Check if sample PDF exists or download one
    const samplePdfPath = path.join(__dirname, 'temp', 'sample.pdf');
    
    // Create a simple PDF if it doesn't exist
    if (!fs.existsSync(samplePdfPath)) {
      console.log('Creating sample PDF...');
      
      // Create a new PDF with 10 pages
      const pdfDoc = await PDFDocument.create();
      
      for (let i = 0; i < 10; i++) {
        const page = pdfDoc.addPage([550, 750]);
        page.drawText(`Test Page ${i+1}`, {
          x: 50,
          y: 700,
          size: 30
        });
      }
      
      const pdfBytes = await pdfDoc.save();
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(__dirname, 'temp'))) {
        fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
      }
      
      // Write to file
      fs.writeFileSync(samplePdfPath, Buffer.from(pdfBytes));
      console.log('Sample PDF created at:', samplePdfPath);
    } else {
      console.log('Using existing sample PDF at:', samplePdfPath);
    }
    
    // Read the sample PDF
    const fileBuffer = fs.readFileSync(samplePdfPath);
    console.log(`Sample PDF size: ${fileBuffer.length} bytes`);
    
    // Split the PDF into 3 parts
    const result = await splitPDF(fileBuffer, 3);
    
    if (result.success) {
      console.log('Split successful!');
      console.log('Generated parts:', result.parts);
    } else {
      console.error('Split failed:', result.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest().then(() => {
  console.log('Test completed');
}).catch(error => {
  console.error('Unexpected error:', error);
}); 