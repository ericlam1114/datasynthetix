/**
 * Document Processor Test Script
 * This script runs in the browser to validate document processing functionality
 */

console.log('📋 Document Processor Test Script loaded');

// Helper function to simulate document processing request
async function testDocumentProcessing() {
  console.log('⏳ Starting document processor test...');
  
  try {
    // 1. Test URL parameter parsing
    console.log('✅ Testing URL parameter handling...');
    const urlParams = new URLSearchParams(window.location.search);
    const documentId = urlParams.get('documentId');
    const test = urlParams.get('test') === 'true';
    const debug = urlParams.get('debug') === 'true';
    const useCase = urlParams.get('useCase') || 'rewriter-legal';
    const outputFormat = urlParams.get('outputFormat') || 'openai-jsonl';
    
    console.log('📋 URL Parameters:', {
      documentId,
      test,
      debug,
      useCase,
      outputFormat
    });
    
    if (!documentId) {
      console.error('❌ No documentId found in URL');
      return false;
    }
    
    // 2. Test document processor visibility
    console.log('⏳ Testing document processor visibility...');
    
    // Check if document processor is visible
    const processorElement = document.querySelector('[data-testid="document-processor"]');
    if (!processorElement) {
      console.error('❌ Document processor component not found in DOM');
      return false;
    }
    
    console.log('✅ Document processor component found');
    
    // 3. Test processing state visibility
    console.log('⏳ Testing processing state visibility...');
    
    // Check if processing state is visible (may take a moment to appear)
    let processingStateElement = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      processingStateElement = document.querySelector('[data-testid="processing-state"]');
      if (processingStateElement) break;
    }
    
    if (!processingStateElement) {
      console.error('❌ Processing state not found after waiting');
      return false;
    }
    
    console.log('✅ Processing state is visible');
    
    // 4. Monitor processing progress
    console.log('⏳ Monitoring processing progress...');
    let progressChecks = 0;
    let lastProgress = 0;
    
    while (progressChecks < 5) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      progressChecks++;
      
      // Look for progress indicator
      const progressElement = document.querySelector('[role="progressbar"]');
      if (progressElement) {
        const currentProgress = parseInt(progressElement.getAttribute('aria-valuenow') || '0', 10);
        console.log(`📊 Current progress: ${currentProgress}%`);
        
        if (currentProgress > lastProgress) {
          console.log('✅ Progress is increasing - processing is active');
          lastProgress = currentProgress;
        }
      } else {
        console.log('⚠️ Progress element not found');
      }
    }
    
    console.log('✅ Document processing test completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error during document processing test:', error);
    return false;
  }
}

// Wait for page to fully load then run the test
window.addEventListener('load', () => {
  // Only run test if we're on the process page
  if (window.location.pathname.includes('/dashboard/process')) {
    console.log('🧪 Document processor testing started');
    
    // Delay the test slightly to ensure components are rendered
    setTimeout(() => {
      testDocumentProcessing().then(success => {
        console.log(`Test completed with ${success ? 'SUCCESS' : 'FAILURE'}`);
      });
    }, 3000);
  }
}); 