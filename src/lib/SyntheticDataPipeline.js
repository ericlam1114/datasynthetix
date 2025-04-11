// src/lib/SyntheticDataPipeline.js
// Use dynamic import for ESM compatibility in Next.js
const { getOpenAI } = require('./openai');

// Utility function to create a promise that times out
function withTimeout(promise, timeoutMs, operation = 'operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: ${operation} took longer than ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// SyntheticDataPipeline class for server usage
class SyntheticDataPipeline {
  constructor(options = {}) {
    // Store configuration options
    this.options = {
      outputFormat: options.outputFormat || 'jsonl',
      maxClausesToProcess: options.maxClausesToProcess || 0,
      maxVariantsPerClause: options.maxVariantsPerClause || 3,
      includeOriginal: options.includeOriginal || false,
      filterClassifications: options.filterClassifications || [],
      minLength: options.minLength || 50,
      // Add timeout configurations
      timeouts: {
        documentProcessing: options.timeouts?.documentProcessing || 600000, // 10 minutes
        chunkProcessing: options.timeouts?.chunkProcessing || 120000,      // 2 minutes
        clauseExtraction: options.timeouts?.clauseExtraction || 30000,     // 30 seconds
        clauseClassification: options.timeouts?.clauseClassification || 15000, // 15 seconds
        variantGeneration: options.timeouts?.variantGeneration || 20000,   // 20 seconds per variant
      },
      ...options
    };
    
    console.log('SyntheticDataPipeline initialized with options:', this.options);
  }
  
  // Main method for processing a document - simpler implementation for compatibility
  async processDocument(text, options = {}) {
    console.log("SyntheticDataPipeline.processDocument starting");
    const startTime = Date.now();
    
    const opts = { ...this.options, ...options };
    console.log(`Pipeline options: ${JSON.stringify(opts, null, 2)}`);
    
    try {
        // Apply timeout to the overall process
        return await withTimeout(this._processDocumentWithoutTimeout(text, opts), 
                               600000, // 10 minute timeout for the entire process
                               'document processing');
    } catch (error) {
        console.error("Pipeline processing error:", error);
        // If we have partial results, return those instead of failing completely
        if (this._partialResults && this._partialResults.length > 0) {
            console.log(`Returning ${this._partialResults.length} partial results due to timeout`);
            return {
                success: false,
                error: error.message,
                partialResults: true,
                clauses: this._partialResults,
                stats: {
                    totalChunks: this._chunksProcessed || 0,
                    processedChunks: this._chunksProcessed || 0,
                    failedChunks: this._chunksFailed || 0,
                    processingTimeMs: Date.now() - startTime
                }
            };
        }
        throw error;
    }
  }
  
  // Private method to extract simple clauses from text
  _extractSimpleClauses(text) {
    // Simple approach: split by sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 10); // Filter out very short sentences
  }
  
  // Private method to process clauses
  async _processClauses(clauses, openai, options) {
    const processed = [];
    const maxToProcess = options.maxClausesToProcess > 0 
      ? Math.min(clauses.length, options.maxClausesToProcess)
      : clauses.length;
    
    for (let i = 0; i < maxToProcess; i++) {
      try {
        const result = {
          input: clauses[i],
          classification: this._classifyClause(clauses[i]),
          output: await this._generateVariant(clauses[i], openai)
        };
        processed.push(result);
      } catch (error) {
        console.error(`Error processing clause ${i}:`, error);
      }
    }
    
    return processed;
  }
  
  // Private method to classify a clause (simplified version)
  _classifyClause(clause) {
    // Simple classification based on keywords/length
    if (clause.toLowerCase().includes('must') || 
        clause.toLowerCase().includes('shall') || 
        clause.toLowerCase().includes('required')) {
      return 'Critical';
    } else if (clause.toLowerCase().includes('should') || 
               clause.toLowerCase().includes('recommend') || 
               clause.length > 100) {
      return 'Important';
    } else {
      return 'Standard';
    }
  }
  
  // Private method to generate a variant of a clause
  async _generateVariant(clause, openai) {
    try {
      // Attempt to use OpenAI with a timeout of 30 seconds
      const responsePromise = openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Rewrite the following sentence with similar meaning but different wording:' },
          { role: 'user', content: clause }
        ],
        max_tokens: 150
      });
      
      // Add timeout to prevent API call from hanging
      const response = await withTimeout(
        responsePromise,
        30000,
        'OpenAI API request timed out after 30 seconds'
      );
      
      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content.trim();
      }
      
      throw new Error('No variant generated from API');
    } catch (error) {
      console.error('Error generating variant:', error.message);
      
      // Provide better fallback mechanism
      // Basic text alternation for a fallback
      const simpleFallback = clause
        .replace(/\b(the|a|an)\b/g, 'this')
        .replace(/\b(is|are)\b/g, 'will be')
        .replace(/\b(should|must|may)\b/g, 'needs to');
      
      // Only use simple fallback if it's actually different
      if (simpleFallback !== clause) {
        return simpleFallback;
      }
      
      // Last resort fallback
      return `Alternative version: ${clause}`;
    }
  }
  
  // Private method to format output
  _formatOutput(processedClauses, format) {
    switch (format.toLowerCase()) {
      case 'jsonl':
        return processedClauses.map(c => JSON.stringify(c)).join('\n');
      case 'csv':
        return `input,classification,output\n` + 
          processedClauses.map(c => 
            `"${c.input.replace(/"/g, '""')}","${c.classification}","${c.output.replace(/"/g, '""')}"`
          ).join('\n');
      default:
        return JSON.stringify(processedClauses, null, 2);
    }
  }
  
  // Private method to simulate processing (for testing)
  _simulateProcessing(text, options) {
    console.log('Simulating document processing...');
    
    // Create some simulated clauses
    const simulatedClauses = [
      {
        input: text.substring(0, 100).trim() + '...',
        classification: 'Critical',
        output: 'This is a simulated rewrite of the first section of text.'
      },
      {
        input: text.substring(100, 200).trim() + '...',
        classification: 'Important',
        output: 'Here is another simulated rewrite with different wording.'
      },
      {
        input: text.substring(200, 300).trim() + '...',
        classification: 'Standard',
        output: 'A third section is rewritten in this simulated output.'
      }
    ];
    
    // Format output
    const formattedOutput = this._formatOutput(simulatedClauses, options.outputFormat);
    
    // Return simulated data
    return {
      data: formattedOutput,
      stats: {
        totalClauses: 3,
        processedClauses: 3,
        processedTokens: this._estimateTokens(text),
        format: options.outputFormat,
        simulation: true
      }
    };
  }
  
  // Private method to estimate tokens (rough approximation)
  _estimateTokens(text) {
    return Math.ceil(text.length / 4); // Rough estimate: ~4 chars per token
  }

  // Add a new method to contain the existing process logic
  async _processDocumentWithoutTimeout(text, opts) {
    const startTime = Date.now();
    this._chunksProcessed = 0;
    this._chunksFailed = 0;
    this._partialResults = [];
    
    // Store the progress callback if provided in options
    this._progressCallback = opts.progressCallback || null;
    this._jobId = opts.jobId || null;
    
    console.log(`Processing document with length: ${text.length} characters`);
    
    // Report initial progress
    this._reportProgress({
        stage: 'initializing',
        totalChunks: 0,
        currentChunk: 0,
        processedClauses: 0
    });
    
    // Chunk the text
    const chunks = this._chunkText(text, opts.chunkSize || 1000, opts.overlap || 100);
    console.log(`Document chunked into ${chunks.length} segments`);
    
    // Report chunking progress
    this._reportProgress({
        stage: 'chunking',
        totalChunks: chunks.length,
        currentChunk: 0,
        processedClauses: 0
    });
    
    // Set up OpenAI
    const openai = getOpenAI(opts.apiKey || this.options.apiKey);
    if (!openai) {
      throw new Error('Failed to initialize OpenAI API client');
    }
    
    // Process each chunk with timeout
    let allClauses = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        // Report progress for this chunk
        this._reportProgress({
          stage: 'processing',
          totalChunks: chunks.length,
          currentChunk: i,
          processedClauses: allClauses.length
        });
        
        // Process the chunk with a timeout
        const chunkClauses = await withTimeout(
          this._processChunk(chunks[i], i, openai, opts),
          this.options.timeouts.chunkProcessing,
          `processing chunk ${i+1}/${chunks.length}`
        );
        
        if (chunkClauses && chunkClauses.length > 0) {
          allClauses = [...allClauses, ...chunkClauses];
          this._partialResults = [...this._partialResults, ...chunkClauses];
        }
        
        this._chunksProcessed++;
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
        this._chunksFailed++;
        
        // Report error in progress
        this._reportProgress({
          stage: 'error',
          totalChunks: chunks.length,
          currentChunk: i,
          processedClauses: allClauses.length,
          error: error.message
        });
      }
    }
    
    console.log(`Processed ${allClauses.length} clauses from ${this._chunksProcessed} chunks (${this._chunksFailed} failed)`);
    
    // Report final processing stats
    this._reportProgress({
      stage: 'completed',
      totalChunks: chunks.length,
      processedChunks: this._chunksProcessed,
      failedChunks: this._chunksFailed,
      processedClauses: allClauses.length
    });
    
    // Format the results
    const formattedOutput = this._formatOutput(allClauses, opts.outputFormat || this.options.outputFormat);
    
    return {
      success: true,
      data: formattedOutput,
      clauses: allClauses,
      stats: {
        totalChunks: chunks.length,
        processedChunks: this._chunksProcessed,
        failedChunks: this._chunksFailed,
        processedClauses: allClauses.length,
        processingTimeMs: Date.now() - startTime
      }
    };
  }

  // Add a new method for chunk processing with timeouts
  async _processChunk(chunk, chunkIndex, openai, opts) {
    console.log(`Processing chunk ${chunkIndex}, length: ${chunk.length} characters`);
    
    try {
      // Extract clauses with timeout
      const clauses = await withTimeout(
        this._extractClauses(chunk, chunkIndex, opts.extractorModel),
        this.options.timeouts.clauseExtraction,
        `extracting clauses from chunk ${chunkIndex+1}`
      );
      
      if (!clauses || clauses.length === 0) {
        console.log(`No clauses extracted from chunk ${chunkIndex}`);
        return [];
      }
      
      console.log(`Extracted ${clauses.length} clauses from chunk ${chunkIndex}`);
      
      // Classify clauses with timeout
      const classifiedClauses = await withTimeout(
        this._classifyClauses(clauses, opts.classifierModel),
        this.options.timeouts.clauseClassification,
        `classifying clauses from chunk ${chunkIndex+1}`
      );
      
      // Filter clauses by classification if needed
      let finalClauses = classifiedClauses;
      if (opts.classFilter && opts.classFilter !== 'all') {
        const classFilters = opts.classFilter.split(',').map(c => c.trim());
        finalClauses = classifiedClauses.filter(c => 
          classFilters.includes(c.classification.toLowerCase())
        );
        console.log(`Filtered from ${classifiedClauses.length} to ${finalClauses.length} clauses by classification`);
      }
      
      // Process each clause to generate variants
      const processedClauses = [];
      for (const clause of finalClauses) {
        try {
          // Generate variants with a timeout
          const variants = await withTimeout(
            this._generateVariants(
              clause.text, 
              Math.min(opts.maxVariantsPerClause || 3, 5),
              opts.duplicatorModel
            ),
            this.options.timeouts.variantGeneration,
            `generating variants for clause`
          );
          
          processedClauses.push({
            ...clause,
            variants: variants
          });
        } catch (error) {
          console.error(`Error generating variants for clause: ${error.message}`);
          // Add the clause with a fallback variant
          processedClauses.push({
            ...clause,
            variants: [`[Error generating variants: ${error.message}]`],
            error: error.message
          });
        }
      }
      
      return processedClauses;
    } catch (error) {
      console.error(`Error in chunk ${chunkIndex} processing:`, error);
      throw error; // Let the parent function handle this
    }
  }

  // Update the _extractClauses method to handle timeouts better
  async _extractClauses(text, chunkIndex, extractorModel) {
    console.log(`Extracting clauses from chunk ${chunkIndex}, length: ${text.length}`);
    
    if (!text || text.trim().length === 0) {
      console.log(`Empty text in chunk ${chunkIndex}, skipping extraction`);
      return [];
    }
    
    try {
      const openai = getOpenAI(this.options.apiKey);
      
      // Use a timeout for the API call
      const response = await withTimeout(
        openai.chat.completions.create({
          model: extractorModel || 'gpt-3.5-turbo',
          messages: [
            { 
              role: 'system', 
              content: 'Extract distinct, meaningful clauses from the following text. Return ONLY a JSON array of objects with "text" property for each clause. Do not include any other text in your response.' 
            },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        this.options.timeouts.clauseExtraction,
        'extracting clauses with OpenAI'
      );
      
      try {
        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content);
        
        if (Array.isArray(parsed.clauses)) {
          return parsed.clauses;
        } else {
          console.warn(`Unexpected format from extractor model:`, parsed);
          
          // Attempt to intelligently find an array in the response
          for (const key in parsed) {
            if (Array.isArray(parsed[key])) {
              console.log(`Found array in response under key ${key}, using it instead`);
              return parsed[key];
            }
          }
          
          return [];
        }
      } catch (parseError) {
        console.error('Error parsing extractor response:', parseError);
        return [];
      }
    } catch (error) {
      console.error(`Error in _extractClauses:`, error);
      return []; // Return empty array to allow processing to continue
    }
  }

  // Enhance the variant generation with better error handling and timeouts
  async _generateVariants(clause, numVariants = 3, duplicatorModel) {
    if (!clause || typeof clause !== 'string' || clause.trim().length === 0) {
      return ["[No valid clause provided]"];
    }
    
    const maxVariants = Math.min(numVariants, 5); // Cap at 5 variants max
    
    try {
      const openai = getOpenAI(this.options.apiKey);
      
      // Add a timeout for the API call
      const response = await withTimeout(
        openai.chat.completions.create({
          model: duplicatorModel || 'gpt-3.5-turbo',
          messages: [
            { 
              role: 'system', 
              content: `Generate ${maxVariants} different ways to express the same meaning as the provided clause. Be creative with sentence structure and vocabulary, but preserve the exact meaning and legal implications. Return ONLY a JSON array of strings, each containing one rewrite. Do not include any other text in your response.` 
            },
            { role: 'user', content: clause }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        }),
        this.options.timeouts.variantGeneration,
        'generating variants with OpenAI'
      );
      
      try {
        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content);
        
        // Try to handle various potential response formats
        if (Array.isArray(parsed.variants)) {
          return parsed.variants;
        } else if (Array.isArray(parsed.rewrites)) {
          return parsed.rewrites;
        } else if (Array.isArray(parsed.content)) {
          return parsed.content;
        } else if (Array.isArray(parsed)) {
          return parsed;
        }
        
        // Attempt to intelligently find an array in the response
        for (const key in parsed) {
          if (Array.isArray(parsed[key])) {
            return parsed[key];
          }
        }
        
        console.warn('Unexpected variant format, could not extract array:', parsed);
        return [`Alternative: ${clause}`]; // Fallback
      } catch (parseError) {
        console.error('Error parsing variant response:', parseError);
        return [`Parsing error: ${clause}`];
      }
    } catch (error) {
      console.error(`Error generating variants:`, error);
      return [`Generation error: ${clause}`];
    }
  }

  // Add a new helper method to report progress
  _reportProgress(progressData) {
    if (!this._progressCallback) return;
    
    try {
        // Add timestamp
        const progressInfo = {
            ...progressData,
            timestamp: new Date().toISOString(),
            jobId: this._jobId
        };
        
        // Call the progress callback with the data
        this._progressCallback(progressInfo);
    } catch (error) {
        console.error('Error reporting progress:', error);
    }
  }

  // Implement _chunkText method if it doesn't exist
  _chunkText(text, maxLength = 1000, overlap = 100) {
    if (!text) return [];
    
    // Use reasonable defaults
    maxLength = maxLength || 1000;
    overlap = overlap || 100;
    
    // Simple chunking approach
    const chunks = [];
    let startPos = 0;
    
    while (startPos < text.length) {
        // Calculate end position
        let endPos = startPos + maxLength;
        
        // Adjust end position to avoid cutting words
        if (endPos < text.length) {
            // Look for natural break points (periods, new lines, etc.)
            const breakPoints = ['. ', '! ', '? ', '\n\n', '\r\n\r\n'];
            
            // Look for a natural break within the last 20% of the chunk
            const lookbackStart = Math.max(startPos, endPos - Math.floor(maxLength * 0.2));
            
            let foundBreak = false;
            for (const breakPoint of breakPoints) {
                const breakPos = text.indexOf(breakPoint, lookbackStart);
                if (breakPos > 0 && breakPos <= endPos) {
                    endPos = breakPos + breakPoint.length;
                    foundBreak = true;
                    break;
                }
            }
            
            // If no natural break was found, look for a space
            if (!foundBreak) {
                const lastSpace = text.lastIndexOf(' ', endPos);
                if (lastSpace > startPos) {
                    endPos = lastSpace + 1;
                }
            }
        } else {
            endPos = text.length;
        }
        
        // Extract the chunk
        const chunk = text.substring(startPos, endPos).trim();
        if (chunk) {
            chunks.push(chunk);
        }
        
        // Move start position, accounting for overlap
        startPos = endPos - overlap;
        if (startPos <= 0 || startPos >= text.length) break;
    }
    
    return chunks;
  }

  // Add placeholder implementations for internal methods if they aren't defined elsewhere
  // These will be overridden by real implementations if they exist
  async _classifyClauses(clauses, classifierModel) {
    // Placeholder implementation - derived classes should override
    if (!this._classifyClause) {
        return clauses.map(clause => ({
            ...clause,
            classification: 'Standard'
        }));
    }
    
    // Use the defined implementation
    return clauses.map(clause => ({
        ...clause,
        classification: this._classifyClause(clause.text)
    }));
  }
}

// Change the export statement to use CommonJS module.exports
module.exports = { SyntheticDataPipeline }; 