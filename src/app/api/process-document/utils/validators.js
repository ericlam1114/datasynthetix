// src/app/api/process-document/utils/validators.js

/**
 * Validates the quality of extracted text
 * @param {string} text - The extracted text to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with valid flag and optional reason
 */
export function validateExtractedText(text, options = {}) {
    const { minLength = 10, validateContent = true } = options;
    
    // Skip validation if requested
    if (!validateContent) {
      return { valid: true, reason: 'validation_bypassed' };
    }
    
    // Bypass validation in development mode if configured
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_TEXT_VALIDATION === 'true') {
      console.log("⚠️ Development mode - bypassing text validation checks");
      console.log(`Text length: ${text?.length || 0} characters`);
      return { valid: true, bypassed: true };
    }
    
    // Check minimum length requirements
    if (!text || text.length < minLength) {
      console.log("❌ Text extraction failed or produced insufficient content");
      console.log(`Text length: ${text?.length || 0} characters`);
      
      // More lenient in development mode
      if (process.env.NODE_ENV === 'development') {
        console.warn("Development mode - allowing short text to proceed despite validation failure");
        if (!text || text.length === 0) {
          return { 
            valid: true, 
            placeholder: true,
            text: "This document appears to be empty or contains only images. OCR processing may be required."
          };
        }
        return { valid: true, lenient: true };
      }
      
      return { valid: false, reason: "insufficient_content" };
    }
    
    // Quality checks
    const containsWords = /\b\w{2,}\b/.test(text); // Has words of at least 2 chars
    const hasPunctuation = /[.,;:?!]/.test(text);  // Has punctuation
    const hasSpaces = /\s/.test(text);             // Has whitespace
    
    console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
    console.log(`Text length: ${text.length} characters`);
    
    // Check for potential OCR quality issues
    const hasExcessiveSymbols = (text.match(/[^\w\s.,;:?!'"()\-–—]/g) || []).length > text.length * 0.1;
    const hasUnusualPatterns = /(.)\1{5,}/.test(text); // Repeated characters
    
    if (hasExcessiveSymbols || hasUnusualPatterns) {
      console.log("⚠️ Text may have OCR or quality issues");
      
      if (process.env.NODE_ENV === 'development') {
        console.warn("Development mode - allowing text with OCR issues to proceed");
        return { 
          valid: true, 
          reason: "potential_ocr_issues",
          issues: { hasExcessiveSymbols, hasUnusualPatterns },
          quality: "low"
        };
      }
    }
    
    if (containsWords || hasSpaces) {
      console.log("✅ Text extraction appears successful");
      return { valid: true };
    } else {
      console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
      
      if (process.env.NODE_ENV === 'development') {
        console.warn("Development mode - allowing text with quality issues to proceed");
        return { valid: true, qualityIssues: true };
      }
      
      return { valid: false, reason: "text_quality_issues" };
    }
  }
  
  /**
   * Validates form data for document processing
   * @param {FormData} formData - The form data to validate
   * @returns {Object} Validation result with valid flag and error message
   */
  export function validateFormData(formData) {
    const file = formData.get('file');
    const documentId = formData.get('documentId');
    
    // Maximum allowed file size: 20MB (adjust as needed for your use case)
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'application/msword', // doc
      'text/plain',
      'text/markdown',
      'text/html',
      'application/rtf'
    ];

    // Check if either file or documentId is provided
    if (!file && !documentId) {
      return {
        valid: false,
        error: 'Either a file or document ID must be provided',
        stage: 'input_validation'
      };
    }

    // File validations when a file is provided
    if (file && typeof file !== 'string') {
      // Size validation
      if (file.size > MAX_FILE_SIZE) {
        return {
          valid: false,
          error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          stage: 'size_validation'
        };
      }

      // MIME type validation
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
          valid: false,
          error: `File type ${file.type} is not supported. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
          stage: 'type_validation'
        };
      }
    }

    return {
      valid: true
    };
  }
  
  /**
   * Parses processing options from form data
   * @param {FormData} formData - The form data containing options
   * @param {File} file - Optional file object
   * @returns {Object} Parsed processing options
   */
  export function parseProcessingOptions(formData, file) {
    // Get processing options from form data or use defaults
    const chunkSize = parseInt(formData.get('chunkSize'), 10) || 1000;
    const overlap = parseInt(formData.get('overlap'), 10) || 100;
    const outputFormat = formData.get('outputFormat') || 'openai-jsonl';
    const classFilter = formData.get('classFilter') || 'all';
    const prioritizeImportant = formData.get('prioritizeImportant') === 'true';
    const useCase = formData.get('useCase') || 'rewriter-legal';
    const useTextract = formData.get('useTextract') !== 'false';
    const enableOcr = formData.get('useOcr') === 'true' || false;
    const jobId = formData.get('jobId');

    // Parse timeout values with reasonable defaults to prevent endless processing
    const documentTimeout = parseInt(formData.get('documentTimeout'), 10) || 600000; // 10 minutes
    const chunkTimeout = parseInt(formData.get('chunkTimeout'), 10) || 120000; // 2 minutes
    const extractionTimeout = parseInt(formData.get('extractionTimeout'), 10) || 30000; // 30 seconds
    const classificationTimeout = parseInt(formData.get('classificationTimeout'), 10) || 15000; // 15 seconds
    const variantTimeout = parseInt(formData.get('variantTimeout'), 10) || 20000; // 20 seconds

    // Create memory management options
    const maxTextLength = 500000; // Limit for very large documents - break into smaller chunks
    const memoryLimits = {
      maxTextLength,
      maxChunksPerBatch: 10, // Process at most 10 chunks at a time
      enforceChunkLimit: true, // Always enforce chunk limits
      useStreaming: true // Use streaming for large documents
    };

    // Return combined options
    return {
      chunkSize: Math.min(chunkSize, 2000), // Enforce maximum chunk size for memory safety
      overlap: Math.min(overlap, 200), // Enforce maximum overlap for memory safety
      outputFormat,
      classFilter,
      prioritizeImportant,
      enableOcr,
      useCase,
      useTextract,
      fileName: file ? file.name : null,
      fileType: file ? file.type : null,
      fileSize: file ? file.size : null,
      jobId,
      
      // Add timeout configurations
      documentTimeout: Math.min(documentTimeout, 1200000), // Cap at 20 minutes max
      chunkTimeout: Math.min(chunkTimeout, 180000), // Cap at 3 minutes max
      extractionTimeout: Math.min(extractionTimeout, 60000), // Cap at 1 minute max
      classificationTimeout: Math.min(classificationTimeout, 30000), // Cap at 30 seconds max
      variantTimeout: Math.min(variantTimeout, 30000), // Cap at 30 seconds max
      
      // Add memory management options
      memoryLimits
    };
  }