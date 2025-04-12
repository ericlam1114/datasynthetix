// src/app/api/process-document/services/document-processing.js
import path from "path";
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { extractTextFromPdf, extractTextFromTxt } from "../utils/extractText";
import { extractTextFromPdfWithTextract } from '../utils/extractText';
import { validateExtractedText } from "../utils/validators";
import { getAdminFirestore, getAdminStorage } from "../../../../lib/firebase-admin";
import { extractTextFromPdf as extractPdfText } from '../utils/reliablePdfExtractor';

// Conditionally import mammoth
let mammoth;
try {
  mammoth = require("mammoth");
} catch (error) {
  console.warn("Mammoth library not available:", error.message);
  mammoth = null;
}

/**
 * Processes an existing document from Firestore
 */
export async function processExistingDocument(userId, documentId, processingOptions = {}, jobId, hasAdminCredentials) {
  console.log(`Processing existing document with ID: ${documentId}`);
  
  try {
    // Get document from Firestore
    const documentData = await getDocumentFromFirestore(documentId, hasAdminCredentials);
    
    if (!documentData) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    // Check if document belongs to user
    if (documentData.userId !== userId && !hasAdminCredentials) {
      // TEMPORARY BYPASS: Check if we're running in fallback mode
      if (process.env.FIREBASE_ADMIN_FALLBACK_MODE === 'true') {
        console.warn(`⚠️ DEVELOPER MODE: Bypassing document authorization check for document ${documentId}`);
        console.warn(`Document owner: ${documentData.userId}, Request user: ${userId}`);
      } else {
        throw new Error("Not authorized to process this document");
      }
    }
    
    // Get text content from document
    let text = documentData.content || documentData.text || "";
    console.log(`Retrieved document content: ${text.length} characters`);
    
    // If there's a file path but no content, try to get from storage
    if ((!text || text.length < 25) && (documentData.filePath || documentData.fileUrl)) {
      const filePath = documentData.filePath || documentData.fileUrl;
      console.log(`Document has file reference: ${filePath}. Attempting to retrieve from storage.`);
      
      // Retrieve file from storage
      const fileBuffer = await retrieveFileFromStorage(documentData, hasAdminCredentials);
      
      if (fileBuffer && fileBuffer.length > 0) {
        console.log(`File retrieved, size: ${fileBuffer.length} bytes`);
        
        try {
          // Try the more reliable extraction method
          text = await extractPdfText(fileBuffer, { 
            useTextract: true
          });
          
          console.log(`Text extracted from file: ${text?.length || 0} characters`);
        } catch (extractionError) {
          console.error("Error during text extraction:", extractionError);
        }
      }
    }
    
    // Check if text extraction worked
    const textValidation = validateExtractedText(text);
    if (!textValidation.valid) {
      console.error(`Text extraction failed: ${text?.length || 0} characters`);
      
      // Return failure message
      return {
        documentId,
        error: "Text extraction failed",
        message: "No readable text content could be extracted from this document. Please upload a document with clear, selectable text.",
        fileName: documentData.fileName || documentData.name || "",
        fileType: documentData.contentType || documentData.type || "",
      };
    }
    
    return {
      documentId,
      text,
      fileName: documentData.fileName || documentData.name || "",
      fileType: documentData.contentType || documentData.type || "",
    };
    
  } catch (error) {
    console.error("Error processing existing document:", error);
    return {
      documentId,
      error: "Processing failed",
      message: error.message || "Failed to process document",
    };
  }
}

/**
 * Retrieves a document from Firestore
 */
async function getDocumentFromFirestore(documentId, hasAdminCredentials) {
  let documentData = null;
  
  // Try admin SDK first if available
  if (hasAdminCredentials) {
    try {
      const adminDb = await getAdminFirestore();
      if (adminDb) {
        console.log("Getting Firestore from Admin SDK");
        const docRef = adminDb.collection("documents").doc(documentId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
          documentData = docSnap.data();
          console.log(`Document exists. Fields: ${Object.keys(documentData).join(', ')}`);
          return documentData;
        } else {
          console.error(`Document ${documentId} not found in Firestore`);
        }
      }
    } catch (adminError) {
      console.error("Admin Firestore document retrieval failed:", adminError);
    }
  }
  
  // Fall back to client SDK
  try {
    console.log("Using client SDK to retrieve document");
    const db = getFirestore();
    const docRef = doc(db, "documents", documentId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      documentData = docSnap.data();
      console.log(`Document exists via client SDK. Fields: ${Object.keys(documentData).join(', ')}`);
      return documentData;
    } else {
      console.log(`Document ${documentId} not found via client SDK`);
      return null;
    }
  } catch (clientError) {
    console.error("Client Firestore document retrieval failed:", clientError);
    return null;
  }
}

/**
 * Updates a document with extracted text
 */
async function updateDocumentWithText(documentId, text, hasAdminCredentials) {
  console.log("Updating document with extracted text");
  try {
    if (hasAdminCredentials) {
      const adminDb = await getAdminFirestore();
      if (adminDb) {
        await adminDb.collection("documents").doc(documentId).update({
          content: text,
          updatedAt: new Date()
        });
        console.log("Document updated with extracted text using Admin SDK");
        return;
      }
    }
    
    // Fall back to client SDK
    const db = getFirestore();
    await updateDoc(doc(db, "documents", documentId), {
      content: text,
      updatedAt: serverTimestamp()
    });
    console.log("Document updated with extracted text using client SDK");
  } catch (updateError) {
    console.error("Failed to update document with extracted text:", updateError);
  }
}

/**
 * Retrieves a file from storage based on document data
 */
async function retrieveFileFromStorage(documentData, hasAdminCredentials) {
  try {
    let fileBuffer = null;
    // Use filePath or fileUrl, whichever is available
    const filePath = documentData.filePath || documentData.fileUrl;
    
    if (!filePath) {
      console.error("No file path or URL found in document data");
      return null;
    }
    
    const storageType = documentData.storageType || 
                      (filePath && filePath.includes('amazonaws.com') ? 's3' : 
                      (filePath && filePath.startsWith('documents/') ? 'firebase' : 
                      (filePath && (filePath.startsWith('http://') || filePath.startsWith('https://')) ? 'url' : 'unknown')));
    
    console.log(`Storage type determined as: ${storageType}`);
    
    // Direct URL - fetch directly
    if (storageType === 'url') {
      try {
        console.log(`Attempting to fetch file from URL: ${filePath}`);
        const response = await fetch(filePath);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
          console.log(`File downloaded successfully from URL: ${fileBuffer.length} bytes`);
          return fileBuffer;
        } else {
          console.error("URL fetch failed:", response.status, response.statusText);
        }
      } catch (urlError) {
        console.error("Error fetching from URL:", urlError);
      }
    }
    
    // Try S3 if appropriate
    if (storageType === 's3' && process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
      try {
        fileBuffer = await getFileFromS3(filePath);
      } catch (s3Error) {
        console.error("Error retrieving from S3:", s3Error);
      }
    }
    
    // Try admin storage
    if (!fileBuffer && hasAdminCredentials) {
      try {
        fileBuffer = await getFileFromAdminStorage(filePath);
      } catch (adminError) {
        console.error("Admin Storage file retrieval failed:", adminError);
      }
    }
    
    // Fall back to client storage
    if (!fileBuffer) {
      try {
        fileBuffer = await getFileFromClientStorage(filePath);
      } catch (clientError) {
        console.error("Client Storage file retrieval failed:", clientError);
      }
    }
    
    return fileBuffer;
  } catch (error) {
    console.error("Error retrieving file from storage:", error);
    return null;
  }
}

/**
 * Gets a file from AWS S3
 */
async function getFileFromS3(filePath) {
  console.log("Attempting to retrieve file from S3");
  
  // Create S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined
  });
  
  // Extract key from full S3 URL or use as is
  let s3Key = filePath;
  if (s3Key.includes('amazonaws.com')) {
    const url = new URL(s3Key);
    s3Key = url.pathname.substring(1); // Remove leading slash
  }
  
  console.log(`Retrieving from S3 bucket: ${process.env.AWS_S3_BUCKET}, key: ${s3Key}`);
  
  // Get object from S3
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: s3Key
  }));
  
  // Convert readable stream to buffer
  if (response.Body) {
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    console.log(`File retrieved from S3, size: ${fileBuffer.length} bytes`);
    return fileBuffer;
  }
  
  return null;
}

/**
 * Gets a file from Firebase Admin Storage
 */
async function getFileFromAdminStorage(filePath) {
  console.log("Getting file using Admin Storage SDK");
  const adminStorage = await getAdminStorage();
  if (!adminStorage) return null;
  
  const bucket = adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const file = bucket.file(filePath);
  
  // Check if file exists
  const [exists] = await file.exists();
  if (exists) {
    console.log("File exists in storage, downloading...");
    const [fileContents] = await file.download();
    return fileContents;
  } else {
    console.error("File does not exist in storage:", filePath);
    return null;
  }
}

/**
 * Gets a file from Firebase Client Storage
 */
async function getFileFromClientStorage(filePath) {
  try {
    console.log("Using client Storage SDK");
    
    // If filePath is a complete URL (not a storage path)
    if (filePath.startsWith('http')) {
      console.log("File path is a URL, fetching directly");
      const response = await fetch(filePath);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        console.log(`File downloaded successfully from URL: ${fileBuffer.length} bytes`);
        return fileBuffer;
      } else {
        console.error("URL fetch failed:", response.status, response.statusText);
        return null;
      }
    }
    
    // Otherwise use Firebase Storage
    const storage = getStorage();
    const fileRef = ref(storage, filePath);
    
    // Get download URL
    const url = await getDownloadURL(fileRef);
    console.log("File download URL obtained");
    
    // Fetch the file
    const response = await fetch(url);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      console.log(`File downloaded successfully: ${fileBuffer.length} bytes`);
      return fileBuffer;
    } else {
      console.error("File fetch failed:", response.status, response.statusText);
      return null;
    }
  } catch (error) {
    console.error("Client Storage file retrieval failed:", error);
    return null;
  }
}

/**
 * Extracts text from a file buffer
 */
async function extractTextFromFile(fileBuffer, fileName, fileType, options) {
  try {
    const useOcr = options?.enableOcr === true || options?.ocr === true;
    const useTextract = process.env.USE_TEXTRACT === 'true';
    
    // Extract text based on file type
    if (fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
      console.log(`Extracting text from PDF (OCR: ${useOcr}, Textract: ${useTextract})`);
      
      let text;
      if (useTextract) {
        text = await extractTextFromPdfWithTextract(fileBuffer, { useOcr });
      } else {
        text = await extractPdfText(fileBuffer, { 
          useOcr, 
          attemptAlternativeMethods: true 
        });
      }

      // If failed and OCR wasn't already enabled, try again with OCR
      if ((!text || text.trim().length < 25) && !useOcr) {
        console.log("Initial extraction failed, retrying with OCR enabled");
        if (useTextract) {
          text = await extractTextFromPdfWithTextract(fileBuffer, { useOcr: true });
        } else {
          text = await extractPdfText(fileBuffer, { 
            useOcr: true, 
            attemptAlternativeMethods: true 
          });
        }
      }
      
      return text;
    } else if (fileType.includes('text/plain') || fileName.toLowerCase().endsWith('.txt')) {
      console.log("Extracting text from plain text");
      return extractTextFromTxt(fileBuffer);
    } else if (fileType.includes('word') || fileName.toLowerCase().endsWith('.docx')) {
      console.log("Extracting text from Word document");
      if (!mammoth) {
        console.error("Mammoth library not available for Word document extraction");
        return null;
      }
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else {
      console.warn(`Unsupported file type: ${fileType}`);
      return null;
    }
  } catch (error) {
    console.error("Error extracting text from file:", error);
    return null;
  }
}