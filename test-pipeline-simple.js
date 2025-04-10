// test-pipeline-simple.js
require('dotenv').config();
const SyntheticDataPipeline = require('./lib/SyntheticDataPipeline');

async function testPipeline() {
  console.log('Starting pipeline test...');
  
  // Create pipeline instance
  const pipeline = new SyntheticDataPipeline({
    apiKey: process.env.OPENAI_API_KEY,
    outputFormat: 'jsonl',
    onProgress: (stage, stats) => {
      console.log(`Progress (${stage}):`, stats);
    }
  });
  
  // Sample text for testing
  const sampleText = `
  This Commercial Lease Agreement ("Agreement") is made on March 15, 2025, between 
  Samuel James Wilson ("Property Owner"), with address at 893 Maple Street, Springfield, IL 62701, 
  and Christina Maria Garcia ("Lessee"), with current address at the property described herein. 
  Property Owner and Lessee shall together be known as the "Contracting Parties."
  
  Property Owner grants to Lessee, and Lessee accepts from Property Owner, the commercial space 
  situated at 578 River Road, Suite 201, Springfield, IL 62702 ("Leased Space").
  
  The Leased Space is a three-room office suite, measuring 1,200 square feet, with access 
  to two reserved parking spaces (Spaces #7 and #8) in the building's underground garage.
  `;
  
  try {
    // Process the sample text
    const result = await pipeline.process(sampleText);
    
    // Display results
    console.log('Processing completed successfully!');
    console.log('Stats:', result.stats);
    console.log('Output sample:', result.output.substring(0, 500) + '...');
    
    return result;
  } catch (error) {
    console.error('Pipeline test failed:', error);
    throw error;
  }
}

// Run the test
testPipeline()
  .then(() => {
    console.log('Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 