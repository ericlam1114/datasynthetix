# PDF Extraction Testing Guide

## Available PDF Test Files

Based on our comprehensive testing, the following PDF files are available and suitable for extraction testing:

| File Name | Size | Pages | Text Content | Status |
|-----------|------|-------|-------------|--------|
| Buffy Podcasts - Acquisitions.pdf | 1012 KB | 7 | 2189 chars | ✅ Good |
| Commercial Tax Appeal Inquiry Questionnaire.pdf | 51 KB | 2 | 2247 chars | ✅ Good |
| large-test-doc.pdf | 683 KB | 7 | 6351 chars | ✅ Good |
| temp_test_document.pdf | 1012 KB | 7 | 2189 chars | ✅ Good |
| test_doc.pdf | 4.7 MB | 120 | 570823 chars | ✅ Good |
| textract-test-doc.pdf | 1.56 KB | 1 | 562 chars | ✅ Good |
| test_docs/sample.pdf | 8.1 KB | 30 | 1272 chars | ✅ Good |
| sample-test-doc.pdf | 0 KB | - | - | ❌ Empty file |
| sample.pdf | 0 KB | - | - | ❌ Empty file |
| temp_test_file.pdf | 0 KB | - | - | ❌ Empty file |
| test-doc.pdf | 0 KB | - | - | ❌ Empty file |
| test-sample.pdf | 1.3 KB | - | - | ❌ Corrupt file |

## Extraction Methods

We have tested several extraction methods:

1. **Standard PDF.js Extraction**
   - Reliable for most PDF files with text content
   - Configuration options that improve extraction:
     ```javascript
     const loadingTask = pdfjs.getDocument({ 
       data: uint8Array,
       disableFontFace: true,
       nativeImageDecoderSupport: 'none',
       ignoreErrors: true
     });
     ```

2. **Enhanced Position-Aware Extraction**
   - Preserves text layout better
   - Groups text by vertical position
   - Sorts text elements within each line from left to right
   - Slightly more text extracted (+2 characters in our test case)

3. **OCR Fallback** (not directly tested but available in code)
   - Can be used when standard extraction fails
   - Useful for scanned documents or images

## Recommended Testing Approach

1. For quick basic testing:
   ```javascript
   node test-pdf.js
   ```
   This will run a test against one of the PDF files and show both standard and enhanced extraction results.

2. For comprehensive testing of all PDFs:
   ```javascript
   node test-multiple-pdfs.js
   ```
   This will test extraction on all PDF files in the root directory and provide a summary of results.

3. For testing a specific PDF:
   ```javascript
   // Modify the path in test-specific-pdf.js
   testSpecificPdf('./path/to/your/file.pdf');
   
   // Then run
   node test-specific-pdf.js
   ```

## Common Issues

1. **Empty PDF Files**
   - Several test files are empty (0 KB)
   - These will throw an error: `InvalidPDFException: The PDF file is empty, i.e. its size is zero bytes.`

2. **Font Warnings**
   - You may see warnings about fetchStandardFontData failures
   - Example: `Warning: fetchStandardFontData: failed to fetch file "FoxitSans.pfb"`
   - These warnings generally don't affect extraction quality

3. **Corrupt PDF Files**
   - Some files may have encoding issues
   - Error: `Bad encoding in flate stream`

## Extraction Code Implementation

For the best results, use this extraction function:

```javascript
async function extractTextFromPdf(buffer) {
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    
    // Load document with optimized options
    const loadingTask = pdfjs.getDocument({ 
      data: uint8Array,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none',
      ignoreErrors: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
    
    let extractedText = "";
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        });
        
        // Group text items by vertical position
        const yPositionThreshold = 5;
        const textByVerticalPosition = {};
        
        textContent.items.forEach(item => {
          const yPosition = Math.round(item.transform[5] / yPositionThreshold) * yPositionThreshold;
          
          if (!textByVerticalPosition[yPosition]) {
            textByVerticalPosition[yPosition] = [];
          }
          
          textByVerticalPosition[yPosition].push(item);
        });
        
        // Sort by vertical position (top to bottom)
        const sortedYPositions = Object.keys(textByVerticalPosition).sort((a, b) => b - a);
        
        let pageText = "";
        // For each vertical position, sort items horizontally (left to right)
        sortedYPositions.forEach(yPosition => {
          textByVerticalPosition[yPosition].sort((a, b) => a.transform[4] - b.transform[4]);
          
          // Add the text for this line
          const lineText = textByVerticalPosition[yPosition].map(item => item.str).join(" ");
          pageText += lineText + "\n";
        });
        
        extractedText += pageText + "\n\n";
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error("Error in PDF extraction:", error);
    return "";
  }
}
```

## Validating Extraction Results

You can use this function to validate extraction quality:

```javascript
function validateExtractedText(text) {
  if (!text || text.length < 50) {
    return {
      valid: false,
      reason: "Insufficient text extracted",
      details: { length: text?.length || 0 }
    };
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  if (containsWords && (hasPunctuation || hasSpaces)) {
    return {
      valid: true,
      details: {
        length: text.length,
        hasWords: containsWords,
        hasPunctuation,
        hasSpaces
      }
    };
  } else {
    return {
      valid: false,
      reason: "Content doesn't appear to be valid text",
      details: {
        length: text.length,
        hasWords: containsWords,
        hasPunctuation,
        hasSpaces
      }
    };
  }
}
``` 