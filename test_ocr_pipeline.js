// Advanced OCR and Pipeline Test Script
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWorker } = require('tesseract.js');
const pdfjsLib = require('pdfjs-dist');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { SyntheticDataPipeline } = require('./lib/SyntheticDataPipeline');

// Set up PDF.js worker
const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// PDF URL
const pdfUrl = 'https://firebasestorage.googleapis.com/v0/b/datasynthetix.firebasestorage.app/o/documents%2FYlCzr5g4Xjc45c7z8fLtnO9LR1F3%2F1744387775036_2021%20NFPA%2070E%20%20Standard%20for%20Electrical%20Safety%20in%20the%20Workplace%202021%20Edition%20(national%20fire%20protection%20association)%20(Z-Library).pdf?alt=media&token=03d00981-f986-4847-bb95-9ec4a85b26e5';

// Paths for files
const pdfPath = path.join(__dirname, 'test_doc.pdf');
const textPath = path.join(__dirname, 'extracted_text.txt');
const outputPath = path.join(__dirname, 'output.jsonl');
const imagePath = path.join(__dirname, 'temp_images');

// Make sure temp directory exists
if (!fs.existsSync(imagePath)) {
  fs.mkdirSync(imagePath, { recursive: true });
}

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Function to download a file from a URL
function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url}...`);
    
    const file = fs.createWriteStream(destinationPath);
    
    https.get(url, (response) => {
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

// Extract text using pdf.js
async function extractTextWithPdfJs(pdfPath) {
  console.log('Extracting text using pdf.js...');
  
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  
  try {
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF loaded successfully. Number of pages: ${pdf.numPages}`);
    
    let fullText = '';
    
    // Maximum pages to process (limit to 50 pages for testing)
    const maxPages = Math.min(pdf.numPages, 50);
    
    // Extract text from each page
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      
      // Extract text from the page
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
      
      console.log(`Extracted text from page ${i}/${maxPages}`);
    }
    
    console.log(`Successfully extracted ${fullText.length} characters using pdf.js`);
    return fullText;
  } catch (error) {
    console.error('Error extracting text with pdf.js:', error);
    return '';
  }
}

// Extract text using pdf-parse (simpler approach)
async function extractTextWithPdfParse(pdfPath) {
  console.log('Extracting text using pdf-parse...');
  
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    
    const data = await pdfParse(dataBuffer);
    console.log(`Successfully extracted ${data.text.length} characters using pdf-parse`);
    console.log(`PDF has ${data.numpages} pages`);
    
    return data.text;
  } catch (error) {
    console.error('Error extracting text with pdf-parse:', error);
    return '';
  }
}

// Extract text using Tesseract OCR with simpler approach
async function extractTextWithSimpleOCR(pdfPath) {
  console.log('Extracting text using simple OCR approach...');
  
  try {
    const { exec } = require('child_process');
    
    // Use poppler-utils to convert PDF to images (pdfimages or pdftoppm)
    // Check if we have pdftoppm (part of poppler-utils)
    const checkPoppler = new Promise((resolve) => {
      exec('pdftoppm -v', (error) => {
        resolve(!error);
      });
    });
    
    const hasPdftoppm = await checkPoppler;
    
    if (hasPdftoppm) {
      console.log('Using pdftoppm to convert PDF to images...');
      
      // Convert PDF to images (limit to first 20 pages)
      const command = `pdftoppm -png -r 300 -f 1 -l 20 "${pdfPath}" "${path.join(imagePath, 'page')}"`;
      
      await new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error('Error converting PDF to images:', error);
            reject(error);
            return;
          }
          resolve();
        });
      });
      
      // Use Tesseract OCR on each image
      const worker = await createWorker('eng');
      let fullText = '';
      
      // Get all png files in the folder
      const imageFiles = fs.readdirSync(imagePath)
        .filter(file => file.endsWith('.png'))
        .sort(); // Ensure correct page order
      
      console.log(`Found ${imageFiles.length} image files for OCR`);
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imagefile = path.join(imagePath, imageFiles[i]);
        console.log(`Processing image ${i + 1}/${imageFiles.length}: ${imagefile}`);
        
        const { data } = await worker.recognize(imagefile);
        fullText += data.text + '\n\n';
        
        console.log(`OCR completed for image ${i + 1}: ${data.text.length} characters`);
      }
      
      await worker.terminate();
      
      console.log(`Successfully extracted ${fullText.length} characters with OCR`);
      return fullText;
    } else {
      console.log('pdftoppm not found, trying fallback method...');
      throw new Error('pdftoppm not available');
    }
  } catch (error) {
    console.error('Error during simple OCR extraction:', error);
    return '';
  }
}

// Alternative OCR approach using Python's PyPDF2 and Tesseract (via child_process)
async function extractTextWithPythonOCR() {
  console.log('Attempting OCR extraction using Python...');
  
  try {
    const { execSync } = require('child_process');
    
    // Check if Python is installed
    try {
      execSync('python3 --version || python --version');
    } catch (error) {
      console.error('Python is not installed or not in PATH');
      return '';
    }
    
    // Create a temporary Python script
    const pythonScript = `
import sys
try:
    import pytesseract
    from pdf2image import convert_from_path
    from PIL import Image
    import io
    
    # Path to the PDF file
    pdf_path = '${pdfPath.replace(/\\/g, '\\\\')}'
    
    # Convert PDF to list of images
    print('Converting PDF to images...')
    images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=20)
    
    print(f'Converting {len(images)} pages to text with Tesseract OCR...')
    
    # Recognize text from each image
    full_text = ''
    for i, image in enumerate(images):
        print(f'Processing page {i+1}/{len(images)}')
        text = pytesseract.image_to_string(image, lang='eng')
        full_text += text + '\\n\\n'
    
    # Write to output file
    with open('${textPath.replace(/\\/g, '\\\\')}', 'w', encoding='utf-8') as f:
        f.write(full_text)
    
    print(f'OCR completed. Extracted {len(full_text)} characters')
    
except ImportError as e:
    print(f'Required Python package missing: {e}')
    print('Install with: pip install pytesseract pdf2image pillow')
    sys.exit(1)
except Exception as e:
    print(f'Error during OCR: {e}')
    sys.exit(2)
    `;
    
    const scriptPath = path.join(__dirname, 'temp_ocr.py');
    fs.writeFileSync(scriptPath, pythonScript);
    
    // Execute the Python script
    const pythonCmd = 'python3 || python';
    const output = execSync(`${pythonCmd} ${scriptPath}`, { encoding: 'utf8' });
    console.log('Python OCR output:', output);
    
    // Read the extracted text
    if (fs.existsSync(textPath)) {
      const extractedText = fs.readFileSync(textPath, 'utf8');
      console.log(`Python OCR extracted ${extractedText.length} characters`);
      return extractedText;
    } else {
      console.error('Python OCR did not produce output file');
      return '';
    }
  } catch (error) {
    console.error('Error during Python OCR execution:', error);
    return '';
  }
}

// Merge texts from multiple extraction methods
function mergeExtractedTexts(texts) {
  // Filter out empty texts
  const validTexts = texts.filter(t => t && t.length > 0);
  
  if (validTexts.length === 0) {
    return '';
  }
  
  // Find the longest text (usually the most complete)
  const longestText = validTexts.reduce((a, b) => a.length > b.length ? a : b);
  
  console.log(`Selected text with ${longestText.length} characters (from ${validTexts.length} valid extractions)`);
  return longestText;
}

// Process document with SyntheticDataPipeline
async function processWithPipeline(text) {
  console.log(`Processing document with SyntheticDataPipeline (${text.length} characters)...`);
  
  try {
    // Initialize the pipeline
    const pipeline = new SyntheticDataPipeline({
      apiKey: OPENAI_API_KEY,
      extractorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
      classifierModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:abcdefgh",
      duplicatorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
      chunkSize: 1000,
      overlap: 100,
      outputFormat: "jsonl",
      classFilter: "all",
      prioritizeImportant: false,
    });
    
    // Set up progress reporting
    pipeline.onProgress = (stage, stats) => {
      console.log(`Pipeline progress: ${stage} - Processed ${stats.processedClauses || 0} clauses, ${stats.generatedVariants || 0} variants`);
    };
    
    // Process the document
    console.log('Starting pipeline processing...');
    const result = await pipeline.process(text);
    
    console.log(`Pipeline processing complete: Generated ${result.stats?.generatedVariants || 0} variants`);
    
    // Save results
    fs.writeFileSync(outputPath, result.output);
    console.log(`Results saved to ${outputPath}`);
    
    return result;
  } catch (error) {
    console.error('Error processing with pipeline:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('Starting document processing test...');
    
    // Step 1: Download the PDF if it doesn't exist
    if (!fs.existsSync(pdfPath)) {
      await downloadFile(pdfUrl, pdfPath);
    } else {
      console.log(`PDF already exists at ${pdfPath}, skipping download`);
    }
    
    // Step 2: Extract text using multiple methods
    console.log('Starting text extraction...');
    
    // Method 1: pdf.js
    const pdfJsText = await extractTextWithPdfJs(pdfPath);
    
    // Method 2: pdf-parse (simpler approach)
    const pdfParseText = await extractTextWithPdfParse(pdfPath);
    
    // Method 3: Simple OCR
    let simpleOcrText = '';
    try {
      simpleOcrText = await extractTextWithSimpleOCR(pdfPath);
    } catch (ocrError) {
      console.error('Simple OCR extraction failed:', ocrError);
    }
    
    // Method 4: Python OCR (fallback)
    let pythonOcrText = '';
    try {
      pythonOcrText = await extractTextWithPythonOCR();
    } catch (pythonError) {
      console.error('Python OCR extraction failed:', pythonError);
    }
    
    // Merge text from all methods
    const finalText = mergeExtractedTexts([pdfJsText, pdfParseText, simpleOcrText, pythonOcrText]);
    
    if (!finalText || finalText.length < 100) {
      throw new Error('Failed to extract sufficient text from the document');
    }
    
    // Save the extracted text
    fs.writeFileSync(textPath, finalText);
    console.log(`\nExtracted text saved to ${textPath}`);
    
    // Display sample of extracted text
    console.log('\nExtracted text sample:');
    console.log('------------------------');
    console.log(finalText.substring(0, 500) + '...');
    console.log('------------------------');
    
    // Step 3: Process with SyntheticDataPipeline
    await processWithPipeline(finalText);
    
    console.log('\nDocument processing completed successfully!');
    
  } catch (error) {
    console.error('Error in document processing:', error);
  } finally {
    // Clean up temporary files (but keep the output)
    try {
      console.log('Cleaning up temporary files...');
      if (fs.existsSync(imagePath)) {
        const imagesToDelete = fs.readdirSync(imagePath);
        for (const image of imagesToDelete) {
          fs.unlinkSync(path.join(imagePath, image));
        }
        fs.rmdirSync(imagePath);
      }
      
      // Delete Python script if it exists
      const pythonScript = path.join(__dirname, 'temp_ocr.py');
      if (fs.existsSync(pythonScript)) {
        fs.unlinkSync(pythonScript);
      }
      
      console.log('Cleanup completed');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }
}

// Run the main function
main().catch(console.error); 