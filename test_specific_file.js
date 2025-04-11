// Script to test processing a specific PDF file
const fs = require('fs');
const path = require('path');
const https = require('https');
const { OpenAI } = require('openai');

// Import SyntheticDataPipeline correctly
let SyntheticDataPipeline;
try {
  // Try importing from the src/lib path (Next.js structure)
  const pipelineModule = require('./src/lib/SyntheticDataPipeline');
  
  // Check different export patterns
  if (pipelineModule.SyntheticDataPipeline) {
    SyntheticDataPipeline = pipelineModule.SyntheticDataPipeline;
  } else if (typeof pipelineModule === 'function') {
    SyntheticDataPipeline = pipelineModule;
  } else if (pipelineModule.default) {
    SyntheticDataPipeline = pipelineModule.default;
  }
  
  console.log('Successfully imported SyntheticDataPipeline');
} catch (error) {
  console.error('Error importing SyntheticDataPipeline from src/lib:', error);
  
  try {
    // Fallback to lib directory
    const pipelineModule = require('./lib/SyntheticDataPipeline');
    
    // Check different export patterns
    if (pipelineModule.SyntheticDataPipeline) {
      SyntheticDataPipeline = pipelineModule.SyntheticDataPipeline;
    } else if (typeof pipelineModule === 'function') {
      SyntheticDataPipeline = pipelineModule;
    } else if (pipelineModule.default) {
      SyntheticDataPipeline = pipelineModule.default;
    }
    
    console.log('Successfully imported SyntheticDataPipeline from fallback path');
  } catch (fallbackError) {
    console.error('Error importing SyntheticDataPipeline from fallback path:', fallbackError);
  }
}

// File information for test
const FILE_INFO = {
  gsPath: 'gs://datasynthetix.firebasestorage.app/documents/YlCzr5g4Xjc45c7z8fLtnO9LR1F3/Buffy%20Podcasts%20-%20Acquisitions.pdf',
  accessToken: '3265ffb1-3298-4556-9438-07576cdedebe',
  httpUrl: 'https://firebasestorage.googleapis.com/v0/b/datasynthetix.firebasestorage.app/o/documents%2FYlCzr5g4Xjc45c7z8fLtnO9LR1F3%2FBuffy%20Podcasts%20-%20Acquisitions.pdf?alt=media'
};

// Configuration options for processing
const PROCESS_OPTIONS = {
  outputFormat: 'jsonl',  // Options: jsonl, openai, mistral, claude, csv
  industry: 'legal',      // Options: legal, sop, finance
  modelType: 'rewriter',  // Options based on industry: rewriter, analyzer, qa, etc.
  chunkSize: 1000,
  overlap: 100,
  classFilter: 'all',     // Options: all, critical, important, critical_important
  prioritizeImportant: false
};

// Constants for document processing limits
const DOCUMENT_LIMITS = {
  MAX_PAGES_PER_BATCH: 50,        // Maximum number of pages per batch
  MAX_CHARS_PER_BATCH: 100000,    // Maximum characters per batch
  MAX_API_TOKENS: 100000,         // Approximate token limit for API
  CHARS_PER_TOKEN: 4,             // Approximate characters per token
  MAX_PROCESSING_TIME_MS: 600000  // Maximum processing time (10 minutes)
};

// Paths for files
const pdfPath = path.join(__dirname, 'test_specific_file.pdf');
const textPath = path.join(__dirname, 'test_specific_file.txt');
const outputPath = path.join(__dirname, 'test_specific_output.jsonl');
const batchesDir = path.join(__dirname, 'batch_parts');

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Function to download a file from a URL
function downloadFile(url, destinationPath, token = null) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url}...`);
    
    const options = {};
    if (token) {
      options.headers = {
        'Authorization': `Bearer ${token}`
      };
    }
    
    const file = fs.createWriteStream(destinationPath);
    
    https.get(url, options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        console.log(`Following redirect to: ${response.headers.location}`);
        return downloadFile(response.headers.location, destinationPath, token)
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

// Function to extract text from PDF using pdf-parse
async function extractTextFromPdf(pdfPath) {
  console.log('Extracting text from PDF...');
  
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    
    const data = await pdfParse(dataBuffer);
    console.log(`Successfully extracted ${data.text.length} characters from PDF`);
    console.log(`PDF has ${data.numpages} pages`);
    
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info
    };
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return { text: '', numPages: 0, info: {} };
  }
}

// Function to analyze document and determine if it needs to be batched
function analyzeDocumentForBatching(text, numPages) {
  const needsBatching = 
    numPages > DOCUMENT_LIMITS.MAX_PAGES_PER_BATCH || 
    text.length > DOCUMENT_LIMITS.MAX_CHARS_PER_BATCH;
  
  let recommendedBatches = 1;
  
  if (needsBatching) {
    // Calculate recommended batches based on pages and text length
    const batchesByPages = Math.ceil(numPages / DOCUMENT_LIMITS.MAX_PAGES_PER_BATCH);
    const batchesByChars = Math.ceil(text.length / DOCUMENT_LIMITS.MAX_CHARS_PER_BATCH);
    
    // Use the larger recommendation
    recommendedBatches = Math.max(batchesByPages, batchesByChars);
  }
  
  const approximateTokens = Math.ceil(text.length / DOCUMENT_LIMITS.CHARS_PER_TOKEN);
  
  return {
    needsBatching,
    recommendedBatches,
    textLength: text.length,
    pages: numPages,
    approximateTokens,
    exceedsTokenLimit: approximateTokens > DOCUMENT_LIMITS.MAX_API_TOKENS,
    estimatedTimeMs: approximateTokens * 10, // Rough estimate: 10ms per token processing
    exceedsTimeLimit: (approximateTokens * 10) > DOCUMENT_LIMITS.MAX_PROCESSING_TIME_MS
  };
}

// Function to split document into batches for processing
function splitDocumentIntoBatches(text, batchCount) {
  // Create the batches directory if it doesn't exist
  if (!fs.existsSync(batchesDir)) {
    fs.mkdirSync(batchesDir, { recursive: true });
  }
  
  const batchSize = Math.ceil(text.length / batchCount);
  const batches = [];
  
  for (let i = 0; i < batchCount; i++) {
    const startPos = i * batchSize;
    let endPos = startPos + batchSize;
    
    // If not the last batch, find a better break point (sentence or paragraph)
    if (i < batchCount - 1) {
      // Try to find paragraph breaks first
      const paragraphBreakPos = text.lastIndexOf('\n\n', endPos);
      if (paragraphBreakPos > startPos + (batchSize / 2)) {
        endPos = paragraphBreakPos + 2; // Include the double newline
      } else {
        // Try to find sentence breaks
        const sentenceBreaks = ['. ', '! ', '? ', '\n'];
        for (const sentenceBreak of sentenceBreaks) {
          const breakPos = text.lastIndexOf(sentenceBreak, endPos);
          if (breakPos > startPos + (batchSize / 2)) {
            endPos = breakPos + sentenceBreak.length;
            break;
          }
        }
      }
    }
    
    const batchText = text.substring(startPos, endPos);
    const batchFilePath = path.join(batchesDir, `batch_${i+1}_of_${batchCount}.txt`);
    
    fs.writeFileSync(batchFilePath, batchText);
    console.log(`Created batch ${i+1}/${batchCount}: ${batchText.length} characters`);
    
    batches.push({
      index: i + 1,
      path: batchFilePath,
      text: batchText,
      startPos,
      endPos
    });
  }
  
  return batches;
}

// Process document with SyntheticDataPipeline
async function processWithPipeline(text) {
  console.log(`Processing document with ${text.length} characters...`);
  
  // Check if SyntheticDataPipeline is available
  if (!SyntheticDataPipeline || typeof SyntheticDataPipeline !== 'function') {
    console.log('SyntheticDataPipeline not available, using OpenAI fallback method');
    return processWithOpenAI(text);
  }
  
  // Configure pipeline based on process options
  let pipelineConfig = {
    apiKey: OPENAI_API_KEY,
    extractorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
    classifierModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:abcdefgh",
    duplicatorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
    ...PROCESS_OPTIONS,
    // Add industry-specific models if needed
  };
  
  // Modify configuration based on industry and model type
  switch (`${PROCESS_OPTIONS.industry}_${PROCESS_OPTIONS.modelType}`) {
    case 'legal_rewriter':
      pipelineConfig.extractorModel = "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB";
      pipelineConfig.prioritizeImportant = true;
      break;
    case 'sop_qa':
      pipelineConfig.outputFormat = 'structured_qa';
      pipelineConfig.extractorModel = "ft:gpt-4o-mini-2024-07-18:personal:sop-extractor:BJoJl5pB";
      break;
    // Add more cases as needed
  }
  
  try {
    // Initialize pipeline
    console.log('Initializing SyntheticDataPipeline with configuration:', pipelineConfig);
    const pipeline = new SyntheticDataPipeline(pipelineConfig);
    
    // Add progress reporting
    pipeline.onProgress = (stage, stats) => {
      console.log(`Processing stage: ${stage}`, stats);
    };
    
    // Process the document
    console.log('Starting document processing...');
    const result = await pipeline.process(text);
    
    console.log('Document processing complete');
    console.log(`Pipeline stats: ${JSON.stringify(result.stats)}`);
    
    // Save the results
    fs.writeFileSync(outputPath, result.output);
    console.log(`Results saved to ${outputPath}`);
    
    return result;
  } catch (error) {
    console.error('Error processing document with pipeline:', error);
    throw error;
  }
}

// Process batch of documents using the pipeline
async function processBatches(batches) {
  console.log(`Processing ${batches.length} batches...`);
  
  const results = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nProcessing batch ${i+1}/${batches.length} (${batch.text.length} characters)...`);
    
    try {
      const batchResult = await processWithPipeline(batch.text);
      
      // Save individual batch result
      const batchOutputPath = path.join(batchesDir, `output_batch_${i+1}_of_${batches.length}.jsonl`);
      fs.writeFileSync(batchOutputPath, batchResult.output);
      
      console.log(`Batch ${i+1} processing complete. Results saved to ${batchOutputPath}`);
      results.push(batchResult);
    } catch (error) {
      console.error(`Error processing batch ${i+1}:`, error);
      // Continue with next batch
    }
  }
  
  // Combine all batch results
  if (results.length > 0) {
    // Combine outputs
    const combinedOutput = results.map(r => r.output).join('\n');
    fs.writeFileSync(outputPath, combinedOutput);
    
    // Combine stats
    const combinedStats = results.reduce((stats, r) => {
      if (!r.stats) return stats;
      
      return {
        totalChunks: (stats.totalChunks || 0) + (r.stats.totalChunks || 0),
        extractedClauses: (stats.extractedClauses || 0) + (r.stats.extractedClauses || 0),
        processedClauses: (stats.processedClauses || 0) + (r.stats.processedClauses || 0),
        classifiedClauses: (stats.classifiedClauses || 0) + (r.stats.classifiedClauses || 0),
        generatedVariants: (stats.generatedVariants || 0) + (r.stats.generatedVariants || 0),
      };
    }, {});
    
    console.log(`All batches processed. Combined results saved to ${outputPath}`);
    console.log(`Combined stats: ${JSON.stringify(combinedStats)}`);
    
    return {
      output: combinedOutput,
      stats: combinedStats
    };
  }
  
  throw new Error('No batches were successfully processed');
}

// Fallback processing method using the OpenAI API directly
async function processWithOpenAI(text) {
  console.log('Falling back to direct OpenAI processing...');
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    
    // 1. Extract clauses
    console.log('Extracting clauses...');
    const extractionPrompt = "You are a document analysis assistant that identifies and extracts important clauses, rules, and requirements from documents. Extract any complete clauses or statements that define requirements, regulations, or important guidelines. Return exactly ONE clause per line, with no numbering or prefixes.";
    
    // Create chunks of text (simplified chunking)
    const chunks = [];
    const chunkSize = 4000;
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    
    console.log(`Processing ${chunks.length} chunks...`);
    
    // Process each chunk
    const allClauses = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i+1}/${chunks.length}...`);
      
      try {
        const extractionResponse = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: extractionPrompt },
            { role: "user", content: chunk }
          ],
          temperature: 0.3,
          max_tokens: 1500,
        });
        
        const extractedText = extractionResponse.choices[0].message.content;
        const clauses = extractedText.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 20);
          
        console.log(`Extracted ${clauses.length} clauses from chunk ${i+1}`);
        allClauses.push(...clauses);
      } catch (chunkError) {
        console.error(`Error processing chunk ${i+1}:`, chunkError);
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Remove duplicates
    const uniqueClauses = [...new Set(allClauses)];
    console.log(`Found ${uniqueClauses.length} unique clauses from ${allClauses.length} total`);
    
    // Limit to 50 clauses for testing
    const limitedClauses = uniqueClauses.slice(0, 50);
    
    // 2. Classify clauses
    console.log('Classifying clauses...');
    const classifiedClauses = [];
    
    for (let i = 0; i < limitedClauses.length; i++) {
      const clause = limitedClauses[i];
      console.log(`Classifying clause ${i+1}/${limitedClauses.length}...`);
      
      try {
        const classificationResponse = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: "You are a document classifier that analyzes text to identify important clauses. Classify this clause as 'Critical', 'Important', or 'Standard' based on its impact. Reply with ONLY the classification."
            },
            { role: "user", content: clause }
          ],
          temperature: 0.1,
          max_tokens: 10,
        });
        
        const classification = classificationResponse.choices[0].message.content.trim();
        
        classifiedClauses.push({
          input: clause,
          classification: 
            classification.includes("Critical") ? "Critical" : 
            classification.includes("Important") ? "Important" : "Standard"
        });
      } catch (classifyError) {
        console.error(`Error classifying clause ${i+1}:`, classifyError);
        classifiedClauses.push({
          input: clause,
          classification: "Standard" // Default if classification fails
        });
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 3. Generate variants
    console.log('Generating variants...');
    const variants = [];
    
    for (let i = 0; i < classifiedClauses.length; i++) {
      const classifiedClause = classifiedClauses[i];
      console.log(`Generating variant for clause ${i+1}/${classifiedClauses.length}...`);
      
      try {
        const variantResponse = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: "You are a clause rewriter that duplicates organizational language and formatting with high fidelity. Create an alternative version that maintains the same meaning but uses different wording."
            },
            { role: "user", content: classifiedClause.input }
          ],
          temperature: 0.7,
          max_tokens: 500,
        });
        
        const variant = variantResponse.choices[0].message.content.trim();
        
        variants.push({
          input: classifiedClause.input,
          classification: classifiedClause.classification,
          output: variant
        });
      } catch (variantError) {
        console.error(`Error generating variant for clause ${i+1}:`, variantError);
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 4. Format output based on specified format
    console.log('Formatting output...');
    let output = "";
    
    switch (PROCESS_OPTIONS.outputFormat) {
      case 'jsonl':
        output = variants.map(v => JSON.stringify(v)).join('\n');
        break;
      case 'openai':
        output = variants.map(v => JSON.stringify({
          messages: [
            { role: "system", content: "You are an expert in this domain." },
            { role: "user", content: v.input },
            { role: "assistant", content: v.output }
          ]
        })).join('\n');
        break;
      case 'csv':
        output = "input,classification,output\n" + 
          variants.map(v => 
            `"${v.input.replace(/"/g, '""')}","${v.classification}","${v.output.replace(/"/g, '""')}"`
          ).join('\n');
        break;
      default:
        output = variants.map(v => JSON.stringify(v)).join('\n');
    }
    
    // Save the output
    fs.writeFileSync(outputPath, output);
    console.log(`Results saved to ${outputPath}`);
    
    return {
      stats: {
        totalClauses: uniqueClauses.length,
        processedClauses: classifiedClauses.length,
        generatedVariants: variants.length
      },
      output
    };
  } catch (error) {
    console.error('Error in OpenAI processing:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('Starting test for specific file processing...');
    
    // Step 1: Download the PDF if it doesn't exist
    if (!fs.existsSync(pdfPath)) {
      await downloadFile(FILE_INFO.httpUrl, pdfPath, FILE_INFO.accessToken);
    } else {
      console.log(`PDF already exists at ${pdfPath}, skipping download`);
    }
    
    // Step 2: Extract text from the PDF
    const { text: extractedText, numPages } = await extractTextFromPdf(pdfPath);
    if (!extractedText || extractedText.length < 100) {
      throw new Error('Failed to extract sufficient text from the PDF');
    }
    
    // Save the extracted text
    fs.writeFileSync(textPath, extractedText);
    console.log(`Extracted text saved to ${textPath} (${extractedText.length} characters)`);
    
    console.log('\nExtracted text sample:');
    console.log('------------------------');
    console.log(extractedText.substring(0, 500) + '...');
    console.log('------------------------');
    
    // Step 3: Analyze document for batching
    const analysis = analyzeDocumentForBatching(extractedText, numPages);
    console.log('\nDocument analysis:');
    console.log(analysis);
    
    // Step 4: Process the document (with batching if needed)
    let result;
    
    if (analysis.needsBatching) {
      console.log(`\nDocument needs to be split into ${analysis.recommendedBatches} batches for processing.`);
      console.log('In a real app, users would be prompted to confirm this batch processing.');
      
      // Split the document into batches
      const batches = splitDocumentIntoBatches(extractedText, analysis.recommendedBatches);
      
      try {
        // Process all batches
        result = await processBatches(batches);
      } catch (batchError) {
        console.error('Batch processing failed:', batchError);
        
        // Try processing just the first batch as a fallback
        console.log('\nFalling back to processing just the first batch...');
        result = await processWithPipeline(batches[0].text);
      }
    } else {
      try {
        // Try using the pipeline first for the whole document
        result = await processWithPipeline(extractedText);
      } catch (pipelineError) {
        console.error('Pipeline processing failed, falling back to OpenAI:', pipelineError);
        // Fallback to direct OpenAI processing
        result = await processWithOpenAI(extractedText);
      }
    }
    
    // Step 5: Display sample of output
    if (result && result.output && result.output.length > 0) {
      const outputLines = result.output.split('\n');
      const sampleCount = Math.min(3, outputLines.length);
      
      console.log('\nOutput sample:');
      console.log('------------------------');
      for (let i = 0; i < sampleCount; i++) {
        try {
          const item = JSON.parse(outputLines[i]);
          console.log(`[${i+1}] Original (${item.classification}):`);
          console.log(`    ${item.input.substring(0, 100)}...`);
          console.log(`    Variant:`);
          console.log(`    ${item.output.substring(0, 100)}...`);
          console.log('');
        } catch (e) {
          console.log(outputLines[i]);
        }
      }
      console.log('------------------------');
    }
    
    console.log('\nProcessing completed successfully!');
    
  } catch (error) {
    console.error('Error processing specific file:', error);
  }
}

// Run the main function
main().catch(console.error); 