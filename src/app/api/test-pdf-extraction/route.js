import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Function to check if text extraction worked - copy from process-document route
function validateExtractedText(text) {
  if (!text || text.length < 25) {  // Reduced threshold to 25 characters
    console.log("❌ Text extraction failed or produced insufficient content");
    console.log(`Text length: ${text?.length || 0} characters`);
    return { valid: false, reason: "insufficient_content" };
  }
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{3,}\b/.test(text); // Has words of at least 3 chars
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  
  if (containsWords && (hasPunctuation || hasSpaces)) {
    console.log("✅ Text extraction appears successful");
    return { valid: true };
  } else {
    console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
    return { valid: false, reason: "text_quality_issues" };
  }
}

// PDF text extraction - copy from process-document route
async function extractTextFromPdf(buffer) {
  try {
    console.log("Starting PDF text extraction");
    console.log(`File size: ${buffer.length} bytes`);
    
    // Basic PDF signature check
    const signature = buffer.slice(0, 5).toString();
    console.log(`File signature: ${signature}`);
    if (signature !== '%PDF-') {
      console.log("❌ Invalid PDF signature! This may not be a valid PDF file.");
    }
    
    // Import pdf.js dynamically
    const pdfjs = await import("pdfjs-dist");
    const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry");

    // Configure worker
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

    // Convert Buffer to Uint8Array for pdf.js
    const uint8Array = new Uint8Array(buffer);
    console.log("Buffer converted to Uint8Array");

    // Load document with options to improve extraction
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none',
      ignoreErrors: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);

    let extractedText = "";
    let extractionStats = {
      totalPages: pdf.numPages,
      pagesWithContent: 0,
      totalItems: 0
    };

    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        console.log(`Processing page ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i);
        
        // Try to get text content with optimized options
        const textContent = await page.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        });
        
        // Get all text items on the page
        let items = textContent.items;
        extractionStats.totalItems += items.length;
        console.log(`Found ${items.length} text items on page ${i}`);
        
        // Group text items by their approximate vertical position (y-coordinate)
        // This helps maintain reading order when text is arranged in columns
        const yPositionThreshold = 5; // Adjust based on document characteristics
        const textByVerticalPosition = {};
        
        items.forEach(item => {
          // Round the y-position to group nearby items
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
        
        if (pageText.trim().length > 0) {
          extractionStats.pagesWithContent++;
          extractedText += pageText + "\n\n";
        }
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
      }
    }
    
    console.log(`PDF extraction stats: ${extractionStats.pagesWithContent}/${extractionStats.totalPages} pages with content, ${extractionStats.totalItems} text items`);
    
    // Validate extracted text
    const validationResult = validateExtractedText(extractedText);
    
    // Try simpler extraction method as first fallback if validation failed
    if (!validationResult.valid) {
      console.log(`Attempting fallback extraction method due to validation failure: ${validationResult.reason}`);
      
      // Simple fallback method without position grouping
      let fallbackText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent({
            normalizeWhitespace: true, 
            disableCombineTextItems: true // Different setting than primary method
          });
          
          // Simple concatenation of text items
          const pageText = textContent.items
            .map(item => item.str)
            .join(" ");
            
          if (pageText.trim().length > 0) {
            fallbackText += pageText + "\n\n";
          }
        } catch (pageError) {
          console.error(`Error in fallback processing page ${i}:`, pageError);
        }
      }
      
      // Check if fallback method was more successful
      const fallbackValidation = validateExtractedText(fallbackText);
      if (fallbackValidation.valid || fallbackText.length > extractedText.length * 1.2) {
        console.log("Fallback extraction method produced better results, using this instead.");
        extractedText = fallbackText;
      }
    }

    // Provide detailed warnings for debugging
    const finalValidation = validateExtractedText(extractedText);
    if (!finalValidation.valid) {
      console.log(`Warning: Final text validation failed with reason: ${finalValidation.reason}`);
    } else {
      console.log(`Successfully extracted and validated ${extractedText.length} characters from PDF`);
    }

    // Always return whatever text we could extract, let the client handle empty text
    return extractedText || "";
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    // Return empty string instead of throwing, let the caller handle empty text
    return "";
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  
  if (!filePath) {
    return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
  }
  
  try {
    const absPath = path.join(process.cwd(), filePath);
    console.log(`Attempting to read file: ${absPath}`);
    
    const fileBuffer = await fs.readFile(absPath);
    console.log(`Successfully read file: ${fileBuffer.length} bytes`);
    
    // Extract text from the PDF
    const extractedText = await extractTextFromPdf(fileBuffer);
    const validationResult = validateExtractedText(extractedText);
    
    return NextResponse.json({
      fileName: path.basename(filePath),
      fileSize: fileBuffer.length,
      textLength: extractedText.length,
      textSample: extractedText.substring(0, 500),
      validation: validationResult,
      isValid: validationResult.valid
    });
  } catch (error) {
    console.error('Error in test-pdf-extraction:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Check if it's a PDF file
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }
    
    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Extract text from the PDF
    const extractedText = await extractTextFromPdf(buffer);
    const validationResult = validateExtractedText(extractedText);
    
    return NextResponse.json({
      fileName: file.name,
      fileSize: buffer.length,
      textLength: extractedText.length,
      textSample: extractedText.substring(0, 500),
      validation: validationResult,
      isValid: validationResult.valid
    });
  } catch (error) {
    console.error('Error in test-pdf-extraction:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
} 