// Process a sample of the extracted document
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Paths for files
const textPath = path.join(__dirname, 'extracted_text.txt');
const samplePath = path.join(__dirname, 'sample_text.txt');
const outputPath = path.join(__dirname, 'sample_output.jsonl');

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Main function
async function main() {
  try {
    console.log('Starting sample processing...');
    
    // Read the extracted text
    if (!fs.existsSync(textPath)) {
      throw new Error(`Extracted text file not found: ${textPath}`);
    }
    
    const extractedText = fs.readFileSync(textPath, 'utf8');
    console.log(`Read ${extractedText.length} characters from ${textPath}`);
    
    // Take just the first 20,000 characters (about 5-10 pages)
    const sampleText = extractedText.substring(0, 20000);
    fs.writeFileSync(samplePath, sampleText);
    console.log(`Created sample text with ${sampleText.length} characters`);
    
    // Step 1: Extract clauses
    console.log('Step 1: Extracting clauses from sample...');
    const extractionResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a document analysis assistant that identifies and extracts important clauses, rules, and requirements from documents. Extract any complete clauses or statements that define safety requirements, regulations, or important guidelines. Return exactly ONE clause per line, with no numbering or prefixes."
        },
        {
          role: "user",
          content: `Extract the key clauses, rules, and requirements from this text:\n\n${sampleText}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    const extractedClauses = extractionResponse.choices[0].message.content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 15);
    
    console.log(`Extracted ${extractedClauses.length} clauses`);
    console.log('Sample clauses:');
    extractedClauses.slice(0, 5).forEach((clause, i) => {
      console.log(`[${i+1}] ${clause}`);
    });
    
    // Step 2: Classify clauses
    console.log('\nStep 2: Classifying clauses...');
    const classifiedClauses = [];
    
    for (let i = 0; i < extractedClauses.length; i++) {
      const clause = extractedClauses[i];
      console.log(`Classifying clause ${i+1}/${extractedClauses.length}...`);
      
      const classificationResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a document classifier that analyzes legal and business text to identify and rank the most important clauses. Classify each clause as 'Critical', 'Important', or 'Standard' based on its impact on safety, legal compliance, and operational importance."
          },
          {
            role: "user",
            content: `Classify this clause: '${clause}'\nReply with ONLY ONE WORD: Critical, Important, or Standard.`
          }
        ],
        temperature: 0.1,
        max_tokens: 10,
      });
      
      const classification = classificationResponse.choices[0].message.content.trim();
      
      classifiedClauses.push({
        input: clause,
        classification: classification.includes("Critical") ? "Critical" : 
                        classification.includes("Important") ? "Important" : "Standard"
      });
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('Classification complete');
    console.log('Classification results:');
    console.log(`Critical: ${classifiedClauses.filter(c => c.classification === "Critical").length}`);
    console.log(`Important: ${classifiedClauses.filter(c => c.classification === "Important").length}`);
    console.log(`Standard: ${classifiedClauses.filter(c => c.classification === "Standard").length}`);
    
    // Step 3: Generate variants
    console.log('\nStep 3: Generating variants...');
    const results = [];
    
    // Process up to 10 clauses to keep the demo reasonable
    const processLimit = Math.min(classifiedClauses.length, 10);
    
    for (let i = 0; i < processLimit; i++) {
      const clause = classifiedClauses[i];
      console.log(`Generating variant for clause ${i+1}/${processLimit}...`);
      
      const variantResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a clause rewriter that duplicates organizational language and formatting with high fidelity. Create an alternative version that maintains the same meaning but uses different wording."
          },
          {
            role: "user",
            content: clause.input
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });
      
      const variant = variantResponse.choices[0].message.content.trim();
      
      results.push({
        input: clause.input,
        classification: clause.classification,
        output: variant
      });
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Save results in JSONL format
    const jsonlOutput = results.map(result => JSON.stringify(result)).join('\n');
    fs.writeFileSync(outputPath, jsonlOutput);
    
    console.log(`\nProcessing complete. Generated ${results.length} variants and saved to ${outputPath}`);
    
    // Display sample of results
    console.log('\nSample results:');
    console.log('------------------------');
    for (let i = 0; i < Math.min(3, results.length); i++) {
      const result = results[i];
      console.log(`[${i+1}] Original (${result.classification}):`);
      console.log(`    ${result.input}`);
      console.log(`    Variant:`);
      console.log(`    ${result.output}`);
      console.log('');
    }
    console.log('------------------------');
    
  } catch (error) {
    console.error('Error processing sample:', error);
  }
}

// Run the main function
main().catch(console.error); 