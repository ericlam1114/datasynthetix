import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { extractTextFromPdf } from "../process-document/utils/extractText";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { validateExtractedText } from "../process-document/route";

// Test endpoint for PDF extraction with OCR
export async function POST(request) {
  console.log("Running PDF OCR test");
  
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const userId = formData.get("userId") || "test-user";
    const useOcr = formData.get("useOcr") === "true";
    
    if (!file) {
      return NextResponse.json({
        error: "No file provided",
        message: "Please upload a PDF file to test"
      }, { status: 400 });
    }
    
    // Get the file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Log information about the file
    console.log(`Testing PDF extraction for file: ${file.name}, size: ${buffer.length} bytes`);
    console.log(`OCR enabled: ${useOcr}`);
    
    // Extract text from the PDF
    console.log("Starting text extraction...");
    const startTime = Date.now();
    
    const text = await extractTextFromPdf(buffer, {
      useOcr: useOcr,
      attemptAlternativeMethods: true
    });
    
    const extractionTime = Date.now() - startTime;
    console.log(`Text extraction completed in ${extractionTime}ms`);
    console.log(`Extracted ${text?.length || 0} characters of text`);
    
    // Validate the extracted text
    const validation = validateExtractedText(text);
    console.log(`Text validation result: ${validation.valid ? "Valid" : "Invalid"}`);
    if (!validation.valid) {
      console.log(`Validation failure reason: ${validation.reason}`);
    }
    
    // Save the result to storage
    let uploadResult = null;
    
    try {
      console.log("Uploading file to storage...");
      
      // Upload the original file
      const storage = getStorage();
      const storageRef = ref(storage, `test-documents/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, buffer, {
        contentType: file.type,
      });
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      uploadResult = {
        fileName: file.name,
        path: snapshot.ref.fullPath,
        url: downloadURL,
      };
      
      console.log(`File uploaded to: ${uploadResult.path}`);
      
      // Save the extracted text to Firestore
      console.log("Saving result to Firestore...");
      const db = getFirestore();
      const testDocRef = doc(db, "test-results", `ocr-test-${Date.now()}`);
      
      await setDoc(testDocRef, {
        userId,
        fileName: file.name,
        filePath: uploadResult.path,
        fileUrl: uploadResult.url,
        extractedTextLength: text?.length || 0,
        textValidation: validation,
        ocrEnabled: useOcr,
        processingTimeMs: extractionTime,
        createdAt: serverTimestamp(),
      });
      
      console.log("Test result saved to Firestore");
    } catch (storageError) {
      console.error("Storage or Firestore operation failed:", storageError);
    }
    
    // Save the extracted text to a local file for inspection
    try {
      const uploadsDir = path.join(process.cwd(), "uploads");
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const textFilePath = path.join(uploadsDir, `extracted-text-${Date.now()}.txt`);
      await fs.writeFile(textFilePath, text || "No text extracted");
      
      console.log(`Extracted text saved to: ${textFilePath}`);
    } catch (fileError) {
      console.error("Error saving extracted text to file:", fileError);
    }
    
    // Return the result
    return NextResponse.json({
      success: true,
      fileName: file.name,
      extractedTextLength: text?.length || 0,
      textValidation: validation,
      processingTimeMs: extractionTime,
      storage: uploadResult,
      textPreview: text ? text.substring(0, 500) + "..." : "No text extracted",
    });
    
  } catch (error) {
    console.error("PDF OCR test failed:", error);
    
    return NextResponse.json({
      error: "Test failed",
      message: error.message,
    }, { status: 500 });
  }
} 