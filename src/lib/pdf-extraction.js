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
 * Extract text and data from a PDF buffer using multiple extraction methods for resilience
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {Object} options - Options for extraction
 * @returns {Promise<Object>} - The extracted data with text content and structure
 */
async function extractPdfData(pdfBuffer, options = {}) {
  const {
    attemptAllMethods = true, // Try all methods even if one succeeds
    logProgress = false,
    detectTables = true,
    extractForms = true,
    extractImages = false // Images require additional processing and storage
  } = options;

  // Tracking for extraction methods and their results
  const extractionResults = [];
  let extractedData = {
    textContent: '',
    pages: [],
    tables: [],
    forms: [],
    metadata: {},
    structure: {
      sections: [],
      headers: []
    }
  };
  
  const log = (...args) => {
    if (logProgress) console.log(...args);
  };
  
  log(`Starting PDF extraction with ${pdfBuffer.length} bytes`);
  
  try {
    // Check if valid PDF
    if (!isPdfBuffer(pdfBuffer)) {
      throw new Error('Not a valid PDF buffer');
    }
    
    // Extract metadata when possible
    try {
      extractedData.metadata = await extractMetadata(pdfBuffer);
      log('Metadata extracted:', extractedData.metadata);
    } catch (err) {
      log('Metadata extraction failed:', err.message);
    }
    
    // Method 1: Position-aware PDF.js extraction (most reliable for layout)
    try {
      log('Attempting extraction using PDF.js with position-aware layout...');
      
      // Load the PDF document
      const pdfData = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({
        data: pdfData,
        disableFontFace: true,
        nativeImageDecoderSupport: 'none',
        ignoreErrors: true
      });
      
      const pdf = await loadingTask.promise;
      
      log(`PDF loaded with ${pdf.numPages} pages`);
      
      // Store page count
      extractedData.pageCount = pdf.numPages;
      
      // Extract text from each page
      let allPageTexts = [];
      const pages = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false
          });
          
          // Extract page size
          const viewport = page.getViewport({ scale: 1.0 });
          
          // Group text items by vertical position for better line recognition
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
              items: sortedItems
            });
          });
          
          // Detect headers by font characteristics or position
          const headers = [];
          let currentSection = null;
          
          lines.forEach((line, index) => {
            // Heuristics for header detection:
            // 1. Shorter lines at the beginning of groups
            // 2. Lines with different font characteristics
            // 3. Lines that are followed by empty space
            const isPotentialHeader = 
              (line.text.length < 100 && line.text.length > 5) &&
              (index === 0 || lines[index-1].y - line.y > 15) &&
              (line.text.trim().endsWith(':') || 
               line.text.match(/^[A-Z0-9\s]{3,50}$/));
            
            if (isPotentialHeader) {
              const header = {
                text: line.text.trim(),
                level: estimateHeaderLevel(line, lines, index),
                y: line.y
              };
              
              headers.push(header);
              
              // Start a new section
              currentSection = {
                title: header.text,
                content: '',
                lines: []
              };
              
              extractedData.structure.sections.push(currentSection);
            } else if (currentSection) {
              // Add to current section
              currentSection.content += line.text + '\n';
              currentSection.lines.push(line);
            }
          });
          
          // Store page data
          const pageData = {
            number: pageNum,
            width: viewport.width,
            height: viewport.height,
            text: lines.map(l => l.text).join('\n'),
            lines: lines,
            headers: headers
          };
          
          pages.push(pageData);
          allPageTexts.push(pageData.text);
          
          if (pageNum % 10 === 0 || pageNum === pdf.numPages) {
            log(`Processed ${pageNum}/${pdf.numPages} pages with PDF.js position-aware method`);
          }
        } catch (pageErr) {
          log(`Error extracting page ${pageNum}: ${pageErr.message}`);
        }
      }
      
      // Combine all page texts
      const combinedText = allPageTexts.join('\n\n');
      
      extractionResults.push({
        method: 'pdfjs-position',
        text: combinedText,
        length: combinedText.length,
        pages: pages
      });
      
      // Use this result if it's good enough
      if (!attemptAllMethods && combinedText.length > 200) {
        extractedData.textContent = combinedText;
        extractedData.pages = pages;
        extractedData.structure.headers = 
          pages.flatMap(page => page.headers || []);
      }
    } catch (pdfJsError) {
      log('Position-aware PDF.js extraction failed:', pdfJsError.message);
    }
    
    // Method 2: PDF.js-extract library (better for some PDFs)
    try {
      log('Attempting extraction using pdf.js-extract...');
      
      const pdfExtract = new PDFExtract();
      const extractOptions = {
        normalizeWhitespace: true,
        disableCombineTextItems: false
      };
      
      const extractResult = await pdfExtract.extractBuffer(pdfBuffer, extractOptions);
      
      // Process extracted data
      if (extractResult && extractResult.pages) {
        const extractPages = [];
        const allTexts = [];
        
        for (const page of extractResult.pages) {
          const pageText = page.content
            .map(item => item.str)
            .join(' ');
          
          allTexts.push(pageText);
          extractPages.push({
            number: page.pageInfo.num,
            width: page.pageInfo.width,
            height: page.pageInfo.height,
            text: pageText,
            content: page.content
          });
        }
        
        const combinedText = allTexts.join('\n\n');
        
        extractionResults.push({
          method: 'pdf.js-extract',
          text: combinedText,
          length: combinedText.length,
          pages: extractPages
        });
      }
    } catch (extractError) {
      log('PDF.js-extract extraction failed:', extractError.message);
    }
    
    // Method 3: pdf-parse (simple but sometimes works better)
    try {
      log('Attempting extraction using pdf-parse...');
      
      const parseData = await pdfParse(pdfBuffer);
      if (parseData && parseData.text) {
        extractionResults.push({
          method: 'pdf-parse',
          text: parseData.text,
          length: parseData.text.length,
          metadata: {
            pages: parseData.numpages,
            info: parseData.info
          }
        });
      }
    } catch (parseError) {
      log('pdf-parse extraction failed:', parseError.message);
    }
    
    // Choose the best extraction based on results
    if (extractionResults.length > 0) {
      // Sort by text length (descending)
      extractionResults.sort((a, b) => b.length - a.length);
      
      // If we attempted all methods, use the best one
      if (attemptAllMethods || !extractedData.textContent) {
        const bestResult = extractionResults[0];
        log(`Using best extraction method: ${bestResult.method} with ${bestResult.length} characters`);
        
        extractedData.textContent = bestResult.text;
        
        if (bestResult.pages) {
          extractedData.pages = bestResult.pages;
        }
        
        if (bestResult.metadata) {
          extractedData.metadata = {
            ...extractedData.metadata,
            ...bestResult.metadata
          };
        }
      }
      
      // If text is still missing, combine results
      if (!extractedData.textContent || extractedData.textContent.length < 100) {
        log('Combining extraction results for better coverage');
        extractedData.textContent = extractionResults
          .map(r => r.text)
          .join('\n\n');
      }
    }
    
    // Extract structured data if content was found
    if (extractedData.textContent && extractedData.textContent.length > 50) {
      // Attempt table detection if requested
      if (detectTables) {
        extractedData.tables = detectTablesInText(extractedData);
      }
      
      // Additional structure detection
      enrichStructuralData(extractedData);
    } else {
      log('Warning: Extracted insufficient text content');
    }
    
    return extractedData;
    
  } catch (error) {
    log('Critical PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Detect if buffer is likely a PDF file
 */
function isPdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  
  // Check for PDF signature at start of file
  const signature = buffer.slice(0, 5).toString();
  return signature === '%PDF-';
}

/**
 * Extract metadata from PDF
 */
async function extractMetadata(pdfBuffer) {
  try {
    // Use pdf-parse for metadata extraction
    const data = await pdfParse(pdfBuffer);
    
    return {
      pageCount: data.numpages || 0,
      info: data.info || {},
      metadata: data.metadata || {},
      pages: data.numpages
    };
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return {};
  }
}

/**
 * Estimate header level based on context
 */
function estimateHeaderLevel(line, lines, index) {
  // Simple heuristic - shorter lines with fewer nearby lines are higher level
  const lineLength = line.text.length;
  
  if (lineLength < 20) return 1;  // Very short line - likely main header
  if (lineLength < 40) return 2;  // Medium line - likely subheader
  return 3;  // Longer line - likely sub-subheader
}

/**
 * Detect tables in the extracted text
 */
function detectTablesInText(extractedData) {
  const tables = [];
  const { pages, textContent } = extractedData;
  
  // Basic table detection based on alignment patterns
  if (!pages || pages.length === 0) return tables;
  
  // Looking for consistent alignment patterns that suggest tables
  for (const page of pages) {
    if (!page.lines || page.lines.length === 0) continue;
    
    let potentialTableLines = [];
    let inPotentialTable = false;
    
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      
      // Skip very short lines
      if (line.text.trim().length < 5) continue;
      
      // Look for lines with multiple spaces or tab-like separations
      const hasTabulatedData = 
        (line.text.includes('  ') && line.text.split('  ').length >= 3) ||
        line.text.includes('\t') ||
        (line.items && line.items.length >= 3 && 
         areItemsAligned(line.items));
      
      if (hasTabulatedData) {
        if (!inPotentialTable) {
          inPotentialTable = true;
          potentialTableLines = [];
        }
        potentialTableLines.push(line);
      } else if (inPotentialTable) {
        // End of potential table
        if (potentialTableLines.length >= 3) {
          // We found enough lines to consider it a table
          tables.push(processTableLines(potentialTableLines, page.number));
        }
        inPotentialTable = false;
      }
    }
    
    // Check for table at end of page
    if (inPotentialTable && potentialTableLines.length >= 3) {
      tables.push(processTableLines(potentialTableLines, page.number));
    }
  }
  
  return tables;
}

/**
 * Check if text items in a line are aligned in a way that suggests columns
 */
function areItemsAligned(items) {
  // If we have very few items, it's not a table
  if (items.length < 3) return false;
  
  // Check if items are spaced out horizontally
  const xPositions = items.map(item => item.x);
  
  // Check average distance between items
  let totalDistance = 0;
  for (let i = 1; i < xPositions.length; i++) {
    totalDistance += xPositions[i] - xPositions[i-1];
  }
  
  const avgDistance = totalDistance / (xPositions.length - 1);
  
  // Check if consistent spacing exists
  let consistentSpacing = true;
  for (let i = 1; i < xPositions.length; i++) {
    const distance = xPositions[i] - xPositions[i-1];
    if (Math.abs(distance - avgDistance) > avgDistance * 0.5) {
      consistentSpacing = false;
      break;
    }
  }
  
  return consistentSpacing;
}

/**
 * Process lines that are likely a table
 */
function processTableLines(lines, pageNumber) {
  // Extract header row (first line)
  const headerText = lines[0].text;
  
  // Process columns based on spaces and item positions
  const columns = [];
  const rows = [];
  
  // Try to detect columns based on consistent spaces
  for (const line of lines) {
    const row = [];
    if (line.items && line.items.length > 2) {
      // Use item positions to determine columns
      const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
      for (const item of sortedItems) {
        row.push(item.text);
      }
    } else {
      // Split by double spaces
      const cells = line.text.split(/\s{2,}/g).filter(cell => cell.trim().length > 0);
      row.push(...cells);
    }
    rows.push(row);
  }
  
  return {
    pageNumber,
    rows,
    headerRow: rows[0] || [],
    text: lines.map(l => l.text).join('\n')
  };
}

/**
 * Enrich the extracted data with additional structural information
 */
function enrichStructuralData(extractedData) {
  const { textContent, pages } = extractedData;
  
  // Find potential section headers if not already found
  if ((!extractedData.structure.sections || extractedData.structure.sections.length === 0) && textContent) {
    const sections = [];
    
    // Look for header patterns like "1. Introduction" or "Section 1: Introduction"
    const headerRegex = /^(?:(?:\d+\.|\([A-Z]\)|\([0-9]\)|[A-Z]\.)\s+|Section\s+\d+:?\s+|SECTION\s+\d+:?\s+|Chapter\s+\d+:?\s+|CHAPTER\s+\d+:?\s+)([A-Z][ A-Za-z0-9\s]+)(?:$|\n)/gm;
    
    let match;
    let lastIndex = 0;
    
    while ((match = headerRegex.exec(textContent)) !== null) {
      const headerText = match[1].trim();
      const startIndex = match.index;
      
      // If we found a previous section, close it
      if (sections.length > 0) {
        const prevSection = sections[sections.length - 1];
        prevSection.content = textContent.substring(prevSection.startIndex, startIndex).trim();
      }
      
      // Add the new section
      sections.push({
        title: headerText,
        startIndex: startIndex,
        endIndex: null,
        content: ''
      });
      
      lastIndex = startIndex;
    }
    
    // Close the last section
    if (sections.length > 0) {
      const lastSection = sections[sections.length - 1];
      lastSection.content = textContent.substring(lastSection.startIndex).trim();
    }
    
    extractedData.structure.sections = sections;
  }
  
  return extractedData;
}

module.exports = {
  extractPdfData,
  isPdfBuffer
}; 