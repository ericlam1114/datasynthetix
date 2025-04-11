/**
 * Pipeline service for managing the Synthetic Data Pipeline
 * Centralizes pipeline creation, configuration, and execution
 */

import { SyntheticDataPipeline } from '../../../../lib/SyntheticDataPipeline';
import { createTextChunks } from './textExtraction';
import { getOpenAI } from '../../../../lib/openai';

/**
 * Initializes a synthetic data pipeline with the provided configuration
 * 
 * @param {Object} options - Pipeline configuration options
 * @returns {Object} The configured pipeline instance
 */
export function createPipeline(options = {}) {
  try {
    // Ensure we have required configuration
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for pipeline operation');
    }
    
    // Merge default options with provided options
    const pipelineOptions = {
      apiKey: process.env.OPENAI_API_KEY,
      extractorModel: options.extractorModel || process.env.EXTRACTOR_MODEL || 'ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB',
      classifierModel: options.classifierModel || process.env.CLASSIFIER_MODEL || 'ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:abcdefgh',
      duplicatorModel: options.duplicatorModel || process.env.DUPLICATOR_MODEL || 'ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc',
      chunkSize: parseInt(options.chunkSize || 1000, 10),
      overlap: parseInt(options.overlap || 100, 10),
      outputFormat: options.outputFormat || 'jsonl',
      classFilter: options.classFilter || 'all',
      prioritizeImportant: options.prioritizeImportant === undefined ? true : options.prioritizeImportant,
      generateVariants: options.generateVariants === undefined ? true : options.generateVariants,
      numVariants: parseInt(options.numVariants || 3, 10),
      ...options
    };
    
    // Create the pipeline instance
    const pipeline = new SyntheticDataPipeline(pipelineOptions);
    
    // Add options reference to pipeline for later reference
    pipeline._options = pipelineOptions;
    
    return pipeline;
  } catch (error) {
    console.error('Error creating pipeline:', error);
    throw error;
  }
}

/**
 * Function with timeout safety for promises
 * 
 * @param {Promise} promise - The promise to execute with timeout
 * @param {Number} timeoutMs - Timeout in milliseconds
 * @param {String} operation - Name of the operation for error message
 * @returns {Promise} The promise result or timeout error
 */
export function withTimeout(promise, timeoutMs, operation = 'operation') {
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

/**
 * Processes a document through the pipeline with timeout and error handling
 * 
 * @param {String} text - The document text to process
 * @param {Object} options - Processing options
 * @returns {Object} Processing results
 */
export async function processDocument(text, options = {}) {
  try {
    console.log('Starting document processing with pipeline');
    console.time('documentProcessing');
    
    // Create pipeline with options
    const pipeline = createPipeline(options);
    
    // Apply a timeout to the overall process
    const result = await withTimeout(
      pipeline.processDocument(text, options),
      options.timeout || 15 * 60 * 1000, // Default: 15 minute timeout
      'Document processing'
    );
    
    console.log('Document processing complete');
    console.timeEnd('documentProcessing');
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Error processing document with pipeline:', error);
    
    // In development mode, provide a simulated result
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Returning simulated processing result');
      return createSimulatedResult(text, options);
    }
    
    throw error;
  }
}

/**
 * Creates a simulated result for development and testing
 * 
 * @param {String} text - The input text
 * @param {Object} options - Processing options
 * @returns {Object} Simulated processing results
 */
function createSimulatedResult(text, options = {}) {
  // Create chunks to simulate the processing
  const chunks = createTextChunks(text, {
    maxChunkSize: options.chunkSize || 1000,
    overlapSize: options.overlap || 100
  });
  
  // Create simulated clauses
  const numClauses = Math.min(20, Math.ceil(text.length / 200));
  const clauses = Array.from({ length: numClauses }, (_, i) => {
    const start = Math.floor(Math.random() * Math.max(0, text.length - 100));
    const end = Math.min(text.length, start + 100 + Math.floor(Math.random() * 200));
    const clauseText = text.substring(start, end);
    
    // Classify randomly
    const classifications = ['Critical', 'Important', 'Standard'];
    const classification = classifications[Math.floor(Math.random() * classifications.length)];
    
    // Generate simulated variants
    const numVariants = options.numVariants || 3;
    const variants = Array.from({ length: numVariants }, (_, j) => {
      return `Simulated variant ${j+1} for clause: ${clauseText.substring(0, 50)}...`;
    });
    
    return {
      id: `clause-${i}`,
      text: clauseText,
      classification,
      variants
    };
  });
  
  return {
    success: true,
    clauses,
    stats: {
      totalChunks: chunks.length,
      processedChunks: chunks.length,
      failedChunks: 0,
      totalClauses: numClauses,
      processedClauses: numClauses,
      generatedVariants: numClauses * (options.numVariants || 3),
      processingTimeMs: 1500
    }
  };
}

/**
 * Evaluates input text complexity to estimate processing requirements
 * 
 * @param {String} text - The input text
 * @returns {Object} Complexity metrics and processing estimates
 */
export function evaluateTextComplexity(text) {
  try {
    // Simple metrics for complexity evaluation
    const textLength = text.length;
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    const averageWordLength = textLength / Math.max(1, wordCount);
    const averageSentenceLength = wordCount / Math.max(1, sentenceCount);
    
    // Estimate complexity on a scale of 1-10
    let complexity = 1;
    complexity += Math.min(4, textLength / 10000); // Length factor
    complexity += Math.min(2, averageSentenceLength / 25); // Sentence complexity
    complexity += Math.min(2, averageWordLength / 6); // Word complexity
    
    // Round to one decimal place
    complexity = Math.round(complexity * 10) / 10;
    
    // Estimate processing requirements
    const estimatedTimeSeconds = Math.max(10, Math.ceil(textLength / 300));
    const estimatedCredits = Math.max(1, Math.ceil(textLength / 1000));
    
    return {
      textLength,
      wordCount,
      sentenceCount,
      averageWordLength,
      averageSentenceLength,
      complexity,
      estimatedTimeSeconds,
      estimatedCredits,
      estimatedChunks: Math.ceil(textLength / 1000)
    };
  } catch (error) {
    console.error('Error evaluating text complexity:', error);
    return {
      complexity: 5,
      estimatedTimeSeconds: 60,
      estimatedCredits: 10,
      estimatedChunks: 5,
      error: error.message
    };
  }
} 