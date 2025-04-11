// Simple script to test PDF splitting functionality
const fs = require('fs');
const path = require('path');
const https = require('https');
const { PDFDocument } = require('pdf-lib');
const FormData = require('form-data');
const fetch = require('node-fetch');

// File paths
const pdfUrl = 'https://www.africau.edu/images/default/sample.pdf';
const pdfPath = path.join(__dirname, 'sample.pdf');
const outputDir = path.join(__dirname, 'test-output');

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.promises.access(outputDir);
  } catch (error) {
    await fs.promises.mkdir(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
}

// Download the PDF file
function downloadPdf() {
  return new Promise((resolve, reject) => {
    console.log(`Downloading PDF from ${pdfUrl}`);
    
    const file = fs.createWriteStream(pdfPath);
    
    https.get(pdfUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download PDF: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`PDF downloaded to ${pdfPath}`);
        resolve(pdfPath);
      });
    }).on('error', (err) => {
      fs.unlink(pdfPath, () => {}); // Delete the file if download failed
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(pdfPath, () => {}); // Delete the file if there was an error
      reject(err);
    });
  });
}

// Split the PDF into two parts
async function splitPdf(pdfPath) {
  try {
    console.log(`Reading PDF from ${pdfPath}`);
    
    // Read the PDF file
    const pdfBytes = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const pageCount = pdfDoc.getPageCount();
    console.log(`PDF has ${pageCount} pages`);
    
    if (pageCount <= 1) {
      console.log('PDF has only one page, no need to split');
      return;
    }
    
    // Calculate pages for each part
    const halfPage = Math.ceil(pageCount / 2);
    
    // Create first half
    const pdfDoc1 = await PDFDocument.create();
    const pages1 = await pdfDoc1.copyPages(pdfDoc, Array.from(Array(halfPage).keys()));
    pages1.forEach(page => pdfDoc1.addPage(page));
    
    // Create second half
    const pdfDoc2 = await PDFDocument.create();
    const pages2 = await pdfDoc2.copyPages(pdfDoc, Array.from(Array(pageCount - halfPage).keys(), i => i + halfPage));
    pages2.forEach(page => pdfDoc2.addPage(page));
    
    // Save the split PDFs
    const pdfBytes1 = await pdfDoc1.save();
    await fs.promises.writeFile(path.join(outputDir, 'part1.pdf'), pdfBytes1);
    console.log(`Saved part 1 with ${halfPage} pages`);
    
    const pdfBytes2 = await pdfDoc2.save();
    await fs.promises.writeFile(path.join(outputDir, 'part2.pdf'), pdfBytes2);
    console.log(`Saved part 2 with ${pageCount - halfPage} pages`);
    
    return {
      part1: path.join(outputDir, 'part1.pdf'),
      part2: path.join(outputDir, 'part2.pdf')
    };
  } catch (error) {
    console.error('Error splitting PDF:', error);
    throw error;
  }
}

// Test the API endpoint (similar to what the frontend would do)
async function testApiEndpoint(filePath) {
  try {
    console.log('Testing split-document API endpoint...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('numParts', '2');
    
    const response = await fetch('http://localhost:3000/api/split-document', {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(),
      },
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

async function runTest() {
  try {
    await ensureOutputDir();
    await downloadPdf();
    const parts = await splitPdf(pdfPath);
    
    console.log('Test completed successfully!');
    console.log(`Split parts saved to: ${parts.part1} and ${parts.part2}`);
    
    // Note: Uncomment to test the API endpoint if your server is running
    // await testApiEndpoint(parts.part1);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest(); 