// src/app/api/process-document/services/progress.js
import { updateProcessingStatus } from './statusUpdate';

/**
 * Creates a progress callback function for the pipeline
 * @param {string} jobId - The job ID
 * @param {Object} complexity - Text complexity metrics
 * @returns {Function} Progress callback function
 */
export function createProgressCallback(jobId, complexity) {
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
      
      await updateProcessingStatus(jobId, statusUpdate);
    } catch (progressError) {
      console.error('Error in progress callback:', progressError);
    }
  };
}

/**
 * Updates status for different processing stages
 * @param {string} jobId - The job ID
 * @param {string} stage - Current processing stage
 * @param {Object} data - Additional data for the status update
 */
export async function updateProcessingStage(jobId, stage, data = {}) {
  let message = '';
  let progress = 0;
  
  switch (stage) {
    case 'initialization':
      message = 'Starting document processing';
      progress = 5;
      break;
    case 'document_upload':
      message = 'Document uploaded, extracting text';
      progress = 10;
      break;
    case 'text_extraction':
      message = 'Text extracted successfully';
      progress = 15;
      break;
    case 'pipeline_init':
      message = 'Initializing processing pipeline';
      progress = 18;
      break;
    case 'processing':
      message = 'Processing document';
      progress = 20;
      break;
    case 'saving_results':
      message = 'Processing complete, saving results';
      progress = 90;
      break;
    case 'complete':
      message = 'Document processed successfully';
      progress = 100;
      break;
    case 'error':
      message = data.errorMessage || 'Error during processing';
      progress = data.progress || 0;
      break;
    default:
      message = 'Processing in progress';
      progress = 50;
  }
  
  await updateProcessingStatus(jobId, {
    status: stage === 'complete' ? 'complete' : stage === 'error' ? 'error' : 'processing',
    message,
    progress,
    ...data
  });
}