// Process extracted text with SyntheticDataPipeline
const fs = require('fs');
const path = require('path');

// Import SyntheticDataPipeline correctly
const SyntheticDataPipeline = require('./lib/SyntheticDataPipeline');
// If that doesn't work, we'll try different import approaches

// Paths for files
const textPath = path.join(__dirname, 'extracted_text.txt');
const outputPath = path.join(__dirname, 'output.jsonl');

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Main function
async function main() {
  try {
    console.log('Starting processing of extracted text...');
    
    // Read the extracted text
    if (!fs.existsSync(textPath)) {
      throw new Error(`Extracted text file not found: ${textPath}`);
    }
    
    const extractedText = fs.readFileSync(textPath, 'utf8');
    console.log(`Read ${extractedText.length} characters from ${textPath}`);
    
    // Display sample of extracted text
    console.log('\nExtracted text sample:');
    console.log('------------------------');
    console.log(extractedText.substring(0, 500) + '...');
    console.log('------------------------');
    
    // Check which import method works for SyntheticDataPipeline
    console.log('Initializing SyntheticDataPipeline...');
    
    let pipeline;
    try {
      // Try different import approaches
      if (typeof SyntheticDataPipeline === 'function') {
        console.log('Using direct require import of SyntheticDataPipeline');
        pipeline = new SyntheticDataPipeline({
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
      } else if (SyntheticDataPipeline.SyntheticDataPipeline) {
        console.log('Using named export SyntheticDataPipeline.SyntheticDataPipeline');
        pipeline = new SyntheticDataPipeline.SyntheticDataPipeline({
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
      } else if (SyntheticDataPipeline.default) {
        console.log('Using default export SyntheticDataPipeline.default');
        pipeline = new SyntheticDataPipeline.default({
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
      } else {
        throw new Error('SyntheticDataPipeline not found in the imported module');
      }
    } catch (importError) {
      console.error('Error initializing pipeline through standard imports:', importError);
      
      // Try direct import with require syntax
      try {
        console.log('Trying alternative import...');
        const altPipeline = require('./lib/SyntheticDataPipeline');
        console.log('Import result:', typeof altPipeline, Object.keys(altPipeline));
        
        if (typeof altPipeline === 'function') {
          pipeline = new altPipeline({
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
        } else if (altPipeline.SyntheticDataPipeline) {
          pipeline = new altPipeline.SyntheticDataPipeline({
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
        } else {
          throw new Error('Alternative import also failed');
        }
      } catch (altImportError) {
        console.error('All import attempts failed:', altImportError);
        throw new Error('Could not initialize SyntheticDataPipeline');
      }
    }
    
    console.log('Pipeline initialization successful');
    
    // Process the document
    console.log(`Processing document with ${extractedText.length} characters...`);
    const result = await pipeline.process(extractedText);
    
    console.log(`Pipeline processing complete: Generated ${result.stats?.generatedVariants || 0} variants`);
    
    // Save results
    fs.writeFileSync(outputPath, result.output);
    console.log(`Results saved to ${outputPath}`);
    
    console.log('\nDocument processing completed successfully!');
    
    // Display a sample of the output
    if (result.output && result.output.length > 0) {
      console.log('\nOutput sample:');
      console.log('------------------------');
      console.log(result.output.substring(0, 1000) + '...');
      console.log('------------------------');
    }
    
  } catch (error) {
    console.error('Error in document processing:', error);
  }
}

// Run the main function
main().catch(console.error); 