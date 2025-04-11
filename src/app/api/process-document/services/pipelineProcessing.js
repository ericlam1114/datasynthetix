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
    
    // Update status before saving results
    await updateProcessingStatus(jobId, {
      status: 'processing',
      message: 'Processing complete, saving results',
      progress: 90,
      processingStats: {
        ...result.stats,
        completed: true
      }
    });
    
    // Save the processing results
    await saveProcessingResults(documentId, jobId, result);
    
    // Complete the processing job
    await completeProcessingJob(jobId, result);
    
    return {
      success: true,
      jobId,
      documentId,
      stats: result.stats
    };
  } catch (error) {
    // Update status with error
    try {
      await updateProcessingStatus(jobId, {
        status: 'error',
        message: `Processing error: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack,
          stage: 'pipeline_processing'
        }
      });
    } catch (statusError) {
      console.error('Error updating status after processing failure:', statusError);
    }
    
    throw error;
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