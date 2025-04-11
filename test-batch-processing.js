// Test script for batch processing multiple document parts
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Define constants
const LARGE_PDF_PATH = path.join(__dirname, 'temp', 'large_sample.pdf');
const OUTPUT_DIR = path.join(__dirname, 'temp', 'batch-results');
const NUM_PARTS = 4; // Split into 4 parts for testing

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Mock document processor function (simulating the real document processor)
async function processDocument(document) {
  return new Promise((resolve) => {
    console.log(`Processing document: ${document.name}`);
    
    // Simulate processing time (1-3 seconds)
    const processingTime = 1000 + Math.random() * 2000;
    
    setTimeout(() => {
      console.log(`Completed processing ${document.name} in ${(processingTime/1000).toFixed(2)}s`);
      
      // Return mock result
      resolve({
        success: true,
        document: document,
        stats: {
          processedPages: document.pages,
          extractedClauses: Math.floor(document.pages * 2.5), // Simulate ~2.5 clauses per page
          generatedVariants: Math.floor(document.pages * 7.5), // Simulate ~3 variants per clause
          processingTime: processingTime
        }
      });
    }, processingTime);
  });
}

// Split PDF into multiple parts
async function splitPDF(pdfPath, numParts) {
  try {
    console.log(`Splitting PDF at ${pdfPath} into ${numParts} parts...`);
    
    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
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
      
      if (startPage >= pageCount) {
        break; // Don't create empty parts
      }
      
      console.log(`Creating part ${i+1}/${numParts}, pages ${startPage}-${endPage}`);
      
      // Create a new document
      const newPdf = await PDFDocument.create();
      
      // Calculate page indexes to copy
      const pageIndexes = Array.from(
        { length: endPage - startPage + 1 },
        (_, j) => startPage + j
      );
      
      // Copy pages from original document
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndexes);
      
      // Add pages to new document
      copiedPages.forEach(page => newPdf.addPage(page));
      
      // Save the document
      const pdfBytes = await newPdf.save();
      
      // Generate new filename
      const fileName = `batch_part_${i+1}_of_${numParts}.pdf`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      
      // Write file to disk
      fs.writeFileSync(filePath, Buffer.from(pdfBytes));
      console.log(`Saved ${fileName}`);
      
      // Add to result
      splitDocuments.push({
        id: `part-${i+1}`,
        name: fileName,
        path: filePath,
        size: pdfBytes.length,
        pages: endPage - startPage + 1
      });
    }
    
    return splitDocuments;
  } catch (error) {
    console.error('Error splitting PDF:', error);
    throw error;
  }
}

// Process all document parts in batch with progress tracking
async function processBatch(documents) {
  console.log(`\nStarting batch processing of ${documents.length} document parts...`);
  
  const batchProgress = {};
  const batchResults = [];
  const startTime = Date.now();

  // Initialize progress for all documents
  documents.forEach(doc => {
    batchProgress[doc.id] = {
      completed: false,
      progress: 0
    };
  });
  
  // Process with a concurrency limit of 2 (simulate parallel processing)
  const concurrencyLimit = 2;
  let activeJobs = 0;
  let docsToProcess = [...documents]; // Clone the array
  
  while (docsToProcess.length > 0 || activeJobs > 0) {
    // Process more documents if we have capacity
    while (activeJobs < concurrencyLimit && docsToProcess.length > 0) {
      const doc = docsToProcess.shift();
      activeJobs++;
      
      // Process the document (async)
      processDocument(doc).then(result => {
        // Update batch progress
        batchProgress[doc.id] = {
          completed: true,
          success: result.success,
          stats: result.stats
        };
        
        // Add to results
        batchResults.push(result);
        
        // Print progress
        const completedCount = Object.values(batchProgress).filter(p => p.completed).length;
        const progressPercent = Math.round((completedCount / documents.length) * 100);
        console.log(`Batch progress: ${completedCount}/${documents.length} documents (${progressPercent}%)`);
        
        // Decrease active jobs count
        activeJobs--;
      });
    }
    
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;
  
  console.log(`\nBatch processing completed in ${totalTime.toFixed(2)} seconds`);
  
  // Calculate aggregated statistics
  const aggregatedStats = {
    totalDocuments: documents.length,
    totalPages: documents.reduce((sum, doc) => sum + doc.pages, 0),
    totalClauses: batchResults.reduce((sum, result) => sum + result.stats.extractedClauses, 0),
    totalVariants: batchResults.reduce((sum, result) => sum + result.stats.generatedVariants, 0)
  };
  
  return {
    success: true,
    results: batchResults,
    stats: aggregatedStats,
    processingTime: totalTime
  };
}

// Main function to run the test
async function runTest() {
  try {
    console.log('Starting batch processing test...');
    
    // Check if our large sample PDF exists
    if (!fs.existsSync(LARGE_PDF_PATH)) {
      console.error(`Large sample PDF not found at: ${LARGE_PDF_PATH}`);
      return;
    }
    
    // Get file info
    const stats = fs.statSync(LARGE_PDF_PATH);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Sample PDF size: ${fileSizeMB} MB`);
    
    // Split the PDF into parts
    console.log(`\nSplitting PDF into ${NUM_PARTS} parts for batch processing...`);
    const documents = await splitPDF(LARGE_PDF_PATH, NUM_PARTS);
    
    // Process all parts in batch
    const batchResult = await processBatch(documents);
    
    // Display final results
    console.log('\nBatch Processing Results:');
    console.log('--------------------------------------------------');
    console.log(`Total documents processed: ${batchResult.stats.totalDocuments}`);
    console.log(`Total pages processed: ${batchResult.stats.totalPages}`);
    console.log(`Total clauses extracted: ${batchResult.stats.totalClauses}`);
    console.log(`Total variants generated: ${batchResult.stats.totalVariants}`);
    console.log(`Processing time: ${batchResult.processingTime.toFixed(2)} seconds`);
    console.log('--------------------------------------------------');
    
    // Detailed results per document
    console.log('\nResults per document part:');
    batchResult.results.forEach((result, index) => {
      console.log(`\nPart ${index + 1}: ${result.document.name}`);
      console.log(` - Pages: ${result.document.pages}`);
      console.log(` - Clauses extracted: ${result.stats.extractedClauses}`);
      console.log(` - Variants generated: ${result.stats.generatedVariants}`);
      console.log(` - Processing time: ${(result.stats.processingTime / 1000).toFixed(2)} seconds`);
    });
    
    return batchResult;
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest().then(() => {
  console.log('\nBatch processing test completed successfully');
}).catch(error => {
  console.error('\nUnexpected error:', error);
}); 