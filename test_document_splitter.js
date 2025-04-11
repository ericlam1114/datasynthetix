// Test script for document splitter functionality
const fs = require('fs');
const path = require('path');
const https = require('https');
const { PDFDocument } = require('pdf-lib');

// File information for test
const FILE_INFO = {
  httpUrl: 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf'
};

// Paths for files
const pdfPath = path.join(__dirname, 'temp_test_file.pdf');
const outputDir = path.join(__dirname, 'split_output');

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.promises.access(outputDir);
  } catch (error) {
    await fs.promises.mkdir(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
}

// Function to download a file from a URL
async function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url}...`);
    
    const file = fs.createWriteStream(destinationPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        console.log(`Following redirect to: ${response.headers.location}`);
        return downloadFile(response.headers.location, destinationPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Download completed to ${destinationPath}`);
        resolve();
      });
      
    }).on('error', (err) => {
      fs.unlink(destinationPath, () => {});
      reject(err);
    });
  });
}

// Function to split PDF into chunks
async function splitPdfIntoChunks(pdfPath, numChunks) {
  console.log(`Splitting PDF into ${numChunks} chunks...`);
  
  // Read the PDF file
  const pdfBytes = await fs.promises.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // Get total pages
  const totalPages = pdfDoc.getPageCount();
  console.log(`PDF has ${totalPages} pages`);
  
  // Calculate pages per chunk
  const pagesPerChunk = Math.ceil(totalPages / numChunks);
  console.log(`Each chunk will have ~${pagesPerChunk} pages`);
  
  // Create chunks
  const chunks = [];
  
  for (let i = 0; i < numChunks; i++) {
    const startPage = i * pagesPerChunk;
    const endPage = Math.min((i + 1) * pagesPerChunk - 1, totalPages - 1);
    
    // Skip if the chunk would be too small
    if (i === numChunks - 1 && endPage - startPage < pagesPerChunk / 3) {
      continue;
    }
    
    try {
      // Create a new PDF document
      const subDocument = await PDFDocument.create();
      
      // Copy pages from original to new document
      const pageIndexes = Array.from(
        { length: endPage - startPage + 1 },
        (_, j) => startPage + j
      );
      
      const copiedPages = await subDocument.copyPages(pdfDoc, pageIndexes);
      
      // Add pages to new document
      copiedPages.forEach(page => {
        subDocument.addPage(page);
      });
      
      // Save the new document
      const splitPdfBytes = await subDocument.save();
      const splitFileName = `chunk_${i + 1}_of_${numChunks}.pdf`;
      const splitFilePath = path.join(outputDir, splitFileName);
      
      await fs.promises.writeFile(splitFilePath, splitPdfBytes);
      
      console.log(`Created ${splitFileName} with pages ${startPage + 1}-${endPage + 1} (${endPage - startPage + 1} pages)`);
      
      chunks.push({
        fileName: splitFileName,
        filePath: splitFilePath,
        startPage: startPage + 1,
        endPage: endPage + 1,
        pageCount: endPage - startPage + 1
      });
    } catch (error) {
      console.error(`Error creating chunk ${i + 1}:`, error);
    }
  }
  
  return chunks;
}

// Main function
async function main() {
  try {
    console.log('Starting document splitter test...');
    
    // Ensure output directory exists
    await ensureOutputDir();
    
    // Download the test file if it doesn't exist
    if (!fs.existsSync(pdfPath)) {
      await downloadFile(FILE_INFO.httpUrl, pdfPath);
    } else {
      console.log(`Test file already exists at ${pdfPath}`);
    }
    
    // Split the PDF into 4 chunks
    const chunks = await splitPdfIntoChunks(pdfPath, 4);
    
    console.log('\nSplit Results:');
    console.log('--------------');
    chunks.forEach(chunk => {
      console.log(`${chunk.fileName}: Pages ${chunk.startPage}-${chunk.endPage} (${chunk.pageCount} pages)`);
    });
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error in document splitter test:', error);
  }
}

// Run the main function
main().catch(console.error); 