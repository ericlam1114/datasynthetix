const pdfjs = require('pdfjs-dist/legacy/build/pdf');
const { PDFExtract } = require('pdf.js-extract');
const pdfParse = require('pdf-parse');

// Configure PDF.js worker
if (typeof window === 'undefined') {
  // Node.js environment
  const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

/**
 * Convert a stream to a buffer
 * @param {ReadableStream} stream - The stream to convert
 * @returns {Promise<Buffer>} - The buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Extract text and data from a PDF buffer using multiple extraction methods for resilience
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

/**
 * Extract PDF metadata
 * @param {Buffer} pdfBuffer - The PDF buffer
 * @returns {Promise<Object>} - Metadata object
 */
async function extractPdfMetadata(pdfBuffer) {
  try {
    // Use pdf-parse for metadata extraction
    const data = await pdfParse(pdfBuffer, { max: 1 }); // Only process first page for metadata
    
    return {
      pages: data.numpages || 0,
      info: data.info || {},
      metadata: data.metadata || {},
      version: data.info ? data.info.PDFFormatVersion : null,
      encrypted: data.info ? !!data.info.IsEncrypted : false,
      producer: data.info ? data.info.Producer : null,
      creator: data.info ? data.info.Creator : null
    };
  } catch (error) {
    console.error('Metadata extraction error:', error);
    throw error;
  }
}

/**
 * Extract text with position information
 * @param {Buffer} pdfBuffer - The PDF buffer
 * @returns {Promise<Object>} - Extracted text with position data
 */
async function extractWithPositions(pdfBuffer) {
  // Load the PDF document
  const pdfData = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({
    data: pdfData,
    disableFontFace: true,
    nativeImageDecoderSupport: 'none',
    ignoreErrors: true
  });
  
  const pdf = await loadingTask.promise;
  const pages = [];
  
  // Process each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false
    });
    
    // Group text by line
    const yPositionThreshold = 3; // Pixels threshold for line grouping
    const textByLine = {};
    
    textContent.items.forEach(item => {
      // Round to nearest multiple of threshold for line grouping
      const yPosition = Math.round(item.transform[5] / yPositionThreshold) * yPositionThreshold;
      
      if (!textByLine[yPosition]) {
        textByLine[yPosition] = [];
      }
      
      textByLine[yPosition].push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName
      });
    });
    
    // Sort by vertical position (top to bottom)
    const sortedYPositions = Object.keys(textByLine)
      .map(Number)
      .sort((a, b) => b - a); // Reverse order (top of page first)
    
    // Format lines with proper horizontal ordering
    const lines = [];
    sortedYPositions.forEach(yPosition => {
      // Sort items by x position for proper reading order
      const sortedItems = textByLine[yPosition].sort((a, b) => a.x - b.x);
      
      // Combine items into a line
      const lineText = sortedItems.map(item => item.text).join(' ');
      
      // Skip empty lines
      if (lineText.trim().length === 0) return;
      
      lines.push({
        text: lineText,
        y: yPosition,
        elements: sortedItems
      });
    });
    
    // Store page data
    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      content: lines.map(l => l.text).join('\n'),
      lines: lines
    });
  }
  
  return { pages };
}

/**
 * Extract text only without position data
 * @param {Buffer} pdfBuffer - The PDF buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextOnly(pdfBuffer) {
  try {
    // Try pdf-parse first
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    // If pdf-parse fails, try pdf.js-extract
    const pdfExtract = new PDFExtract();
    const result = await pdfExtract.extractBuffer(pdfBuffer);
    
    if (result && result.pages) {
      return result.pages
        .map(page => 
          page.content
            .map(item => item.str)
            .join(' ')
        )
        .join('\n\n');
    }
    
    throw error;
  }
}

/**
 * Identify document structure (sections and headers)
 * @param {string} text - The extracted text
 * @param {Array} pages - The pages data
 * @returns {Object} - Document structure
 */
function identifyStructure(text, pages) {
  const sections = [];
  const headers = [];
  
  // Simple heuristic: Look for patterns like "1. Introduction", "Section 2:"
  const headerRegex = /^(?:(?:\d+\.|\([A-Z]\)|\([0-9]\)|[A-Z]\.)\s+|Section\s+\d+:?\s+|SECTION\s+\d+:?\s+|Chapter\s+\d+:?\s+|CHAPTER\s+\d+:?\s+)([A-Z][A-Za-z0-9\s]+)(?:$|\n)/gm;
  
  let match;
  let lastIndex = 0;
  
  while ((match = headerRegex.exec(text)) !== null) {
    const headerText = match[1].trim();
    const startIndex = match.index;
    
    // If we found a previous section, close it
    if (sections.length > 0) {
      const prevSection = sections[sections.length - 1];
      prevSection.content = text.substring(prevSection.startIndex, startIndex).trim();
      prevSection.endIndex = startIndex;
    }
    
    // Add the new section
    sections.push({
      title: headerText,
      startIndex: startIndex,
      endIndex: null,
      content: ''
    });
    
    // Add to headers array
    headers.push({
      text: headerText,
      index: startIndex,
      level: estimateHeaderLevel(headerText)
    });
    
    lastIndex = startIndex;
  }
  
  // Close the last section
  if (sections.length > 0) {
    const lastSection = sections[sections.length - 1];
    lastSection.content = text.substring(lastSection.startIndex).trim();
    lastSection.endIndex = text.length;
  }
  
  // If no sections were found by regex, try another approach with page headers
  if (sections.length === 0 && pages && pages.length > 0) {
    for (const page of pages) {
      if (page.lines && page.lines.length > 0) {
        // Check the first few lines for potential headers
        const potential = page.lines.slice(0, Math.min(3, page.lines.length));
        
        for (const line of potential) {
          if (line.text.length > 3 && line.text.length < 100 && 
              (line.text.toUpperCase() === line.text || 
               line.text.match(/^[A-Z][a-z]+ [A-Z][a-z]+/))) {
            
            headers.push({
              text: line.text.trim(),
              index: -1, // No absolute position in full text
              level: estimateHeaderLevel(line.text)
            });
            
            break;
          }
        }
      }
    }
  }
  
  return { sections, headers };
}

/**
 * Estimate header level based on text properties
 * @param {string} headerText - The header text
 * @returns {number} - Estimated header level (1, 2, 3)
 */
function estimateHeaderLevel(headerText) {
  // Simple heuristic - shorter all-caps headers are higher level
  if (headerText.toUpperCase() === headerText) {
    if (headerText.length < 20) return 1;
    return 2;
  }
  
  if (headerText.length < 30) return 2;
  return 3;
}

module.exports = {
  extractPdfData,
  extractPdfMetadata,
  extractWithPositions,
  extractTextOnly
}; 