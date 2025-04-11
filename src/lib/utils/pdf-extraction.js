/**
 * @param {Buffer|ReadableStream} pdfData - A buffer or stream containing the PDF data
 * @param {Object} options - Additional options
 * @param {boolean} options.includePosition - Whether to include position data for text elements
 * @param {boolean} options.extractTables - Whether to attempt table extraction
 * @param {boolean} options.extractMetadata - Whether to extract document metadata
 * @param {string} options.outputType - Output format ('json' or 'text')
 * @param {Object} options.logger - Optional logger object (must have debug, info, warn, error methods)
 * @param {Function} options.progressCallback - Optional callback function to report progress (receives percentage 0-100)
 * @returns {Promise<Object>} - Returns extraction results
 */
async function extractPdfData(pdfData, options = {}) {
  const {
    includePosition = true,
    extractTables = true,
    extractMetadata = true,
    outputType = 'json',
    logger = console
  } = options;
  
  const progressCallback = options.progressCallback || ((_) => {});
  
  let results = {
    status: 'pending',
    text: '',
    pages: [],
    metadata: {},
    tables: [],
    sections: [],
    headers: [],
    error: null
  };
  
  try {
    logger.info('Starting PDF extraction process');
    progressCallback(5); // Started processing
    
    // Convert stream to buffer if needed
    let pdfBuffer;
    if (pdfData instanceof Buffer) {
      pdfBuffer = pdfData;
    } else if (typeof pdfData === 'string') {
      pdfBuffer = Buffer.from(pdfData);
    } else {
      // Handle stream
      pdfBuffer = await streamToBuffer(pdfData);
    }
    
    logger.debug(`PDF data loaded: ${pdfBuffer.length} bytes`);
    progressCallback(10); // Data loaded
    
    // Extract metadata first
    if (extractMetadata) {
      try {
        logger.debug('Extracting PDF metadata');
        const metadata = await extractPdfMetadata(pdfBuffer);
        results.metadata = metadata;
        logger.debug('Metadata extraction complete');
        progressCallback(20); // Metadata extracted
      } catch (error) {
        logger.warn('Failed to extract metadata:', error);
        results.metadata = { error: error.message };
      }
    }
    
    // Try position-aware extraction first with PDF.js
    try {
      if (includePosition) {
        logger.debug('Attempting position-aware extraction with PDF.js');
        const positionData = await extractWithPositions(pdfBuffer);
        results.pages = positionData.pages;
        results.text = positionData.pages.map(p => p.content).join('\n\n');
        logger.debug('Position extraction complete');
        progressCallback(50); // Position extraction complete
      }
    } catch (error) {
      logger.warn('Position-aware extraction failed:', error);
      results.error = `Position extraction failed: ${error.message}`;
    }
    
    // If position extraction failed or wasn't requested, fall back to simpler extraction
    if (!results.text || results.text.length < 100) {
      try {
        logger.debug('Falling back to standard text extraction');
        const textData = await extractTextOnly(pdfBuffer);
        
        // Only override if we got meaningful results
        if (textData && textData.length > results.text.length) {
          results.text = textData;
          
          // Create simple pages array if we didn't get position data
          if (!results.pages.length && results.metadata.pages) {
            const avgCharsPerPage = Math.ceil(textData.length / results.metadata.pages);
            results.pages = Array.from({ length: results.metadata.pages }, (_, i) => {
              const start = i * avgCharsPerPage;
              const end = Math.min(start + avgCharsPerPage, textData.length);
              return {
                pageNumber: i + 1,
                content: textData.substring(start, end),
                elements: []
              };
            });
          }
        }
        logger.debug('Text extraction complete');
        progressCallback(70); // Text extraction complete
      } catch (error) {
        logger.warn('Text extraction failed:', error);
        if (!results.text) {
          results.error = `Text extraction failed: ${error.message}`;
          throw error; // Re-throw if we couldn't get any text
        }
      }
    }
    
    // Extract tables if requested
    if (extractTables && results.text) {
      try {
        logger.debug('Attempting table extraction');
        results.tables = await extractTables(pdfBuffer, results.pages);
        logger.debug(`Table extraction complete: ${results.tables.length} tables found`);
        progressCallback(85); // Table extraction complete
      } catch (error) {
        logger.warn('Table extraction failed:', error);
        results.tables = [];
      }
    }
    
    // Identify sections and headers
    if (results.text) {
      try {
        logger.debug('Identifying document structure');
        const structure = identifyStructure(results.text, results.pages);
        results.sections = structure.sections;
        results.headers = structure.headers;
        logger.debug(`Structure identification complete: ${results.sections.length} sections found`);
        progressCallback(95); // Structure identification complete
      } catch (error) {
        logger.warn('Structure identification failed:', error);
      }
    }
    
    results.status = 'complete';
    progressCallback(100); // Processing complete
    
    // Format output based on requested type
    if (outputType === 'text') {
      return {
        status: results.status,
        text: results.text,
        metadata: results.metadata,
        error: results.error
      };
    }
    
    return results;
  } catch (error) {
    logger.error('PDF extraction failed:', error);
    results.status = 'error';
    results.error = error.message;
    progressCallback(100); // Error, but processing complete
    return results;
  }
} 