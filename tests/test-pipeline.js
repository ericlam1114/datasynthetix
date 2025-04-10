require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const SyntheticDataPipeline = require('../lib/SyntheticDataPipeline');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Test OpenAI connectivity
async function testOpenAIConnectivity() {
  console.log('\n--- Testing OpenAI API Connectivity ---');
  try {
    console.log(`Using API key: ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 5) + '...' : 'not set'}`);
    const result = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say "OpenAI connection successful"' }]
    });
    console.log('OpenAI API Test Result:', result.choices[0].message.content);
    return true;
  } catch (error) {
    console.error('OpenAI API Test Error:', error);
    return false;
  }
}

// Extract text from a file
async function extractTextFromFile(filePath) {
  console.log('\n--- Testing File Reading ---');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    console.log(`Successfully read file: ${filePath}`);
    console.log(`Text length: ${data.length} characters`);
    console.log('First 100 characters:', data.substring(0, 100));
    return data;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Test the synthetic data pipeline with a small chunk of text
async function testPipeline(text) {
  console.log('\n--- Testing Synthetic Data Pipeline ---');
  
  // First test with a small known text sample
  const sampleText = text || "This agreement outlines the terms and conditions between the parties. The customer agrees to pay $500 for the services rendered within 30 days of receipt.";
  
  console.log('Testing pipeline with sample text:', sampleText);
  
  const pipeline = new SyntheticDataPipeline({
    apiKey: process.env.OPENAI_API_KEY,
    onProgress: (stage, stats) => {
      console.log(`Pipeline progress - ${stage}:`, stats);
    }
  });
  
  try {
    const result = await pipeline.process(sampleText);
    console.log('Pipeline completed successfully');
    console.log('Output format:', pipeline.outputFormat);
    console.log('Stats:', result.stats);
    console.log('First 100 characters of output:', result.output.substring(0, 100));
    return result;
  } catch (error) {
    console.error('Pipeline processing error:', error);
    return null;
  }
}

// Test extractor model specifically
async function testExtractorModel(text) {
  console.log('\n--- Testing Extractor Model Directly ---');
  
  const sampleText = text || "This agreement outlines the terms and conditions between the parties. The customer agrees to pay $500 for the services rendered within 30 days of receipt.";
  
  try {
    const model = "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB"; // Using fine-tuned model
    console.log(`Testing extractor model: ${model}`);
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a data extractor that identifies and formats exact clauses from documents without rewriting them." },
        { role: "user", content: sampleText }
      ]
    });
    
    console.log('Extractor response:', response.choices[0].message.content);
    return response;
  } catch (error) {
    console.error('Extractor model test error:', error);
    if (error.code === 'model_not_found') {
      console.error('The model specified does not exist or you do not have access to it.');
    }
    return null;
  }
}

// Test duplicator model specifically
async function testDuplicatorModel(text) {
  console.log('\n--- Testing Duplicator Model Directly ---');
  
  const sampleText = text || "This agreement outlines the terms and conditions between the parties. The customer agrees to pay $500 for the services rendered within 30 days of receipt.";
  
  try {
    const model = "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc";
    console.log(`Testing duplicator model: ${model}`);
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { 
          role: "system", 
          content: "You are a clause rewriter that duplicates organizational language and formatting with high fidelity."
        },
        { 
          role: "user", 
          content: sampleText
        }
      ]
    });
    
    console.log('Duplicator response:', response.choices[0].message.content);
    return response;
  } catch (error) {
    console.error('Duplicator model test error:', error);
    if (error.code === 'model_not_found') {
      console.error('The model specified does not exist or you do not have access to it.');
    }
    return null;
  }
}

// Test classifier model specifically
async function testClassifierModel(text) {
  console.log('\n--- Testing Classifier Model Directly ---');
  
  const sampleText = text || "This agreement outlines the terms and conditions between the parties. The customer agrees to pay $500 for the services rendered within 30 days of receipt.";
  
  try {
    const model = "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy";
    console.log(`Testing classifier model: ${model}`);
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { 
          role: "system", 
          content: "You are a document importance classifier that analyzes legal and business text to identify and rank the most important clauses. You evaluate clauses based on legal significance, financial impact, risk exposure, and operational relevance. You classify each clause as 'Critical', 'Important', or 'Standard' and explain your reasoning."
        },
        { 
          role: "user", 
          content: `Please classify the importance of this clause: '${sampleText}'` 
        }
      ]
    });
    
    console.log('Classifier response:', response.choices[0].message.content);
    return response;
  } catch (error) {
    console.error('Classifier model test error:', error);
    if (error.code === 'model_not_found') {
      console.error('The model specified does not exist or you do not have access to it.');
    }
    return null;
  }
}

// Main test function
async function runTests() {
  // Get file path from command line argument
  const filePath = process.argv[2];
  
  console.log('=== STARTING PIPELINE TESTS ===');
  console.log('Node environment:', process.env.NODE_ENV);
  
  // Step 1: Test OpenAI connectivity
  const apiConnected = await testOpenAIConnectivity();
  if (!apiConnected) {
    console.error('OpenAI API connection failed. Please check your API key and network connection.');
    return;
  }
  
  // Step 2: Test a sample file if provided
  let fileText = null;
  if (filePath) {
    fileText = await extractTextFromFile(filePath);
    if (!fileText) {
      console.error('Failed to read text from file. Testing with sample text instead.');
    }
  }
  
  // Step 3: Test extractor model
  const extractorResult = await testExtractorModel(fileText?.substring(0, 1000));
  if (!extractorResult) {
    console.error('Extractor model test failed. The pipeline will not work without a functioning extractor.');
  }
  
  // Step 3.5: Test classifier model
  const classifierResult = await testClassifierModel(fileText?.substring(0, 1000));
  if (!classifierResult) {
    console.error('Classifier model test failed. The pipeline will not work without a functioning classifier.');
  }
  
  // Step 3.6: Test duplicator model
  const duplicatorResult = await testDuplicatorModel(fileText?.substring(0, 1000));
  if (!duplicatorResult) {
    console.error('Duplicator model test failed. The pipeline will not work without a functioning duplicator.');
  }
  
  // Step 4: Test the full pipeline
  if (fileText) {
    const pipelineResult = await testPipeline(fileText.substring(0, 5000)); // Use first 5000 chars for testing
    
    if (!pipelineResult) {
      console.error('Pipeline test failed with file text.');
    }
  } else {
    // Test with sample text
    const pipelineResult = await testPipeline();
    
    if (!pipelineResult) {
      console.error('Pipeline test failed with sample text.');
    }
  }
  
  console.log('\n=== TEST SUMMARY ===');
  console.log('OpenAI API Connection:', apiConnected ? 'SUCCESS' : 'FAILED');
  console.log('File Reading:', fileText ? 'SUCCESS' : 'FAILED/NOT ATTEMPTED');
  console.log('Extractor Model Test:', extractorResult ? 'SUCCESS' : 'FAILED');
  console.log('Classifier Model Test:', classifierResult ? 'SUCCESS' : 'FAILED');
  console.log('Duplicator Model Test:', duplicatorResult ? 'SUCCESS' : 'FAILED');
  console.log('Full Pipeline Test:', 'See above logs');
  
  console.log('\n=== TESTS COMPLETED ===');
}

runTests(); 