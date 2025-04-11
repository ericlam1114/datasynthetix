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
    // For existing documents
    const documentId = formData.get('documentId');
    if (documentId) {
      return { valid: true };
    }
    
    // For new uploads
    const file = formData.get('file');
    if (!file) {
      return { 
        valid: false, 
        error: 'File is required for new document uploads',
        stage: 'validation'
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Parses processing options from form data
   * @param {FormData} formData - The form data containing options
   * @param {File} file - Optional file object
   * @returns {Object} Parsed processing options
   */
  export function parseProcessingOptions(formData, file = null) {
    return {
      name: formData.get('name') || (file ? file.name : ''),
      description: formData.get('description') || '',
      chunkSize: parseInt(formData.get('chunkSize') || 1000, 10),
      overlap: parseInt(formData.get('overlap') || 100, 10),
      outputFormat: formData.get('outputFormat') || 'jsonl',
      classFilter: formData.get('classFilter') || 'all',
      prioritizeImportant: formData.get('prioritizeImportant') === 'true',
      enableOcr: formData.get('enableOcr') === 'true' || process.env.USE_OCR === 'true',
      maxClauses: parseInt(formData.get("maxClauses") || 0, 10),
      maxVariants: parseInt(formData.get("maxVariants") || 3, 10),
      // Timeouts
      documentTimeout: parseInt(formData.get("documentTimeout") || 600000, 10),
      chunkTimeout: parseInt(formData.get("chunkTimeout") || 120000, 10),
      extractionTimeout: parseInt(formData.get("extractionTimeout") || 30000, 10),
      classificationTimeout: parseInt(formData.get("classificationTimeout") || 15000, 10),
      variantTimeout: parseInt(formData.get("variantTimeout") || 20000, 10),
    };
  }