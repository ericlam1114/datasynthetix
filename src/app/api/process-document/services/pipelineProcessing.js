// src/app/api/process-document/services/pipelineProcessing.js
import { processWithPipeline, evaluateTextComplexity } from './pipeline';
import { updateProcessingStatus, completeProcessingJob } from './statusUpdate';
import { saveProcessingResults } from './document';

/**
 * Process a document using the pipeline and handle status updates
 * @param {string} text - The document text to process
 * @param {Object} options - Processing options
 * @param {string} documentId - The document ID
 * @param {string} jobId - The processing job ID
 * @returns {Object} Processing results
 */
export async function handleDocumentProcessing(text, options, documentId, jobId) {
  // Check if text is empty and handle gracefully
  if (!text || text.trim().length === 0) {
    console.warn(`Document ${documentId} has no text content for processing`);
    
    // Update status to reflect the issue
    await updateProcessingStatus(jobId, {
      status: 'warning',
      message: 'Document has no text content to process',
      progress: 100,
      warning: true,
      warningType: 'empty_document',
      processingStats: {
        completed: true,
        textLength: 0,
        skipped: true,
        reason: 'no_content'
      }
    });
    
    // Return a "success" response but with warning flags
    return {
      success: true,
      warning: true,
      warningType: 'empty_document',
      message: 'Document processed but contained no text',
      jobId,
      documentId,
      stats: {
        textLength: 0,
        processedChunks: 0,
        totalChunks: 0,
        skipped: true
      }
    };
  }
  
  try {
    // Estimate complexity
    const complexity = evaluateTextComplexity(text);
    
    // Update status with complexity information
    await updateProcessingStatus(jobId, {
      status: 'processing',
      message: 'Initializing processing pipeline',
      progress: 18,
      estimatedChunks: complexity.estimatedChunks,
      totalChunks: complexity.estimatedChunks,
      complexity: complexity.complexity,
      estimatedTime: complexity.estimatedTimeSeconds,
      documentId
    });
    
    // Process the document
    const result = await processWithPipeline(
      text, 
      options, 
      jobId, 
      complexity,
      updateProcessingStatus
    );
    
    // Check if the result has a warning (like timeout)
    const hasWarning = result.warning || false;
    
    // Update status based on result type
    if (hasWarning) {
      await updateProcessingStatus(jobId, {
        status: 'warning',
        message: result.message || 'Processing completed with warnings',
        progress: 95,
        warning: true,
        warningType: result.warning,
        processingStats: {
          ...result.stats,
          completed: true,
          warning: result.warning
        }
      });
    } else {
      // Normal completion
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Processing complete, saving results',
        progress: 90,
        processingStats: {
          ...result.stats,
          completed: true
        }
      });
    }
    
    // Save the processing results
    await saveProcessingResults(documentId, jobId, result);
    
    // Complete the processing job
    await completeProcessingJob(jobId, result);
    
    return {
      success: true,
      jobId,
      documentId,
      stats: result.stats,
      warning: result.warning,
      message: result.message
    };
  } catch (error) {
    // Handle different types of errors differently
    let errorType = 'processing_error';
    let statusCode = 500;
    let errorMessage = error.message || 'Unknown processing error';
    let recoverable = false;
    
    // Check for specific error types
    if (error.message && error.message.includes('timeout')) {
      errorType = 'timeout_error';
      errorMessage = `Processing timeout: ${error.message}`;
      statusCode = 408; // Request Timeout
      recoverable = true;
    } else if (error.message && error.message.includes('rate limit')) {
      errorType = 'rate_limit_error';
      errorMessage = `API rate limit exceeded: ${error.message}`;
      statusCode = 429; // Too Many Requests
      recoverable = true;
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      errorType = 'network_timeout';
      errorMessage = 'Network timeout while processing document';
      statusCode = 408;
      recoverable = true;
    }
    
    // In development mode, generate simulated results to allow easier testing
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Development mode: Simulating error recovery for ${errorType}`);
      
      // Generate simulated results for errors in development
      const simulatedClauseCount = Math.min(10, Math.ceil(text.length / 1000));
      const simulatedResults = {
        clauses: Array.from({ length: simulatedClauseCount }, (_, i) => ({
          id: `simulated-${i}`,
          text: text.substring(i * 500, i * 500 + 500),
          classification: ['Critical', 'Important', 'Standard'][i % 3],
          variants: [`Simulated variant for error recovery (${errorType})`]
        })),
        stats: {
          totalChunks: Math.ceil(text.length / 1000),
          processedChunks: Math.ceil(text.length / 1000) - 2,
          failedChunks: 2,
          totalClauses: simulatedClauseCount,
          processedClauses: simulatedClauseCount,
          generatedVariants: simulatedClauseCount,
          processingTimeMs: 5000,
          incomplete: true,
          error: {
            type: errorType,
            message: errorMessage
          }
        },
        classificationStats: {
          Critical: Math.ceil(simulatedClauseCount * 0.3),
          Important: Math.ceil(simulatedClauseCount * 0.3),
          Standard: Math.floor(simulatedClauseCount * 0.4)
        }
      };
      
      // Update status with warning about simulated recovery
      await updateProcessingStatus(jobId, {
        status: 'warning',
        message: `Development mode: Simulating recovery from ${errorType}`,
        progress: 95,
        warning: true,
        warningType: errorType,
        processingStats: {
          ...simulatedResults.stats,
          completed: true,
          warning: errorType
        }
      });
      
      // Save the simulated results
      try {
        await saveProcessingResults(documentId, jobId, simulatedResults);
        await completeProcessingJob(jobId, simulatedResults);
        
        return {
          success: true,
          jobId,
          documentId,
          stats: simulatedResults.stats,
          warning: errorType,
          message: `Development mode: Simulated recovery from ${errorType}`
        };
      } catch (simError) {
        console.error('Error saving simulated results:', simError);
        // Continue with normal error handling if the simulation fails
      }
    }
    
    // Update status with detailed error information
    try {
      await updateProcessingStatus(jobId, {
        status: 'error',
        message: errorMessage,
        progress: 0,
        error: {
          message: errorMessage,
          type: errorType,
          recoverable,
          stack: error.stack,
          stage: 'pipeline_processing'
        }
      });
    } catch (statusError) {
      console.error('Error updating status after processing failure:', statusError);
    }
    
    // Rethrow with added metadata
    const enhancedError = new Error(errorMessage);
    enhancedError.type = errorType;
    enhancedError.statusCode = statusCode;
    enhancedError.recoverable = recoverable;
    enhancedError.originalError = error;
    
    throw enhancedError;
  }
}

/**
 * Creates a batch processing job for multiple documents
 * @param {Array} documents - Array of documents to process
 * @param {Object} options - Processing options
 * @returns {Object} Batch processing results
 */
export async function createBatchProcessingJob(documents, options = {}) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error('No documents provided for batch processing');
  }
  
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const jobs = [];
  
  try {
    // Create processing job for each document
    for (const doc of documents) {
      if (!doc.id || !doc.text) {
        console.warn('Skipping invalid document in batch', doc);
        continue;
      }
      
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      
      // Create job info
      jobs.push({
        documentId: doc.id,
        jobId,
        status: 'queued',
        createdAt: new Date().toISOString()
      });
    }
    
    // Return batch information
    return {
      batchId,
      totalDocuments: jobs.length,
      jobs,
      status: 'created',
      options
    };
  } catch (error) {
    console.error('Error creating batch processing job:', error);
    throw error;
  }
}