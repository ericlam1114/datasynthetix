// src/app/api/process-document/utils/storage.js
import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIRECTORY } from "../config";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, collection, setDoc, serverTimestamp } from "firebase/firestore";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Ensures the uploads directory exists
 */
export async function ensureUploadsDirectory() {
  try {
    await fs.access(UPLOAD_DIRECTORY);
  } catch (error) {
    await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
    console.log("Created uploads directory:", UPLOAD_DIRECTORY);
  }
}

/**
 * Saves a document to the appropriate storage system
 * @param {File} file - The file to save
 * @param {string} userId - The user ID
 * @param {Object} options - Optional parameters
 * @returns {Object} Information about the saved document
 */
export async function saveDocumentToStorage(file, userId, options = {}) {
  console.log(`Saving document for user ${userId}`);
  
  try {
    // Create uploads directory if needed for local development
    await ensureUploadsDirectory();
    
    // Create a new document ID
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Get the file data
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;
    
    let fileUrl = null;
    let filePath = null;
    
    // Try to save to Firebase Storage first
    try {
      console.log("Attempting to save to Firebase Storage");
      
      const storage = getStorage();
      const storageRef = ref(storage, `documents/${userId}/${Date.now()}_${fileName}`);
      
      // Upload buffer to Firebase Storage
      await uploadBytes(storageRef, buffer);
      
      // Get the download URL
      fileUrl = await getDownloadURL(storageRef);
      filePath = storageRef.fullPath;
      
      console.log(`Saved to Firebase Storage: ${filePath}`);
    } catch (firebaseError) {
      console.error("Error saving to Firebase Storage:", firebaseError);
      
      // Try S3 as second option if AWS credentials are configured
      if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
        try {
          console.log("Attempting to save to AWS S3");
          
          // Create S3 client
          const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            } : undefined // Use default credentials provider chain if not specified
          });
          
          // Set up the S3 path
          const s3Key = `documents/${userId}/${Date.now()}_${fileName}`;
          
          // Upload to S3
          await s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: fileType,
            Metadata: {
              'user-id': userId,
              'document-id': documentId
            }
          }));
          
          // Set file path and URL
          filePath = s3Key;
          fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
          
          // If a custom CloudFront or S3 website URL is configured, use that instead
          if (process.env.AWS_S3_PUBLIC_URL) {
            fileUrl = `${process.env.AWS_S3_PUBLIC_URL}/${s3Key}`;
          }
          
          console.log(`Saved to AWS S3: ${filePath}`);
        } catch (s3Error) {
          console.error("Error saving to AWS S3:", s3Error);
          
          // Fall back to local file system in development only
          if (process.env.NODE_ENV === 'development') {
            await saveToLocalFileSystem();
          } else {
            throw new Error("Failed to save document to cloud storage");
          }
        }
      } else {
        console.log("AWS S3 not configured, falling back to local storage (development only)");
        
        // Fall back to local file system in development only
        if (process.env.NODE_ENV === 'development') {
          await saveToLocalFileSystem();
        } else {
          throw new Error("No cloud storage options available");
        }
      }
    }
    
    // Local helper function to save to filesystem (development only)
    async function saveToLocalFileSystem() {
      console.log("Falling back to local file system");
      
      // Create user directory if it doesn't exist
      const userDir = path.join(process.cwd(), "uploads", userId);
      await fs.mkdir(userDir, { recursive: true });
      
      // Save file locally
      const localFilePath = path.join(userDir, `${Date.now()}_${fileName}`);
      await fs.writeFile(localFilePath, buffer);
      
      // Set file path and URL
      filePath = `uploads/${userId}/${path.basename(localFilePath)}`;
      fileUrl = `/api/files/${userId}/${path.basename(localFilePath)}`;
      
      console.log(`Saved to local file system: ${localFilePath}`);
    }
    
    // Save document metadata to Firestore
    const db = getFirestore();
    const docRef = doc(collection(db, "documents"), documentId);
    
    const documentData = {
      id: documentId,
      userId,
      name: options.name || fileName,
      description: options.description || "",
      fileName,
      fileType,
      fileSize,
      fileUrl,
      filePath,
      storageType: fileUrl.includes('firebase') ? 'firebase' : 
                  fileUrl.includes('amazonaws') ? 's3' : 
                  fileUrl.startsWith('/api') ? 'local' : 'unknown',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(docRef, documentData);
    console.log(`Document metadata saved to Firestore with ID: ${documentId}`);
    
    return {
      documentId,
      filePath,
      fileUrl,
      fileName
    };
  } catch (error) {
    console.error("Error saving document:", error);
    throw error;
  }
}