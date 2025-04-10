// lib/BatchProcessor.js
class BatchProcessor {
    constructor(options = {}) {
      this.batchSize = options.batchSize || 10;
      this.maxConcurrentBatches = options.maxConcurrentBatches || 3;
      
      // Callbacks
      this.onProgress = options.onProgress || (() => {});
      this.onComplete = options.onComplete || (() => {});
      this.onError = options.onError || (() => {});
    }
    
    async processBatches(items, processor) {
      // Track stats
      const stats = {
        total: items.length,
        processed: 0,
        failed: 0,
        results: []
      };
      
      // Create batches
      const batches = [];
      for (let i = 0; i < items.length; i += this.batchSize) {
        batches.push(items.slice(i, i + this.batchSize));
      }
      
      // Process batches with controlled concurrency
      for (let i = 0; i < batches.length; i += this.maxConcurrentBatches) {
        const batchChunk = batches.slice(i, i + this.maxConcurrentBatches);
        
        // Process this chunk of batches concurrently
        const batchPromises = batchChunk.map(async (batch) => {
          try {
            // Process each item in the batch
            const batchResults = await Promise.all(
              batch.map(async (item) => {
                try {
                  return await processor(item);
                } catch (error) {
                  stats.failed++;
                  this.onError(error, item);
                  return { error, item };
                } finally {
                  stats.processed++;
                  this.onProgress({
                    processed: stats.processed,
                    total: stats.total,
                    failed: stats.failed
                  });
                }
              })
            );
            
            return batchResults.filter(result => !result.error);
          } catch (error) {
            console.error('Batch processing error:', error);
            return [];
          }
        });
        
        // Wait for all batches in this chunk to complete
        const batchResults = await Promise.all(batchPromises);
        stats.results.push(...batchResults.flat());
      }
      
      // Call completion callback
      this.onComplete({
        processed: stats.processed,
        total: stats.total,
        failed: stats.failed,
        results: stats.results
      });
      
      return stats.results;
    }
  }
  
  module.exports = BatchProcessor;