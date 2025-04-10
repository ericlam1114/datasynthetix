const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist');

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

// The very simplest PDF extraction - just extract text, nothing fancy
async function simpleExtractText(filePath) {
  try {
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`Read file: ${filePath}, size: ${fileBuffer.length} bytes`);
    
    // Convert Buffer to Uint8Array for pdf.js
    const uint8Array = new Uint8Array(fileBuffer);

    // Load document (without options to ensure most basic processing)
    const loadingTask = pdfjs.getDocument(uint8Array);
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded with ${pdf.numPages} pages`);

    let extractedText = "";

    // Process each page with minimal options
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      console.log(`Found ${textContent.items.length} text items on page ${i}`);
      
      // Just concatenate all text with spaces
      if (textContent.items.length > 0) {
        const pageText = textContent.items.map(item => item.str).join(" ");
        console.log(`First item on page: "${textContent.items[0].str}"`);
        extractedText += pageText + "\n\n";
      }
    }

    // Output results
    console.log("\n--- EXTRACTION RESULTS ---");
    console.log(`Extracted ${extractedText.length} characters`);
    
    if (extractedText.length > 0) {
      console.log("--- TEXT SAMPLE ---");
      console.log(extractedText.substring(0, 500) + "...");
    } else {
      console.log("No text extracted!");
    }
    
    // Write to file for inspection
    fs.writeFileSync('extracted-text.txt', extractedText);
    console.log("Full text written to extracted-text.txt");
    
  } catch (error) {
    console.error("Error extracting text:", error);
  }
}

// Get file from command line or default
const filePath = process.argv[2] || './Commercial Tax Appeal Inquiry Questionnaire.pdf';
simpleExtractText(filePath); 