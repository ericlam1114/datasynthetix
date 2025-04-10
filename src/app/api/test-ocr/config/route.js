import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Check if OCR is enabled based on environment variables
    const ocrEnabled = process.env.ENABLE_OCR === 'true' || process.env.NODE_ENV === 'production';
    
    // Return OCR configuration status
    return NextResponse.json({
      ocrEnabled,
      environment: process.env.NODE_ENV,
      pdfJsVersion: require('pdfjs-dist/package.json').version,
      canvasAvailable: typeof require('canvas') !== 'undefined',
      tesseractAvailable: typeof require('tesseract.js') !== 'undefined',
    });
  } catch (error) {
    // If there's an error checking dependencies, return what we can
    return NextResponse.json({
      ocrEnabled: process.env.ENABLE_OCR === 'true' || process.env.NODE_ENV === 'production',
      environment: process.env.NODE_ENV,
      error: error.message,
    });
  }
} 