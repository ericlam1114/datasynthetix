// src/lib/SyntheticDataPipeline.js
// Use dynamic import for ESM compatibility in Next.js
import { getOpenAI } from './openai';

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
      ...options
    };
    
    console.log('SyntheticDataPipeline initialized with options:', this.options);
  }
  
  // Main method for processing a document - simpler implementation for compatibility
  async processDocument(text, options = {}) {
    console.log(`processDocument called with ${text.length} characters of text`);
    
    // Combine constructor options with method options
    const mergedOptions = {
      ...this.options,
      ...options
    };
    
    console.log('Processing document with options:', mergedOptions);
    
    try {
      // Check if simulation mode is enabled
      const isSimulation = process.env.NEXT_PUBLIC_USE_SIMULATION === 'true';
      
      if (isSimulation) {
        console.log('Simulation mode enabled, returning synthetic data');
        return this._simulateProcessing(text, mergedOptions);
      }
      
      // Initialize OpenAI if needed
      const openai = getOpenAI();
      if (!openai) {
        throw new Error('Unable to initialize OpenAI client');
      }
      
      // Extract simple clauses (sentences) from text
      const clauses = this._extractSimpleClauses(text);
      console.log(`Extracted ${clauses.length} clauses from text`);
      
      // Process clauses using OpenAI (simplified for this implementation)
      const processedClauses = await this._processClauses(clauses, openai, mergedOptions);
      console.log(`Processed ${processedClauses.length} clauses`);
      
      // Format output
      const formattedOutput = this._formatOutput(processedClauses, mergedOptions.outputFormat);
      
      // Return formatted data and stats
      return {
        data: formattedOutput,
        stats: {
          totalClauses: clauses.length,
          processedClauses: processedClauses.length,
          processedTokens: this._estimateTokens(text),
          format: mergedOptions.outputFormat
        }
      };
    } catch (error) {
      console.error('Error in SyntheticDataPipeline.processDocument:', error);
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
      // Attempt to use OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Rewrite the following sentence with similar meaning but different wording:' },
          { role: 'user', content: clause }
        ],
        max_tokens: 150
      });
      
      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content.trim();
      }
      
      throw new Error('No variant generated from API');
    } catch (error) {
      console.error('Error generating variant:', error);
      // Fallback to simple variant
      return clause.replace(/\b(the|a|an)\b/g, 'this')
        .replace(/\b(is|are)\b/g, 'will be');
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
}

// Dual export for both CommonJS and ESM
export { SyntheticDataPipeline };
export default SyntheticDataPipeline; 