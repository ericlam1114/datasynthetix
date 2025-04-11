const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fetch = require('node-fetch');

// Paths for files
const outputDir = path.join(__dirname, 'split_output');
const tempFileUrl = 'https://www.africau.edu/images/default/sample.pdf'; // Small sample PDF

async function downloadPdf(url, outputPath) {
  console.log(`Downloading PDF from ${url}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(buffer));
    console.log(`PDF downloaded and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
}

async function splitPdf(pdfPath, numParts) {
  try {
    console.log(`Loading PDF document from ${pdfPath}...`);
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const pageCount = pdfDoc.getPageCount();
    console.log(`PDF has ${pageCount} pages, splitting into ${numParts} parts`);
    
    // Calculate pages per part (at least 1 page per part)
    const pagesPerPart = Math.max(1, Math.ceil(pageCount / numParts));
    
    // Process each part
    const parts = [];
    for (let i = 0; i < numParts; i++) {
      const startPage = i * pagesPerPart;
      let endPage = Math.min((i + 1) * pagesPerPart - 1, pageCount - 1);
      
      // Skip if we've run out of pages
      if (startPage >= pageCount) break;
      
      console.log(`Creating part ${i+1}: pages ${startPage} to ${endPage}`);
      
      // Create a new PDF document
      const newPdf = await PDFDocument.create();
      
      // Copy pages from the original
      const pageIndexes = [];
      for (let j = startPage; j <= endPage; j++) {
        pageIndexes.push(j);
      }
      
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndexes);
      
      // Add the copied pages to the new document
      copiedPages.forEach(page => {
        newPdf.addPage(page);
      });
      
      // Save the new PDF
      const newPdfBytes = await newPdf.save();
      const fileName = `part_${i+1}_of_${numParts}.pdf`;
      const filePath = path.join(outputDir, fileName);
      
      // Write to output directory
      await fs.writeFile(filePath, Buffer.from(newPdfBytes));
      console.log(`Saved part ${i+1} to ${filePath}`);
      
      parts.push({
        fileName,
        filePath,
        pages: endPage - startPage + 1,
        size: newPdfBytes.length
      });
    }
    
    return parts;
  } catch (error) {
    console.error('Error splitting PDF:', error);
    throw error;
  }
}

async function main() {
  try {
    // Create output directory if it doesn't exist
    try {
      await fs.access(outputDir);
    } catch (error) {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }
    
    // Download sample PDF
    const tempFile = path.join(__dirname, 'temp_sample.pdf');
    await downloadPdf(tempFileUrl, tempFile);
    
    // Split the PDF
    const numParts = 2;
    const parts = await splitPdf(tempFile, numParts);
    
    console.log(`\nSuccessfully split PDF into ${parts.length} parts:`);
    parts.forEach((part, i) => {
      console.log(`Part ${i+1}: ${part.fileName}, ${part.pages} pages, ${part.size} bytes`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
main(); 