// src/app/api/process-document/services/pipeline.js
import { SyntheticDataPipeline } from "../../../../lib/SyntheticDataPipeline";
import { createTextChunks } from './textExtraction';
import { MODELS, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP, DEFAULT_OUTPUT_FORMAT, DEFAULT_CLASS_FILTER, DEFAULT_MAX_VARIANTS, DEFAULT_TIMEOUTS } from "../config";
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';

// Add memory monitoring
let lastMemoryUsage = 0;
let memoryWarningThreshold = 0.8; // 80% of available memory
let criticalMemoryThreshold = 0.9; // 90% of available memory

// Memory management constants
const CHUNK_SIZE = 8000; // characters per chunk
const MEMORY_WARNING_THRESHOLD = 85; // 85% of available memory triggers warnings
const GC_THRESHOLD = 90; // 90% of available memory triggers GC
const DEFAULT_MAX_CONCURRENT = 3; // default max concurrent requests
const LOW_MEMORY_MAX_CONCURRENT = 1; // reduce to 1 when memory is constrained

/**
 * Check current memory usage and manage resources
 * @returns {Object} Memory usage details
 */
function checkMemoryUsage() {
  if (typeof process === 'undefined' || !process.memoryUsage) {
    return { 
      memoryUsage: 0, 
      percentUsed: 0, 
      isWarning: false, 
      isCritical: false
    };
  }

  try {
    // Get memory usage
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const heapTotal = memUsage.heapTotal;
    const percentUsed = heapUsed / heapTotal;
    
    // Check for memory warnings
    const isWarning = percentUsed > memoryWarningThreshold;
    const isCritical = percentUsed > criticalMemoryThreshold;
    
    // Track memory change rate
    const memoryChangeRate = heapUsed - lastMemoryUsage;
    lastMemoryUsage = heapUsed;
    
    // Log memory warnings
    if (isWarning) {
      console.warn(`⚠️ Memory warning: ${(percentUsed * 100).toFixed(1)}% used (${(heapUsed / 1024 / 1024).toFixed(2)}MB/${(heapTotal / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    if (isCritical) {
      console.error(`🚨 Critical memory usage: ${(percentUsed * 100).toFixed(1)}% used (${(heapUsed / 1024 / 1024).toFixed(2)}MB/${(heapTotal / 1024 / 1024).toFixed(2)}MB)`);
      // Force garbage collection if available (Node.js only, requires --expose-gc flag)
      if (global.gc) {
        global.gc();
        console.log("Forced garbage collection complete");
      }
    }
    
    return {
      memoryUsage: heapUsed,
      memoryTotal: heapTotal,
      percentUsed,
      isWarning,
      isCritical,
      memoryChangeRate
    };
  } catch (error) {
    console.error("Error checking memory usage:", error);
    return { 
      memoryUsage: 0, 
      percentUsed: 0, 
      isWarning: false, 
      isCritical: false,
      error: error.message
    };
  }
}

/**
 * Creates a new pipeline instance with the provided options
 * @param {Object} options - Pipeline configuration options
 * @returns {SyntheticDataPipeline} Configured pipeline instance
 */
export function createPipelineInstance(options = {}) {
  // Ensure we have an API key
  if (!process.env.OPENAI_API_KEY && !options.apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  
  // Create an instance with custom configuration
  return new OpenAI({
    apiKey,
    maxRetries: options.maxRetries || 2,
    timeout: options.timeout || 60000, // 60 seconds default
  });
}

/**
 * Function with timeout safety for promises
 * @param {Promise} promise - The promise to execute with timeout
 * @param {Number} timeoutMs - Timeout in milliseconds
 * @param {String} operation - Name of the operation for error message
 * @returns {Promise} The promise result or timeout error
 */
export async function withTimeout(promise, timeoutMs, operation = 'Operation') {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Monitor memory usage and return current percentage used
 * @returns {number} Percentage of memory used (0-100)
 */
export function getMemoryUsage() {
  if (typeof process === 'undefined' || !process.memoryUsage) {
    // Browser environment doesn't have access to process.memoryUsage
    return 0; 
  }
  
  const { rss, heapTotal, heapUsed } = process.memoryUsage();
  // Use relative heap usage as primary indicator
  return Math.round((heapUsed / heapTotal) * 100);
}

/**
 * Attempt to clean up memory by forcing garbage collection
 * @returns {boolean} True if GC was triggered, false otherwise
 */
export function triggerMemoryCleanup() {
  // First try to use the global GC if available
  if (global.gc) {
    try {
      global.gc();
      return true;
    } catch (e) {
      console.warn('Failed to trigger garbage collection:', e);
    }
  }
  
  // Otherwise try to clean up manually
  // This is less effective but might help in some cases
  try {
    // Create some pressure for V8's GC to kick in by releasing references
    if (typeof global !== 'undefined') {
      const cache = {};
      for (let i = 0; i < 10000; i++) {
        cache[i] = new Array(10000).fill('x');
        delete cache[i];
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Split text into manageable chunks for processing
 * @param {string} text Document text to chunk
 * @param {number} targetSize Target chunk size (defaults to CHUNK_SIZE)
 * @returns {Array<string>} Array of text chunks
 */
export function chunkText(text, targetSize = CHUNK_SIZE) {
  if (!text || text.length <= targetSize) {
    return [text];
  }

  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    // Get a chunk of the target size or what's left
    let chunkEnd = Math.min(currentPos + targetSize, text.length);
    
    // Try to break at a natural boundary like paragraph or sentence
    if (chunkEnd < text.length) {
      // Look for paragraph breaks first (most natural)
      const paragraphBreak = text.lastIndexOf('\n\n', chunkEnd);
      if (paragraphBreak > currentPos && (chunkEnd - paragraphBreak) < targetSize * 0.2) {
        chunkEnd = paragraphBreak + 2; // Include the newlines
      } else {
        // Then try for a single newline
        const lineBreak = text.lastIndexOf('\n', chunkEnd);
        if (lineBreak > currentPos && (chunkEnd - lineBreak) < targetSize * 0.1) {
          chunkEnd = lineBreak + 1; // Include the newline
        } else {
          // If no good newline, try for a sentence break
          const sentenceBreak = Math.max(
            text.lastIndexOf('. ', chunkEnd),
            text.lastIndexOf('! ', chunkEnd),
            text.lastIndexOf('? ', chunkEnd)
          );
          if (sentenceBreak > currentPos && (chunkEnd - sentenceBreak) < targetSize * 0.08) {
            chunkEnd = sentenceBreak + 2; // Include the period and space
          }
        }
      }
    }

    // Extract the chunk and add to our list
    chunks.push(text.substring(currentPos, chunkEnd));
    currentPos = chunkEnd;
  }

  return chunks;
}

/**
 * Creates a progress callback function for the pipeline
 * @param {string} jobId - The processing job ID
 * @param {Object} complexity - Text complexity metrics
 * @param {Function} updateStatusFn - Function to update processing status
 * @returns {Function} Progress callback function
 */
export function createProgressCallback(jobId, complexity, updateStatusFn) {
  let totalSteps = complexity.level === 'high' ? 10 : complexity.level === 'medium' ? 7 : 5;
  let currentStep = 0;
  
  return (status, details = {}) => {
    currentStep++;
    const progress = Math.min(Math.round((currentStep / totalSteps) * 100), 95);
    
    // Check memory usage
    const memoryUsage = getMemoryUsage();
    
    // Add memory info to the details
    const statusDetails = {
      ...details,
      progress,
      memory: {
        usagePercent: memoryUsage,
        isConstrained: memoryUsage > MEMORY_WARNING_THRESHOLD
      }
    };
    
    // Trigger garbage collection if we're above threshold
    if (memoryUsage > GC_THRESHOLD && global.gc) {
      statusDetails.memory.gcTriggered = true;
      triggerMemoryCleanup();
    }
    
    // Update the status with the collected information
    updateStatusFn(jobId, status, statusDetails);
    
    return statusDetails;
  };
}

/**
 * Processes document text in smaller batches to prevent memory issues
 * @param {SyntheticDataPipeline} pipeline - The pipeline instance
 * @param {string} text - Document text
 * @param {Object} options - Pipeline options
 * @param {Function} progressCallback - Progress callback function
 * @returns {Object} Combined processing results
 */
async function processByBatches(pipeline, text, options, progressCallback) {
  // Create chunks
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;
  const memoryLimits = options.memoryLimits || {
    maxChunksPerBatch: 10,
    enforceChunkLimit: true
  };
  
  const chunks = createTextChunks(text, {
    maxChunkSize: chunkSize,
    overlapSize: overlap
  });
  
  console.log(`Processing ${chunks.length} chunks in batches of ${memoryLimits.maxChunksPerBatch}`);
  
  // Initialize results
  const allClauses = [];
  let totalProcessingTime = 0;
  let failedChunks = 0;
  let processedChunks = 0;
  let totalClauses = 0;
  let generatedVariants = 0;
  
  // Process in batches to manage memory
  const batchSize = memoryLimits.maxChunksPerBatch || 10;
  const numBatches = Math.ceil(chunks.length / batchSize);
  
  for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
    // Check memory before processing batch
    const memoryStatus = checkMemoryUsage();
    
    // If memory is critical, pause processing and do garbage collection
    if (memoryStatus.isCritical) {
      console.warn("Critical memory usage detected, pausing processing for 2 seconds");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Re-check memory
      const afterPauseMemory = checkMemoryUsage();
      if (afterPauseMemory.isCritical) {
        throw new Error("Unable to continue processing due to critical memory usage");
      }
    }
    
    // Calculate batch range
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, chunks.length);
    const batchChunks = chunks.slice(startIdx, endIdx);
    
    // Create a batch text with proper context
    const batchText = batchChunks.join(' ');
    
    try {
      console.log(`Processing batch ${batchIndex + 1}/${numBatches} (chunks ${startIdx + 1}-${endIdx})`);
      
      // Process this batch
      const batchResult = await pipeline.processText(batchText, {
        ...options,
        batchIndex,
        totalBatches: numBatches,
        progressCallback: (progress) => {
          if (progressCallback) {
            // Adjust progress numbers to reflect overall progress
            const adjustedProgress = {
              ...progress,
              currentChunk: startIdx + (progress.currentChunk || 0),
              totalChunks: chunks.length
            };
            progressCallback(adjustedProgress);
          }
        }
      });
      
      // Merge results
      if (batchResult && batchResult.clauses) {
        // Filter out duplicate clauses by text content
        const existingTexts = new Set(allClauses.map(c => c.text));
        const newClauses = batchResult.clauses.filter(c => !existingTexts.has(c.text));
        
        // Add batch ID to clauses for tracking
        newClauses.forEach(clause => {
          clause.batchIndex = batchIndex;
          clause.id = clause.id || `clause-${uuidv4().substring(0, 8)}`;
        });
        
        allClauses.push(...newClauses);
        totalClauses += newClauses.length;
        
        // Track variants
        generatedVariants += batchResult.stats?.generatedVariants || 0;
        totalProcessingTime += batchResult.stats?.processingTimeMs || 0;
      }
      
      processedChunks += batchChunks.length;
      
      // Allow some time for memory cleanup between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (batchError) {
      console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
      failedChunks += batchChunks.length;
      
      // Continue with next batch instead of failing completely
      continue;
    }
  }
  
  // Return combined results
  return {
    success: true,
    clauses: allClauses,
    stats: {
      totalChunks: chunks.length,
      processedChunks,
      failedChunks,
      totalClauses,
      processedClauses: totalClauses,
      generatedVariants,
      processingTimeMs: totalProcessingTime,
      batchProcessed: true,
      batchCount: numBatches
    }
  };
}

/**
 * Process text in batches to avoid memory issues with large documents
 * @param {string} text - Full document text
 * @param {Object} options - Processing options
 * @param {string} jobId - Job identifier
 * @param {Object} complexity - Document complexity data
 * @param {Function} updateStatusFn - Function to update processing status
 * @returns {Promise<Object>} - Processing result
 */
async function processBatched(text, options, jobId, complexity, updateStatusFn) {
  // Set up progress tracking
  const progressCallback = createProgressCallback(
    jobId,
    complexity,
    updateStatusFn
  );

  // Calculate batch size based on complexity
  const recommendedBatches = calculateRecommendedBatches(complexity);
  const batchSize = Math.ceil(text.length / recommendedBatches);
  
  // Inform about batch processing start
  updateStatusFn(jobId, {
    stage: "processing",
    message: `Processing document in ${recommendedBatches} batches due to size`,
    progress: 0,
    batchProcessing: true,
    batchCount: recommendedBatches,
    currentBatch: 1,
    memoryStatus: "normal",
  });
  
  let results = [];
  let combinedOutput = {
    entities: [],
    relationships: [],
    events: [],
    summaries: {},
    metadata: {
      processedInBatches: true,
      batchCount: recommendedBatches,
      originalComplexity: complexity,
    }
  };
  
  // Process in batches
  for (let i = 0; i < recommendedBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, text.length);
    const batchText = text.slice(start, end);
    const batchNumber = i + 1;
    
    // Update status for this batch
    updateStatusFn(jobId, {
      stage: "processing",
      message: `Processing batch ${batchNumber}/${recommendedBatches}`,
      progress: (i / recommendedBatches) * 100,
      batchProcessing: true,
      batchCount: recommendedBatches,
      currentBatch: batchNumber,
      memoryStatus: "normal",
    });
    
    try {
      // Process this batch
      const batchComplexity = evaluateTextComplexity(batchText);
      const pipeline = createPipelineInstance(options);
      
      // Process with timeout
      const batchResult = await withTimeout(
        pipeline.process(batchText, progressCallback),
        options.timeoutMs || 600000, // 10 minutes default timeout
        `Processing batch ${batchNumber}/${recommendedBatches}`
      );
      
      results.push(batchResult);
      
      // Merge batch results into combined output
      mergeResults(combinedOutput, batchResult);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Brief pause to allow memory to be released
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      // If a batch fails, continue with others but log the error
      console.error(`Error processing batch ${batchNumber}:`, error);
      updateStatusFn(jobId, {
        stage: "processing",
        message: `Warning: Batch ${batchNumber} encountered issues`,
        progress: (i / recommendedBatches) * 100,
        batchProcessing: true,
        batchCount: recommendedBatches,
        currentBatch: batchNumber,
        memoryStatus: "warning",
        error: `Batch ${batchNumber} error: ${error.message}`,
      });
    }
  }
  
  // Final processing to ensure coherence of combined results
  combinedOutput = postProcessCombinedResults(combinedOutput);
  
  return combinedOutput;
}

/**
 * Calculate recommended number of batches based on document complexity
 * @param {Object} complexity - Document complexity metrics
 * @returns {number} - Recommended number of batches
 */
function calculateRecommendedBatches(complexity) {
  const MEMORY_BASE_MB = 250; // Base memory usage
  const MEMORY_PER_CHAR_MB = 0.00002; // ~20KB per 1000 chars
  const MEMORY_PER_CHUNK_MB = 2.5; // ~2.5MB per chunk
  const BATCH_MEMORY_THRESHOLD_MB = 500; // Target memory per batch
  const BATCH_CHUNKS_THRESHOLD = 20; // Target chunks per batch
  
  // Calculate memory estimates
  const memoryEstimateMB = Math.ceil(
    MEMORY_BASE_MB + 
    (complexity.textLength * MEMORY_PER_CHAR_MB) + 
    (complexity.estimatedChunks * MEMORY_PER_CHUNK_MB)
  );
  
  // Memory multiplier based on complexity
  const memoryMultiplier = 
    complexity.level === "high" ? 1.5 : 
    complexity.level === "medium" ? 1.2 : 1;
  
  const adjustedMemoryEstimateMB = Math.ceil(memoryEstimateMB * memoryMultiplier);
  
  // Calculate batches based on memory and chunks
  const memoryBasedBatches = Math.ceil(adjustedMemoryEstimateMB / BATCH_MEMORY_THRESHOLD_MB);
  const chunkBasedBatches = Math.ceil(complexity.estimatedChunks / BATCH_CHUNKS_THRESHOLD);
  
  // Use the higher of the two calculations with minimum of 2 and maximum of 10
  const recommendedBatches = Math.min(
    Math.max(2, memoryBasedBatches, chunkBasedBatches),
    10
  );
  
  return complexity.level === "high" || complexity.textLength > 100000 ? 
    recommendedBatches : 1;
}

/**
 * Merge batch results into the combined output
 * @param {Object} combinedOutput - Output being built up
 * @param {Object} batchResult - Result from a single batch
 */
function mergeResults(combinedOutput, batchResult) {
  // Merge entities with deduplication
  if (batchResult.entities && batchResult.entities.length > 0) {
    const existingIds = new Set(combinedOutput.entities.map(e => e.id));
    batchResult.entities.forEach(entity => {
      if (!existingIds.has(entity.id)) {
        combinedOutput.entities.push(entity);
        existingIds.add(entity.id);
      }
    });
  }
  
  // Merge relationships with deduplication
  if (batchResult.relationships && batchResult.relationships.length > 0) {
    const relationshipKey = r => `${r.source}-${r.type}-${r.target}`;
    const existingKeys = new Set(combinedOutput.relationships.map(relationshipKey));
    
    batchResult.relationships.forEach(relationship => {
      const key = relationshipKey(relationship);
      if (!existingKeys.has(key)) {
        combinedOutput.relationships.push(relationship);
        existingKeys.add(key);
      }
    });
  }
  
  // Merge events with deduplication
  if (batchResult.events && batchResult.events.length > 0) {
    const eventKey = e => `${e.type}-${e.timestamp}`;
    const existingKeys = new Set(combinedOutput.events.map(eventKey));
    
    batchResult.events.forEach(event => {
      const key = eventKey(event);
      if (!existingKeys.has(key)) {
        combinedOutput.events.push(event);
        existingKeys.add(key);
      }
    });
  }
  
  // Merge summaries - append or extend
  if (batchResult.summaries) {
    Object.keys(batchResult.summaries).forEach(key => {
      if (!combinedOutput.summaries[key]) {
        combinedOutput.summaries[key] = batchResult.summaries[key];
      } else {
        // For summary text, append with separation
        if (typeof batchResult.summaries[key] === 'string') {
          combinedOutput.summaries[key] += "\n\n" + batchResult.summaries[key];
        } 
        // For structured summaries, attempt to merge appropriately
        else if (typeof batchResult.summaries[key] === 'object') {
          combinedOutput.summaries[key] = {
            ...combinedOutput.summaries[key],
            ...batchResult.summaries[key]
          };
        }
      }
    });
  }
}

/**
 * Post-process combined results to ensure coherence
 * @param {Object} combinedOutput - Combined results from all batches
 * @returns {Object} - Processed and coherent results
 */
function postProcessCombinedResults(combinedOutput) {
  // De-duplicate entities based on name and type
  const uniqueEntities = [];
  const entityMap = new Map();
  
  combinedOutput.entities.forEach(entity => {
    const key = `${entity.type}-${entity.name}`;
    if (!entityMap.has(key)) {
      entityMap.set(key, entity);
      uniqueEntities.push(entity);
    } else {
      // Merge properties if this is a duplicate
      const existing = entityMap.get(key);
      if (entity.properties) {
        existing.properties = { ...existing.properties, ...entity.properties };
      }
    }
  });
  
  combinedOutput.entities = uniqueEntities;
  
  // Sort events chronologically
  if (combinedOutput.events && combinedOutput.events.length > 0) {
    combinedOutput.events.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      return 0;
    });
  }
  
  // Add metadata about the batched processing
  combinedOutput.metadata = {
    ...combinedOutput.metadata,
    processedAt: new Date().toISOString(),
    entityCount: combinedOutput.entities.length,
    relationshipCount: combinedOutput.relationships.length,
    eventCount: combinedOutput.events?.length || 0,
  };
  
  return combinedOutput;
}

/**
 * Process document text with the pipeline
 * @param {string} text - Document text to process
 * @param {Object} options - Processing options
 * @param {string} jobId - Job ID for status updates
 * @param {Object} complexity - Text complexity metrics
 * @param {Function} updateStatusFn - Function to update processing status
 * @returns {Object} Processing results
 */
export async function processWithPipeline(text, options = {}, jobId, complexity, updateStatusFn) {
  try {
    // Update status if we have an update function
    if (updateStatusFn && jobId) {
      await updateStatusFn(jobId, { 
        status: 'processing',
        message: 'Initializing processing pipeline',
        progress: 20
      });
    }
    
    // Check memory status
    const memoryStatus = getMemoryUsage();
    const useSimulation = 
      process.env.NEXT_PUBLIC_USE_SIMULATION === 'true' || 
      options.useSimulation === true;
    
    // Use simulation mode in development or if memory is constrained
    if (useSimulation || memoryStatus > MEMORY_WARNING_THRESHOLD) {
      console.log(`Using simulation mode for processing. Memory: ${memoryStatus}%, Simulation flag: ${useSimulation}`);
      
      // Create simulated result with artificial delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return simulated data
      return createSimulatedResult(text, options);
    }
    
    // For real processing
    const progressCallback = createProgressCallback(jobId, complexity, updateStatusFn);
    
    // Process based on text size and complexity
    if (complexity.level === 'high' || text.length > 50000) {
      // For large documents or high complexity, use batched processing
      return await processBatched(text, options, jobId, complexity, updateStatusFn);
    } else {
      // For smaller documents, use standard processing
      const openai = createPipelineInstance(options);
      return await processChunk(openai, text, options);
    }
  } catch (error) {
    console.error('Pipeline processing error:', error);
    throw error;
  }
}

/**
 * Process a single chunk of text
 */
async function processChunk(openai, chunkText, options) {
  // Define a system prompt that explains the task
  const systemPrompt = options.systemPrompt || 
    "You are a data analysis assistant. Extract key information from the provided text.";
  
  // Select the model to use based on options or default
  const model = options.model || 'gpt-3.5-turbo';
  
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Process the following text:\n\n${chunkText}` }
      ],
      temperature: options.temperature || 0.3,
      max_tokens: options.maxTokens || 1000,
    });
    
    // Extract the response content
    const responseContent = completion.choices[0]?.message?.content || '';
    
    // Try to parse as JSON if possible, otherwise return as text
    try {
      return JSON.parse(responseContent);
    } catch (e) {
      return { 
        content: responseContent,
        chunkIndex: options.chunkIndex,
        totalChunks: options.totalChunks
      };
    }
  } catch (error) {
    console.error('Error processing chunk:', error);
    return { 
      error: error.message,
      chunkIndex: options.chunkIndex,
      totalChunks: options.totalChunks
    };
  }
}

/**
 * Merge results from multiple chunks into a coherent result
 */
function mergeChunkResults(chunkResults) {
  // Basic implementation - this should be enhanced based on your specific data structure
  const merged = {
    entities: [],
    keywords: [],
    summary: '',
    sentiments: [],
    errors: []
  };
  
  // Combine the results from each chunk
  chunkResults.forEach((result, index) => {
    // Check for errors in this chunk
    if (result.error) {
      merged.errors.push({
        chunkIndex: index,
        error: result.error
      });
      return;
    }
    
    // Add entities, avoiding duplicates
    if (Array.isArray(result.entities)) {
      result.entities.forEach(entity => {
        if (!merged.entities.some(e => e.name === entity.name)) {
          merged.entities.push(entity);
        }
      });
    }
    
    // Add keywords, avoiding duplicates
    if (Array.isArray(result.keywords)) {
      result.keywords.forEach(keyword => {
        if (!merged.keywords.includes(keyword)) {
          merged.keywords.push(keyword);
        }
      });
    }
    
    // Append to summary
    if (result.summary) {
      merged.summary += (merged.summary ? ' ' : '') + result.summary;
    }
    
    // Add sentiments
    if (Array.isArray(result.sentiments)) {
      merged.sentiments = [...merged.sentiments, ...result.sentiments];
    }
  });
  
  return merged;
}

/**
 * Create simulated results for development purposes
 */
export function createSimulatedResult(text, options = {}) {
  // Generate some sample entities based on text length
  const wordCount = text.split(/\s+/).length;
  const entityCount = Math.min(Math.max(3, Math.floor(wordCount / 100)), 15);
  
  const sampleEntities = [
    { type: 'person', name: 'John Smith', confidence: 0.92 },
    { type: 'organization', name: 'Acme Corporation', confidence: 0.88 },
    { type: 'location', name: 'San Francisco', confidence: 0.95 },
    { type: 'date', name: 'January 15, 2023', confidence: 0.97 },
    { type: 'product', name: 'XPS 15 Laptop', confidence: 0.85 },
    { type: 'event', name: 'Annual Conference', confidence: 0.82 },
    { type: 'person', name: 'Sarah Johnson', confidence: 0.91 },
    { type: 'organization', name: 'Global Industries', confidence: 0.89 },
    { type: 'location', name: 'Tokyo', confidence: 0.94 },
    { type: 'date', name: 'Q2 2023', confidence: 0.93 },
    { type: 'product', name: 'AI Assistant Pro', confidence: 0.87 },
    { type: 'event', name: 'Product Launch', confidence: 0.86 },
    { type: 'person', name: 'David Lee', confidence: 0.90 },
    { type: 'organization', name: 'Tech Innovations Ltd', confidence: 0.88 },
    { type: 'location', name: 'Berlin', confidence: 0.94 },
  ];
  
  // Take a subset of sample entities
  const entities = sampleEntities.slice(0, entityCount);
  
  // Generate some keywords
  const keywords = [
    'analytics', 'technology', 'innovation', 'development', 
    'strategy', 'implementation', 'solution', 'management'
  ].slice(0, Math.floor(entityCount * 0.8));
  
  // Create a simple summary based on text length
  const summary = `This document contains approximately ${wordCount} words and discusses topics related to ${keywords.slice(0, 3).join(', ')}.`;
  
  // Return the simulated result
  return {
    entities,
    keywords,
    summary,
    sentiments: [
      { topic: 'product', sentiment: 'positive', score: 0.78 },
      { topic: 'service', sentiment: 'neutral', score: 0.52 },
    ],
    simulatedResult: true
  };
}

/**
 * Evaluates the complexity of the text and estimates processing requirements
 */
export function evaluateTextComplexity(text) {
  // Basic text metrics
  const textLength = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length;
  
  // Calculate average word and sentence length
  const avgWordLength = textLength / wordCount || 0;
  const avgSentenceLength = wordCount / sentenceCount || 0;
  
  // Estimate the number of chunks based on text length
  const chunkSize = CHUNK_SIZE;
  const estimatedChunks = Math.ceil(textLength / chunkSize);
  
  // Calculate a complexity score (1-10 scale)
  // Factors: text length, sentence complexity, chunk count
  let complexityScore = 1;
  
  // Factor 1: Text length (up to 5 points)
  if (textLength > 100000) complexityScore += 5;       // > 100k chars
  else if (textLength > 50000) complexityScore += 4;   // > 50k chars
  else if (textLength > 25000) complexityScore += 3;   // > 25k chars
  else if (textLength > 10000) complexityScore += 2;   // > 10k chars
  else if (textLength > 5000) complexityScore += 1;    // > 5k chars
  
  // Factor 2: Sentence complexity (up to 3 points)
  if (avgSentenceLength > 30) complexityScore += 3;       // Very complex sentences
  else if (avgSentenceLength > 20) complexityScore += 2;  // Complex sentences
  else if (avgSentenceLength > 15) complexityScore += 1;  // Moderately complex
  
  // Factor 3: Word complexity (up to 2 points)
  if (avgWordLength > 7) complexityScore += 2;         // Very complex vocabulary
  else if (avgWordLength > 5) complexityScore += 1;    // Complex vocabulary
  
  // Ensure score is within range 1-10
  complexityScore = Math.min(10, Math.max(1, complexityScore));
  
  // Determine complexity level
  let complexityLevel = 'low';
  if (complexityScore >= 7) {
    complexityLevel = 'high';
  } else if (complexityScore >= 4) {
    complexityLevel = 'medium';
  }
  
  // Estimate processing time in seconds based on text length
  // This is a rough estimate and should be calibrated based on actual performance
  const estimatedTokens = textLength * 0.25; // Rough estimate: 4 chars per token
  const tokensPerSecond = complexityLevel === 'high' ? 15 : 
                         complexityLevel === 'medium' ? 25 : 40;
  const estimatedProcessingTime = Math.ceil(estimatedTokens / tokensPerSecond);
  
  // Estimate credits (cost) based on token count
  // Assumes approximately $0.001 per 1K tokens for gpt-3.5-turbo
  const estimatedTokenCost = estimatedTokens / 1000 * 0.001;
  
  return {
    metrics: {
      textLength,
      wordCount,
      sentenceCount,
      avgWordLength,
      avgSentenceLength,
      estimatedChunks,
      estimatedTokens
    },
    score: complexityScore,
    level: complexityLevel,
    estimatedProcessingTime,
    estimatedTokenCost
  };
}