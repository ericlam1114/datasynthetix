// Simple script to download and process a PDF directly
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

// PDF URL
const pdfUrl = 'https://firebasestorage.googleapis.com/v0/b/datasynthetix.firebasestorage.app/o/documents%2FYlCzr5g4Xjc45c7z8fLtnO9LR1F3%2F1744387775036_2021%20NFPA%2070E%20%20Standard%20for%20Electrical%20Safety%20in%20the%20Workplace%202021%20Edition%20(national%20fire%20protection%20association)%20(Z-Library).pdf?alt=media&token=03d00981-f986-4847-bb95-9ec4a85b26e5';

// Paths for files
const pdfPath = path.join(__dirname, 'test_doc.pdf');
const textPath = path.join(__dirname, 'extracted_text.txt');

// Function to download a file from a URL
function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url} to ${destinationPath}...`);
    
    // Create file stream
    const file = fs.createWriteStream(destinationPath);
    
    // Download the file
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      // Pipe the response to the file
      response.pipe(file);
      
      // Handle events
      file.on('finish', () => {
        file.close();
        console.log('Download completed');
        resolve();
      });
      
    }).on('error', (err) => {
      // Clean up
      fs.unlink(destinationPath, () => {});
      reject(err);
    });
  });
}

// Function to extract text from a PDF using pdftotext or other available utility
function extractTextFromPdf(pdfPath, textPath) {
  return new Promise((resolve, reject) => {
    console.log(`Extracting text from ${pdfPath} to ${textPath}...`);
    
    // Try pdftotext (requires poppler-utils)
    exec(`pdftotext "${pdfPath}" "${textPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.warn('pdftotext failed, trying alternative method:', error);
        
        // Try node-based extraction (requires pdf-parse, install with: npm install pdf-parse)
        try {
          const pdf = require('pdf-parse');
          const dataBuffer = fs.readFileSync(pdfPath);
          
          pdf(dataBuffer).then(data => {
            fs.writeFileSync(textPath, data.text);
            console.log(`Extracted ${data.text.length} characters of text`);
            resolve(data.text);
          }).catch(err => {
            reject(new Error(`Failed to extract text using pdf-parse: ${err.message}`));
          });
        } catch (moduleError) {
          reject(new Error(`No PDF extraction method available: ${moduleError.message}`));
        }
        return;
      }
      
      console.log('Text extraction completed using pdftotext');
      const extractedText = fs.readFileSync(textPath, 'utf8');
      console.log(`Extracted ${extractedText.length} characters of text`);
      resolve(extractedText);
    });
  });
}

// Main function
async function main() {
  try {
    // Step 1: Download the PDF
    await downloadFile(pdfUrl, pdfPath);
    
    // Step 2: Extract text from the PDF
    const text = await extractTextFromPdf(pdfPath, textPath);
    
    // Step 3: Print a sample of the extracted text
    console.log('\nExtracted text sample:');
    console.log('------------------------');
    console.log(text.substring(0, 500) + '...');
    console.log('------------------------');
    
    console.log(`\nFull text saved to ${textPath}`);
    
    // The text could now be processed using the SyntheticDataPipeline
    console.log('\nTo further process this text with the SyntheticDataPipeline,');
    console.log('you would need to call the pipeline with this text content.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
main().catch(console.error); 