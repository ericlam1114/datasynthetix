// test_pipeline.js
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file

// Import the SyntheticDataPipeline
const { SyntheticDataPipeline } = require('./src/lib/SyntheticDataPipeline');

// Sample document text (simplified for testing)
const sampleText = `
MASTER SERVICES AGREEMENT

This Master Services Agreement (the "Agreement") is entered into as of the Effective Date by and between Company A ("Client") and Company B ("Provider").

1. SERVICES
   Provider shall provide the services described in one or more Statement of Work ("SOW") executed by the parties (the "Services"). Each SOW shall be subject to the terms and conditions of this Agreement.

2. PAYMENT TERMS
   Client shall pay Provider for the Services at the rates specified in the applicable SOW. Provider shall invoice Client monthly for Services performed during the preceding month. Client shall pay all undisputed invoices within thirty (30) days of receipt.

3. CONFIDENTIALITY
   Each party shall maintain the confidentiality of all proprietary information disclosed by the other party.
`;

async function runTest() {
  console.log('Initializing SyntheticDataPipeline...');
  
  try {
    // Initialize the pipeline with test settings
    const pipeline = new SyntheticDataPipeline({
      outputFormat: 'jsonl',
      maxClausesToProcess: 5,
      maxVariantsPerClause: 2,
    });
    
    console.log('Processing sample document...');
    // Process the sample text
    const results = await pipeline.process(sampleText);
    
    console.log('Processing complete!');
    console.log(`Generated ${results.length} results`);
    
    // Save results to file
    const outputPath = path.join(__dirname, 'test_output.jsonl');
    fs.writeFileSync(outputPath, results.join('\n'));
    
    console.log(`Results saved to ${outputPath}`);
  } catch (error) {
    console.error('Error running test:', error);
  }
}

// Run the test
runTest(); 