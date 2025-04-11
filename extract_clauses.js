// Extract clauses directly using OpenAI API
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Paths for files
const textPath = path.join(__dirname, 'extracted_text.txt');
const outputPath = path.join(__dirname, 'clauses.jsonl');

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Function to chunk text
function createTextChunks(text, maxLength = 1000, overlap = 100) {
  const chunks = [];
  let startIndex = 0;
  
  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxLength, text.length);
    
    // If we're not at the end of the text and not at a sentence boundary,
    // try to find a sentence boundary to break at
    if (endIndex < text.length) {
      const possibleBoundaries = ['. ', '! ', '? ', '\n\n'];
      let bestBoundary = endIndex;
      
      for (const boundary of possibleBoundaries) {
        const boundaryIndex = text.lastIndexOf(boundary, endIndex);
        if (boundaryIndex > startIndex && boundaryIndex + boundary.length < endIndex) {
          bestBoundary = boundaryIndex + boundary.length;
          break;
        }
      }
      
      endIndex = bestBoundary;
    }
    
    // Extract the chunk
    chunks.push(text.substring(startIndex, endIndex));
    
    // Move to next chunk with overlap
    startIndex = Math.max(startIndex, endIndex - overlap);
  }
  
  return chunks;
}

// Extract clauses from text
async function extractClauses(text) {
  console.log(`Extracting clauses from text (${text.length} characters)...`);
  
  // Create chunks
  const chunks = createTextChunks(text);
  console.log(`Created ${chunks.length} chunks`);
  
  // Extract clauses from each chunk
  const allClauses = [];
  let processedChunks = 0;
  
  for (const chunk of chunks) {
    try {
      console.log(`Processing chunk ${++processedChunks}/${chunks.length} (${chunk.length} characters)`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview", // Using a standard model instead of fine-tuned one for reliability
        messages: [
          {
            role: "system",
            content: "You are a document analysis assistant that identifies and extracts important clauses, rules, and requirements from documents. Extract any complete clauses or statements that define safety requirements, regulations, or important guidelines. Return exactly ONE clause per line, with no numbering or prefixes."
          },
          {
            role: "user",
            content: `Extract the key clauses, rules, and requirements from this text:\n\n${chunk}`
          }
        ],
        temperature: 0.3, // Low temperature for more consistent results
        max_tokens: 1000,
      });
      
      if (response.choices && response.choices.length > 0) {
        const extractedText = response.choices[0].message.content;
        
        // Split into individual clauses (assuming one per line)
        const clauses = extractedText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 20); // Filter out short lines
        
        console.log(`Extracted ${clauses.length} clauses from chunk ${processedChunks}`);
        allClauses.push(...clauses);
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error processing chunk ${processedChunks}:`, error);
    }
  }
  
  // Remove duplicates
  const uniqueClauses = [...new Set(allClauses)];
  console.log(`Found ${uniqueClauses.length} unique clauses (from ${allClauses.length} total clauses)`);
  
  return uniqueClauses;
}

// Main function
async function main() {
  try {
    console.log('Starting clause extraction...');
    
    // Read the extracted text
    if (!fs.existsSync(textPath)) {
      throw new Error(`Extracted text file not found: ${textPath}`);
    }
    
    const extractedText = fs.readFileSync(textPath, 'utf8');
    console.log(`Read ${extractedText.length} characters from ${textPath}`);
    
    // Extract clauses
    const clauses = await extractClauses(extractedText);
    
    // Save results in JSONL format
    const jsonlOutput = clauses.map(clause => {
      return JSON.stringify({
        input: clause,
        classification: "Auto", // Placeholder classification
        source: "NFPA 70E"      // Document source
      });
    }).join('\n');
    
    fs.writeFileSync(outputPath, jsonlOutput);
    console.log(`\nExtracted ${clauses.length} clauses and saved to ${outputPath}`);
    
    // Display sample of extracted clauses
    console.log('\nSample clauses:');
    console.log('------------------------');
    for (let i = 0; i < Math.min(5, clauses.length); i++) {
      console.log(`[${i+1}] ${clauses[i]}`);
    }
    console.log('------------------------');
    
  } catch (error) {
    console.error('Error extracting clauses:', error);
  }
}

// Run the main function
main().catch(console.error); 