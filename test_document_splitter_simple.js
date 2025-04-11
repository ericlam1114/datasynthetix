// Simple test script for PDF download and splitting
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const https = require('https');
const { PDFDocument } = require('pdf-lib');

// Configuration
const PDF_URL = 'https://www.africau.edu/images/default/sample.pdf'; // Using a small, reliable sample PDF
const PDF_PATH = path.join(__dirname, 'sample.pdf');
const OUTPUT_DIR = path.join(__dirname, 'test-output');
const NUM_PARTS = 2; // Number of parts to split into

async function ensureOutputDir() {
  try {
    await fsPromises.access(OUTPUT_DIR);
    console.log(`Output directory exists: ${OUTPUT_DIR}`);
  } catch (error) {
    await fsPromises.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }
}

async function downloadPDF() {
  try {
    // Check if file exists
    try {
      const stats = await fsPromises.stat(PDF_PATH);
      if (stats.size === 0) {
        console.log(`Deleted empty PDF file at ${PDF_PATH}`);
        await fsPromises.unlink(PDF_PATH);
      } else {
        console.log(`PDF already exists at ${PDF_PATH}`);
        return;
      }
    } catch (error) {
      // File doesn't exist, will download
    }

    console.log(`Downloading PDF from ${PDF_URL}...`);
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(PDF_PATH);
      
      https.get(PDF_URL, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download PDF: HTTP status ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`PDF downloaded to ${PDF_PATH}`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(PDF_PATH, () => {}); // Delete the file if download failed
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Download failed: ${error.message}`);
    throw error;
  }
}

async function splitPDF(numParts) {
  try {
    console.log(`Splitting PDF into ${numParts} parts...`);
    
    // Read the PDF file
    const pdfBytes = await fsPromises.readFile(PDF_PATH);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const pageCount = pdfDoc.getPageCount();
    console.log(`PDF has ${pageCount} pages`);
    
    if (pageCount < numParts) {
      console.log(`Warning: PDF has fewer pages (${pageCount}) than requested parts (${numParts})`);
      numParts = pageCount;
    }
    
    const pagesPerPart = Math.ceil(pageCount / numParts);
    const results = [];
    
    for (let i = 0; i < numParts; i++) {
      const newPdf = await PDFDocument.create();
      
      const startPage = i * pagesPerPart;
      const endPage = Math.min((i + 1) * pagesPerPart, pageCount);
      
      console.log(`Creating part ${i + 1} with pages ${startPage + 1} to ${endPage}`);
      
      // Copy pages from original to new PDF
      const copiedPages = await newPdf.copyPages(pdfDoc, Array.from(
        { length: endPage - startPage }, 
        (_, j) => startPage + j
      ));
      
      copiedPages.forEach(page => {
        newPdf.addPage(page);
      });
      
      // Save the new PDF
      const newPdfBytes = await newPdf.save();
      const outputPath = path.join(OUTPUT_DIR, `part${i + 1}.pdf`);
      await fsPromises.writeFile(outputPath, newPdfBytes);
      
      console.log(`Saved part ${i + 1} to ${outputPath}`);
      results.push(outputPath);
    }
    
    return results;
  } catch (error) {
    console.error(`PDF splitting failed: ${error.message}`);
    throw error;
  }
}

async function runTest() {
  try {
    await ensureOutputDir();
    await downloadPDF();
    const parts = await splitPDF(NUM_PARTS);
    console.log('Test completed successfully!');
    console.log('Split PDF parts:', parts);
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
runTest().catch(console.error); 