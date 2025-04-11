// process-buffy-pdf.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check for required dependencies and install if needed
function checkAndInstallDependencies() {
  console.log('Checking for required dependencies...');
  
  const requiredPackages = [
    '@aws-sdk/client-textract',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sqs'
  ];
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const installedDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  const packagesToInstall = requiredPackages.filter(pkg => !installedDependencies[pkg]);
  
  if (packagesToInstall.length > 0) {
    console.log(`Installing missing dependencies: ${packagesToInstall.join(', ')}...`);
    try {
      execSync(`npm install ${packagesToInstall.join(' ')}`, { stdio: 'inherit' });
      console.log('Dependencies installed successfully');
    } catch (error) {
      console.error('Failed to install dependencies:', error.message);
      console.log('Continuing with available packages...');
    }
  } else {
    console.log('All required dependencies are already installed');
  }
}

// Run dependency check
checkAndInstallDependencies();

// Load AWS dependencies
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Import SyntheticDataPipeline directly as it's exported directly
const SyntheticDataPipeline = require('./lib/SyntheticDataPipeline');

// Path to the Buffy PDF file
const PDF_PATH = path.join(__dirname, 'Buffy%20Podcasts%20-%20Acquisitions.pdf');
const OUTPUT_PATH = path.join(__dirname, 'buffy-output.jsonl');

// Initialize Textract client
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Extract text from PDF using AWS Textract
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPdf(pdfPath) {
  try {
    console.log(`Reading PDF from ${pdfPath}...`);
    const pdfBytes = fs.readFileSync(pdfPath);
    
    console.log("Extracting text using AWS Textract...");
    
    // Try direct synchronous extraction first (works for smaller documents)
    try {
      // Create command input with the document bytes
      const params = {
        Document: {
          Bytes: pdfBytes
        }
      };
      
      // Execute Textract text detection command
      const command = new DetectDocumentTextCommand(params);
      const response = await textractClient.send(command);
      
      // Process the response to extract text blocks
      const textBlocks = response.Blocks.filter(block => block.BlockType === 'LINE')
                                         .map(block => block.Text || '');
      const extractedText = textBlocks.join('\n');
      
      console.log(`Textract extracted ${textBlocks.length} text lines (${extractedText.length} characters)`);
      return extractedText;
    } catch (error) {
      console.error("Error in synchronous Textract extraction:", error);
      
      // For larger documents, we would need to use async Textract with S3
      // but for simplicity in this script, we'll fallback to a simpler approach
      console.warn("Falling back to basic text extraction...");
      
      // Simple text extraction (not ideal, but serves as a fallback)
      const text = Buffer.from(pdfBytes).toString('utf8', 0, 10000)
        .replace(/[^\x20-\x7E\n]/g, ' ') // Keep only ASCII printable chars
        .replace(/\s+/g, ' '); // Normalize whitespace
      
      console.log(`Extracted ${text.length} characters of text (fallback method)`);
      return text;
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

// Main function to process the document
async function processDocument() {
  console.log('Starting document processing...');
  
  try {
    // Step 1: Extract text from the PDF using Textract
    console.log('Extracting text from PDF using AWS Textract...');
    const extractedText = await extractTextFromPdf(PDF_PATH);
    console.log(`Extracted ${extractedText.length} characters of text`);
    
    // Step 2: Initialize the pipeline
    console.log('Initializing SyntheticDataPipeline...');
    const pipeline = new SyntheticDataPipeline({
      apiKey: process.env.OPENAI_API_KEY,
      extractorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
      classifierModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:BKXRNBJy",
      duplicatorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
      chunkSize: 1000,
      chunkOverlap: 100,
      outputFormat: 'jsonl',
      classFilter: 'all',
      prioritizeImportant: false,
      onProgress: (stage, stats) => {
        console.log(`Pipeline progress (${stage}):`, stats);
      }
    });
    
    // Step 3: Process the document with the pipeline
    console.log('Processing document with pipeline...');
    const result = await pipeline.process(extractedText);
    
    // Step 4: Save the JSONL output
    console.log(`Pipeline processing complete: Generated ${result.stats?.generatedVariants || 0} variants`);
    fs.writeFileSync(OUTPUT_PATH, result.output);
    console.log(`Results saved to ${OUTPUT_PATH}`);
    
    // Step 5: Display sample output
    const outputSample = result.output.split('\n').slice(0, 3).join('\n');
    console.log('\nSample output:');
    console.log('------------------------');
    console.log(outputSample);
    console.log('------------------------');
    
    return {
      success: true,
      stats: result.stats,
      outputPath: OUTPUT_PATH
    };
  } catch (error) {
    console.error('Error processing document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the document processing
processDocument()
  .then(result => {
    if (result.success) {
      console.log('\nDocument processing completed successfully!');
      console.log(`Output saved to: ${result.outputPath}`);
      console.log('Stats:', result.stats);
    } else {
      console.error('\nDocument processing failed:', result.error);
    }
  })
  .catch(error => {
    console.error('Unhandled error in document processing:', error);
  }); 