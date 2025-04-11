// src/app/api/process-document/services/pipeline.js
import { SyntheticDataPipeline } from "../../../../lib/SyntheticDataPipeline";
import { createTextChunks } from './textExtraction';
import { MODELS, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP, DEFAULT_OUTPUT_FORMAT, DEFAULT_CLASS_FILTER, DEFAULT_MAX_VARIANTS, DEFAULT_TIMEOUTS } from "../config";

/**
 * Creates a new pipeline instance with the provided options
 * @param {Object} options - Pipeline configuration options
 * @returns {SyntheticDataPipeline} Configured pipeline instance
 */
export function createPipelineInstance(options = {}) {
  try {
    // Ensure required API key is available
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for pipeline operation');
    }
    
    // Configure pipeline with options and defaults
    const pipeline = new SyntheticDataPipeline({
      apiKey: process.env.OPENAI_API_KEY,
      extractorModel: options.extractorModel || process.env.EXTRACTOR_MODEL || MODELS.extractor,
      classifierModel: options.classifierModel || process.env.CLASSIFIER_MODEL || MODELS.classifier,
      duplicatorModel: options.duplicatorModel || process.env.DUPLICATOR_MODEL || MODELS.duplicator,
      chunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
      overlap: options.overlap || DEFAULT_OVERLAP,
      outputFormat: options.outputFormat || DEFAULT_OUTPUT_FORMAT,
      classFilter: options.classFilter || DEFAULT_CLASS_FILTER,
      prioritizeImportant: options.prioritizeImportant === undefined ? true : options.prioritizeImportant === true,
      maxClausesToProcess: options.maxClauses || 0,
      maxVariantsPerClause: options.maxVariants || DEFAULT_MAX_VARIANTS,
      generateVariants: options.generateVariants === undefined ? true : options.generateVariants === true,
      timeouts: {
        documentProcessing: options.documentTimeout || DEFAULT_TIMEOUTS.documentProcessing,
        chunkProcessing: options.chunkTimeout || DEFAULT_TIMEOUTS.chunkProcessing,
        clauseExtraction: options.extractionTimeout || DEFAULT_TIMEOUTS.clauseExtraction,
        clauseClassification: options.classificationTimeout || DEFAULT_TIMEOUTS.classificationTimeout,
        variantGeneration: options.variantTimeout || DEFAULT_TIMEOUTS.variantGeneration,
      },
    });
    
    // Add options reference to pipeline for later reference
    pipeline._options = options;
    
    return pipeline;
  } catch (error) {
    console.error('Error creating pipeline:', error);
    throw error;
  }
}

/**
 * Function with timeout safety for promises
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
 * Creates a progress callback function for the pipeline
 * @param {string} jobId - The processing job ID
 * @param {Object} complexity - Text complexity metrics
 * @param {Function} updateStatusFn - Function to update processing status
 * @returns {Function} Progress callback function
 */
export function createProgressCallback(jobId, complexity, updateStatusFn) {
  return async (progressData) => {
    try {
      if (!progressData) return;
      
      const { currentChunk, totalChunks, processedClauses, totalClauses, stage, variantsGenerated } = progressData;
      
      const chunkProgress = totalChunks ? Math.round((currentChunk / totalChunks) * 100) : 0;
      
      const statusUpdate = {
        status: 'processing',
        processedChunks: currentChunk || 0,
        totalChunks: totalChunks || complexity?.estimatedChunks || 0,
        progress: 20 + Math.floor(chunkProgress * 0.6), // Scale to 20-80% range
        stage: stage || 'processing',
        processingStats: {
          processedClauses: processedClauses || 0,
          totalClauses: totalClauses || 0,
          variantsGenerated: variantsGenerated || 0,
          currentStage: stage || 'processing',
          currentChunk,
          totalChunks,
          lastUpdateTime: new Date().toISOString()
        }
      };
      
      // Add a message based on stage
      if (stage === 'extracting') {
        statusUpdate.message = `Extracting clauses (chunk ${currentChunk}/${totalChunks})`;
      } else if (stage === 'classifying') {
        statusUpdate.message = `Classifying clauses (${processedClauses} found)`;
      } else if (stage === 'generating') {
        statusUpdate.message = `Generating variants (${variantsGenerated} variants created)`;
      } else {
        statusUpdate.message = `Processing document (${currentChunk}/${totalChunks} chunks)`;
      }
      
      await updateStatusFn(jobId, statusUpdate);
    } catch (progressError) {
      console.error('Error in progress callback:', progressError);
    }
  };
}

/**
 * Process a document with the pipeline
 * @param {string} text - The document text to process
 * @param {Object} options - Processing options
 * @param {string} jobId - The processing job ID
 * @param {Object} complexity - Text complexity metrics
 * @param {Function} updateStatusFn - Function to update processing status
 * @returns {Object} Processing results
 */
export async function processWithPipeline(text, options, jobId, complexity, updateStatusFn) {
  try {
    console.log('Starting document processing with pipeline');
    console.time('pipelineExecution');
    
    // Create pipeline instance
    const pipeline = createPipelineInstance(options);
    
    // Create pipeline options with progress callback
    const pipelineOptions = {
      ...options,
      progressCallback: createProgressCallback(jobId, complexity, updateStatusFn),
      jobId
    };
    
    // Log configured timeouts
    console.log("Pipeline timeouts:", {
      documentProcessing: pipelineOptions.documentTimeout || DEFAULT_TIMEOUTS.documentProcessing,
      chunkProcessing: pipelineOptions.chunkTimeout || DEFAULT_TIMEOUTS.chunkProcessing,
      clauseExtraction: pipelineOptions.extractionTimeout || DEFAULT_TIMEOUTS.clauseExtraction,
      clauseClassification: pipelineOptions.classificationTimeout || DEFAULT_TIMEOUTS.classificationTimeout,
      variantGeneration: pipelineOptions.variantTimeout || DEFAULT_TIMEOUTS.variantGeneration,
    });
    
    // Process the document with timeout protection
    const result = await withTimeout(
      pipeline.processDocument(text, pipelineOptions),
      options.timeout || DEFAULT_TIMEOUTS.documentProcessing, // Overall timeout
      'Document processing'
    );
    
    console.log('Document processing complete');
    console.timeEnd('pipelineExecution');
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Error processing document with pipeline:', error);
    
    // In development mode, provide a simulated result if configured
    if (process.env.NODE_ENV === 'development' && process.env.USE_SIMULATED_RESULTS === 'true') {
      console.log('Development mode: Returning simulated processing result');
      return createSimulatedResult(text, options);
    }
    
    throw error;
  }
}

/**
 * Creates a simulated result for development and testing
 * @param {String} text - The input text
 * @param {Object} options - Processing options
 * @returns {Object} Simulated processing results
 */
function createSimulatedResult(text, options = {}) {
  // Create chunks to simulate the processing
  const chunks = createTextChunks(text, {
    maxChunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
    overlapSize: options.overlap || DEFAULT_OVERLAP
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
    const numVariants = options.maxVariants || DEFAULT_MAX_VARIANTS;
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
      generatedVariants: numClauses * (options.maxVariants || DEFAULT_MAX_VARIANTS),
      processingTimeMs: 1500
    }
  };
}

/**
 * Evaluates text complexity to estimate processing requirements
 * @param {string} text - The text to evaluate
 * @returns {Object} Complexity metrics
 */
export function evaluateTextComplexity(text) {
  try {
    if (!text) {
      return { complexity: 'unknown', estimatedChunks: 1 };
    }
    
    // Calculate basic metrics
    const textLength = text.length;
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
    const averageWordLength = textLength / Math.max(1, wordCount);
    const averageSentenceLength = wordCount / Math.max(1, sentenceCount);
    
    // Calculate estimated chunks based on text length and chunk size
    const estimatedChunks = Math.ceil(textLength / DEFAULT_CHUNK_SIZE);
    
    // Estimate complexity on a scale of 1-10
    let complexityScore = 1;
    complexityScore += Math.min(4, textLength / 10000); // Length factor
    complexityScore += Math.min(2, averageSentenceLength / 25); // Sentence complexity
    complexityScore += Math.min(2, averageWordLength / 6); // Word complexity
    
    // Round to one decimal place
    complexityScore = Math.round(complexityScore * 10) / 10;
    
    // Determine complexity level
    let complexity = 'low';
    if (complexityScore > 7 || textLength > 100000 || wordCount > 20000) {
      complexity = 'high';
    } else if (complexityScore > 4 || textLength > 20000 || wordCount > 4000) {
      complexity = 'medium';
    }
    
    // Estimate processing requirements
    const estimatedTimeSeconds = Math.max(10, Math.ceil(textLength / 300));
    const estimatedCredits = Math.max(1, Math.ceil(textLength / 1000));
    
    return {
      complexity,
      complexityScore,
      estimatedChunks,
      estimatedTimeSeconds,
      estimatedCredits,
      stats: {
        textLength,
        wordCount,
        sentenceCount,
        averageWordLength,
        averageSentenceLength
      }
    };
  } catch (error) {
    console.error("Error evaluating text complexity:", error);
    return { 
      complexity: 'unknown', 
      estimatedChunks: Math.ceil((text?.length || 1000) / DEFAULT_CHUNK_SIZE),
      error: error.message
    };
  }
}