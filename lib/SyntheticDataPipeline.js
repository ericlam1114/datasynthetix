// lib/SyntheticDataPipeline.js
const ModelApiClient = require("./ModelApiClient");

class SyntheticDataPipeline {
  constructor(options = {}) {
    this.modelClient = new ModelApiClient({
      apiKey: options.apiKey,
    });

    // Model configurations with correct fine-tuned models
    this.models = {
      extractor:
        options.extractorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB", // Correct fine-tuned extractor
      classifier:
        options.classifierModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy", // Correct fine-tuned classifier
      duplicator:
        options.duplicatorModel ||
        "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc", // Correct fine-tuned duplicator
    };

    // Processing options
    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 100;
    this.classFilter = options.classFilter || "all";
    this.outputFormat = options.outputFormat || "jsonl";

    // Callbacks
    this.onProgress = options.onProgress || (() => {});
  }

  // Main entry point for the pipeline
  async process(text) {
    console.log(
      "Starting synthetic data pipeline for text length:",
      text.length
    );
    console.log("First 100 characters:", text.substring(0, 100));
    try {
      // Track stats for progress reporting
      const stats = {
        totalChunks: 0,
        extractedClauses: 0,
        classifiedClauses: 0,
        generatedVariants: 0,
      };

      console.log(`Starting pipeline with text length: ${text.length}`);
      // Step 1: Create text chunks
      const chunks = this._createTextChunks(text);
      console.log(`Created ${chunks.length} chunks`);
      stats.totalChunks = chunks.length;
      this.onProgress("chunking", stats);

      // Step 2: Extract clauses using Model 1
      const extractedClauses = await this._extractClauses(chunks);
      console.log(`Extracted ${extractedClauses.length} clauses`);
      stats.extractedClauses = extractedClauses.length;
      this.onProgress("extraction", stats);
      if (extractedClauses.length === 0 && chunks.length > 0) {
        console.log(`First chunk sample: ${chunks[0].substring(0, 200)}`);
      }

      // Step 3: Classify clauses using Model 2
      const classifiedClauses = await this._classifyClauses(extractedClauses);
      stats.classifiedClauses = classifiedClauses.length;
      this.onProgress("classification", stats);

      // Step 4: Filter clauses based on classification
      const filteredClauses =
        this._filterClausesByClassification(classifiedClauses);

      // Step 5: Generate synthetic variants using Model 3
      const generatedVariants = await this._generateVariants(filteredClauses);
      stats.generatedVariants = generatedVariants.length;
      this.onProgress("generation", stats);

      // Step 6: Format output
      const formattedOutput = this._formatOutput(generatedVariants);

      return {
        stats,
        output: formattedOutput,
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      throw error;
    }
  }

  // Create text chunks with natural language boundaries
  _createTextChunks(text) {
    const {
      minLength = 50, // Minimum chunk size in characters
      maxLength = this.chunkSize, // Maximum chunk size in characters
      overlap = this.chunkOverlap, // Overlap between chunks
    } = {};

    // Use natural language boundaries for chunking
    const sentenceBreaks = [".", "!", "?", "\n\n"];
    const clauseBreaks = [";", ":", "\n", ". "];

    let chunks = [];
    let currentChunk = "";
    let lastBreakPos = 0;

    // Process text character by character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentChunk += char;

      // Check if we've hit a natural break point
      const isSentenceBreak =
        sentenceBreaks.includes(char) &&
        i + 1 < text.length &&
        text[i + 1] === " ";
      const isClauseBreak = clauseBreaks.includes(char);
      const isBreakPoint =
        isSentenceBreak || (isClauseBreak && currentChunk.length > minLength);

      if (isBreakPoint) {
        lastBreakPos = i;
      }

      // Check if we've hit max length and have a break point
      if (currentChunk.length >= maxLength && lastBreakPos > 0) {
        // Cut at the last break point
        const breakPos = lastBreakPos - (currentChunk.length - i - 1);
        const chunk = currentChunk.substring(0, breakPos + 1).trim();

        if (chunk.length >= minLength) {
          chunks.push(chunk);
        }

        // Start a new chunk with overlap
        const overlapStart = Math.max(0, breakPos - overlap);
        currentChunk = currentChunk.substring(overlapStart);
        lastBreakPos = 0;
      }
    }

    // Add the final chunk if it's not empty
    if (currentChunk.trim().length >= minLength) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  // Extract clauses using Model 1
  async _extractClauses(chunks) {
    const allClauses = [];
    
    console.log(`Attempting to extract clauses from ${chunks.length} chunks`);
    
    // Import OpenAI directly in this method
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      for (const chunk of chunks) {
        try {
          console.log(`Processing chunk, length: ${chunk.length} characters`);
          console.log(`Chunk sample: "${chunk.substring(0, 50)}..."`);
          
          // Use the current OpenAI API format
          const response = await openai.chat.completions.create({
            model: this.models.extractor,
            messages: [
              { role: "system", content: "You are a data extractor that identifies and formats exact clauses from documents without rewriting them." },
              { role: "user", content: chunk }
            ]
          });
          
          console.log('Received response from OpenAI API');
          
          if (response && response.choices && response.choices.length > 0) {
            const content = response.choices[0].message.content;
            console.log(`Response content length: ${content.length} characters`);
            console.log(`Response sample: "${content.substring(0, 50)}..."`);
            
            // Parse response (assuming one clause per line)
            const clauses = content
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
            
            console.log(`Extracted ${clauses.length} clauses from chunk`);
            allClauses.push(...clauses);
          } else {
            console.error('No valid response content');
            console.log("Full response:", JSON.stringify(response));
          }
        } catch (error) {
          console.error('Error extracting clauses:', error);
        }
      }
    } catch (error) {
      console.error('Error importing OpenAI or initializing client:', error);
    }
    
    // Deduplicate clauses
    const uniqueClauses = [...new Set(allClauses)];
    console.log(`Total clauses extracted: ${allClauses.length}, Unique clauses: ${uniqueClauses.length}`);
    
    return uniqueClauses;
  }

  // Classify clauses using Model 2
  async _classifyClauses(clauses) {
    const classifiedClauses = [];

    console.log(`Attempting to classify ${clauses.length} clauses`);
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      for (const clause of clauses) {
        try {
          console.log(`Classifying clause: "${clause.substring(0, 50)}..."`);
          
          const response = await openai.chat.completions.create({
            model: this.models.classifier,
            messages: [
              {
                role: "system",
                content:
                  "You are a document importance classifier that analyzes legal and business text to identify and rank the most important clauses. You evaluate clauses based on legal significance, financial impact, risk exposure, and operational relevance. You classify each clause as 'Critical', 'Important', or 'Standard' and explain your reasoning.",
              },
              {
                role: "user",
                content: `Please classify the importance of this clause: '${clause}'`,
              },
            ]
          });
          
          console.log('Received classification response from OpenAI API');
          
          if (response && response.choices && response.choices.length > 0) {
            // Parse classification from response
            const classificationText = response.choices[0].message.content;
            
            // Extract classification label (simple approach)
            let classification = "Standard"; // Default
            
            if (classificationText.includes("Critical")) {
              classification = "Critical";
            } else if (classificationText.includes("Important")) {
              classification = "Important";
            }
            
            classifiedClauses.push({
              input: clause,
              classification,
            });
            
            console.log(`Classified as: ${classification}`);
          } else {
            console.error('No valid classification response content');
          }
        } catch (error) {
          console.error("Error classifying clause:", error);
        }
      }
    } catch (error) {
      console.error('Error importing OpenAI or initializing client:', error);
    }

    console.log(`Total clauses classified: ${classifiedClauses.length}`);
    return classifiedClauses;
  }

  // Filter clauses based on classification
  _filterClausesByClassification(classifiedClauses) {
    if (this.classFilter === "all") {
      return classifiedClauses;
    }

    const allowedClassifications = this.classFilter.split("_");

    return classifiedClauses.filter((clause) =>
      allowedClassifications.includes(clause.classification.toLowerCase())
    );
  }

  // Generate synthetic variants using Model 3
  async _generateVariants(classifiedClauses) {
    const variants = [];

    console.log(`Attempting to generate variants for ${classifiedClauses.length} classified clauses`);
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      for (const classifiedClause of classifiedClauses) {
        try {
          console.log(`Generating variant for: "${classifiedClause.input.substring(0, 50)}..."`);
          
          const response = await openai.chat.completions.create({
            model: this.models.duplicator,
            messages: [
              {
                role: "system",
                content:
                  "You are a clause rewriter that duplicates organizational language and formatting with high fidelity.",
              },
              { role: "user", content: classifiedClause.input },
            ]
          });
          
          console.log('Received variant generation response from OpenAI API');
          
          if (response && response.choices && response.choices.length > 0) {
            variants.push({
              input: classifiedClause.input,
              classification: classifiedClause.classification,
              output: response.choices[0].message.content.trim(),
            });
            
            console.log(`Generated variant successfully`);
          } else {
            console.error('No valid variant generation response content');
          }
        } catch (error) {
          console.error("Error generating variant:", error);
        }
      }
    } catch (error) {
      console.error('Error importing OpenAI or initializing client:', error);
    }

    console.log(`Total variants generated: ${variants.length}`);
    return variants;
  }

  // Format output according to specified format
  _formatOutput(variants) {
    switch (this.outputFormat) {
      case "jsonl":
        return variants.map((v) => JSON.stringify(v)).join("\n");
      case "mistral":
        return variants
          .map(
            (v) =>
              `<s>[INST] Write a clause similar to this: ${v.input} [/INST] ${v.output} </s>`
          )
          .join("\n");
      case "claude":
        return variants
          .map((v) => `Human: ${v.input}\n\nAssistant: ${v.output}`)
          .join("\n");
      case "openai":
        return variants
          .map((v) =>
            JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: "You are an expert in this domain.",
                },
                { role: "user", content: v.input },
                { role: "assistant", content: v.output },
              ],
            })
          )
          .join("\n");
      case "falcon":
        return variants
          .map(
            (v) =>
              `Human: Rewrite this clause: ${v.input}\n\nAssistant: ${v.output}`
          )
          .join("\n");
      case "csv":
        return (
          "input,classification,output\n" +
          variants
            .map(
              (v) =>
                `"${v.input.replace(/"/g, '""')}","${
                  v.classification
                }","${v.output.replace(/"/g, '""')}"`
            )
            .join("\n")
        );
      default:
        return JSON.stringify(variants, null, 2);
    }
  }
}

module.exports = SyntheticDataPipeline;
