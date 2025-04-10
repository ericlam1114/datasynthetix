// test-pipeline.js
const fs = require('fs');
const path = require('path');
const SyntheticDataPipeline = require('./lib/SyntheticDataPipeline');
const pdfjsLib = require('pdfjs-dist/build/pdf.js');

// Configure worker for pdf.js
try {
  const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.entry');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  console.log('PDF.js worker configured successfully');
} catch (error) {
  console.error("Error configuring PDF.js worker:", error);
}

// Load environment variables
require('dotenv').config();

// Function to extract text from PDF (simplified version)
async function extractTextFromPdf(buffer) {
  try {
    console.log("Starting PDF text extraction");
    console.log(`File size: ${buffer.length} bytes`);
    
    // Convert Buffer to Uint8Array for pdf.js
    const uint8Array = new Uint8Array(buffer);
    console.log("Buffer converted to Uint8Array");

    // Load document with retry
    let pdf = null;
    try {
      console.log("Attempting to load PDF document...");
      const loadingTask = pdfjsLib.getDocument({ 
        data: uint8Array,
        disableFontFace: true,
        ignoreErrors: true
      });
      
      pdf = await loadingTask.promise;
      console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    } catch (loadError) {
      console.error("Failed to load PDF:", loadError);
      return ""; // Return empty string on failure
    }

    if (!pdf) {
      console.error("PDF loading failed without error");
      return "";
    }

    let extractedText = "";

    // Process each page with timeout
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      try {
        const page = await pdf.getPage(i);
        console.log(`Page ${i} retrieved successfully`);
        
        const textContent = await page.getTextContent();
        console.log(`Found ${textContent.items.length} text items on page ${i}`);
        
        // Extract text items and join with proper spacing
        const pageText = textContent.items.map((item) => item.str).join(" ");
        
        extractedText += pageText + "\n\n";
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
      }
    }
    
    console.log(`Total text extracted: ${extractedText.length} characters`);
    
    // If no text was extracted, return empty string
    if (extractedText.trim().length === 0) {
      console.error("No text was extracted from the PDF");
      return "";
    }
    
    return extractedText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    return "";
  }
}

// Simple function to check the pipeline without PDF extraction
async function testPipelineWithSampleText() {
  console.log('Testing pipeline with sample text...');
  
  try {
    // Sample text for testing
    const text = "This is a sample text for testing the synthetic data pipeline. " +
                "It contains clauses that might be extracted and processed. " +
                "The contractor shall submit all required documentation within 30 days. " +
                "Payment terms are net 45 days from invoice date. " +
                "This agreement shall be governed by the laws of the State of California.";
    
    console.log(`Sample text length: ${text.length} characters`);
    
    // Initialize the pipeline
    console.log('Initializing synthetic data pipeline...');
    const pipeline = new SyntheticDataPipeline({
      apiKey: process.env.OPENAI_API_KEY,
      chunkSize: 500,  // Smaller chunk size for sample
      overlap: 50,
      outputFormat: 'jsonl',
      classFilter: 'all',
      onProgress: (stage, stats) => {
        console.log(`Progress - Stage: ${stage}, Stats:`, stats);
      }
    });
    
    // Process the text
    console.log('Processing sample text through pipeline...');
    const result = await pipeline.process(text);
    
    // Display results
    console.log('\nPipeline processing complete!');
    console.log('--------------------------------------------------');
    console.log('Stats:', result.stats);
    console.log('--------------------------------------------------');
    console.log('Output:');
    console.log(result.output);
    console.log('--------------------------------------------------');
    
    return true;
  } catch (error) {
    console.error('Error during pipeline test with sample text:', error);
    return false;
  }
}

async function testPipeline() {
  console.log('Starting pipeline test on PDF file...');
  
  try {
    // First test with sample text to verify pipeline works
    const sampleTestSuccess = await testPipelineWithSampleText();
    if (!sampleTestSuccess) {
      console.log("Skipping PDF test since sample text test failed");
      return;
    }
    
    // 1. Read the PDF file
    const filePath = path.join(process.cwd(), 'Commercial Tax Appeal Inquiry Questionnaire.pdf');
    console.log(`Reading file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`File loaded: ${fileBuffer.length} bytes`);
    
    // 2. Extract text from PDF
    console.log('Extracting text from PDF...');
    const text = await extractTextFromPdf(fileBuffer);
    console.log(`Extracted ${text.length} characters of text`);
    
    if (text.length < 25) {
      console.error('Text extraction failed or produced insufficient content');
      return;
    }
    
    // Show sample of extracted text
    console.log('\nText sample:');
    console.log('--------------------------------------------------');
    console.log(text.substring(0, 500) + '...');
    console.log('--------------------------------------------------\n');
    
    // Save extracted text to file for debugging
    const textPath = path.join(process.cwd(), 'extracted-text.txt');
    fs.writeFileSync(textPath, text);
    console.log(`Extracted text saved to: ${textPath}`);
    
    // 3. Initialize the pipeline
    console.log('Initializing synthetic data pipeline...');
    const pipeline = new SyntheticDataPipeline({
      apiKey: process.env.OPENAI_API_KEY,
      chunkSize: 1000,
      overlap: 100,
      outputFormat: 'jsonl',
      classFilter: 'all',
      onProgress: (stage, stats) => {
        console.log(`Progress - Stage: ${stage}, Stats:`, stats);
      }
    });
    
    // 4. Process the text
    console.log('Processing text through pipeline...');
    const result = await pipeline.process(text);
    
    // 5. Display results
    console.log('\nPipeline processing complete!');
    console.log('--------------------------------------------------');
    console.log('Stats:', result.stats);
    console.log('--------------------------------------------------');
    console.log('Output sample:');
    if (result.output && result.output.length > 0) {
      console.log(result.output.substring(0, Math.min(1000, result.output.length)) + '...');
    } else {
      console.log('No output generated');
    }
    console.log('--------------------------------------------------');
    
    // 6. Save output to file
    const outputPath = path.join(process.cwd(), 'pipeline-output.jsonl');
    fs.writeFileSync(outputPath, result.output || '');
    console.log(`Full output saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error during pipeline test:', error);
  }
}

// Run the test
testPipeline(); 