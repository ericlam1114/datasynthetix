// src/app/api/process-document/route.js
import "@ungap/with-resolvers"; // Polyfill for Promise.withResolvers
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  doc,
  getDoc,
  getFirestore,
  updateDoc,
  runTransaction,
  serverTimestamp,
  collection,
  setDoc,
  addDoc,
} from "firebase/firestore";
import ModelApiClient from "../../../../lib/ModelApiClient";
import { SyntheticDataPipeline } from "../../../lib/SyntheticDataPipeline";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import { firestore } from "../../../lib/firebase";
import {
  initializeAdminApp,
  getAdminFirestore,
  getAdminStorage,
  verifyDocumentAccess,
} from "../../../lib/firebase-admin"; // Import admin Firebase app and admin Firestore
import { addDataSet, saveProcessingJob } from "../../../lib/firestoreService";
import mammoth from "mammoth";
import OpenAI from "openai";
import { auth } from "../../../lib/firebase";
import { extractTextFromPdf, extractTextFromTxt } from "./utils/extractText";
import { extractTextFromPdfWithTextract } from './utils/extractText';

// Import the modular services
import { authenticateUser, getUserSubscription, updateUserCredits } from './services/auth';
import { saveDocument, getDocument, downloadDocument, createProcessingJob, updateProcessingJob, saveProcessingResults } from './services/document';
import { extractText, createTextChunks } from './services/textExtraction';
import { createPipeline, processDocument, withTimeout, evaluateTextComplexity } from './services/pipeline';
import { createProcessingStatus, updateProcessingStatus, completeProcessingJob, handleProcessingError } from './services/statusUpdate';
import { handleError, createErrorHandler, withErrorHandling } from './services/errorHandler';

// Dynamically import Firebase Admin Auth - this prevents build errors if the module is not available
let adminAuthModule;
try {
  adminAuthModule = require("firebase-admin/auth");
} catch (error) {
  console.warn("Firebase Admin Auth module not available:", error.message);
  // Create a mock implementation
  adminAuthModule = {
    getAuth: () => null,
  };
}

const { getAuth } = adminAuthModule;

// Function to check if Firebase Admin credentials are properly configured
function hasFirebaseAdminCredentials() {
  const hasProjectId = !!process.env.FIREBASE_ADMIN_PROJECT_ID;
  const hasClientEmail = !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const hasPrivateKey = !!process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const isConfigured = hasProjectId && hasClientEmail && hasPrivateKey;

  if (!isConfigured && process.env.NODE_ENV === "development") {
    console.warn("Firebase Admin SDK is not fully configured:");
    if (!hasProjectId) console.warn("- Missing FIREBASE_ADMIN_PROJECT_ID");
    if (!hasClientEmail) console.warn("- Missing FIREBASE_ADMIN_CLIENT_EMAIL");
    if (!hasPrivateKey) console.warn("- Missing FIREBASE_ADMIN_PRIVATE_KEY");
    console.warn(
      "Add these to your .env.local file to enable server-side Firebase authentication"
    );
  }

  return isConfigured;
}

// Get the admin auth instance
async function getAdminAuth() {
  try {
    const app = await initializeAdminApp();
    if (!app) return null;
    return getAuth(app);
  } catch (error) {
    console.error("Failed to get Admin Auth:", error);
    return null;
  }
}

// Verify an auth token using the admin SDK
async function verifyAuthToken(token) {
  try {
    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      console.warn("Admin Auth not available for token verification");
      // Fall back to client auth
      return auth.verifyIdToken(token);
    }

    return adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Token verification failed:", error);
    throw error;
  }
}

// Function to check if text extraction worked
export function validateExtractedText(text) {
  // In development mode with BYPASS_TEXT_VALIDATION set, always treat any text as valid
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_TEXT_VALIDATION === 'true') {
    console.log("⚠️ Development mode - bypassing text validation checks");
    console.log(`Text length: ${text?.length || 0} characters`);
    // Return valid regardless of content
    return { valid: true, bypassed: true };
  }
  
  // Check if text exists and has minimum length
  if (!text || text.length < 10) {  // Reduced minimum threshold further from 25 to 10 for development
    console.log("❌ Text extraction failed or produced insufficient content");
    console.log(`Text length: ${text?.length || 0} characters`);
    
    // In development, allow even very short text to proceed anyway
    if (process.env.NODE_ENV === 'development') {
      console.warn("Development mode - allowing short text to proceed despite validation failure");
      // Create a placeholder text for empty documents
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
  
  // Check for common indicators of successful extraction
  const containsWords = /\b\w{2,}\b/.test(text); // Has words of at least 2 chars (more lenient)
  const hasPunctuation = /[.,;:?!]/.test(text); // Has punctuation
  const hasSpaces = /\s/.test(text); // Has whitespace
  
  console.log(`Text validation: Has words: ${containsWords}, Has punctuation: ${hasPunctuation}, Has spaces: ${hasSpaces}`);
  console.log(`Text length: ${text.length} characters`);
  
  // More lenient check: only require words OR spaces
  if (containsWords || hasSpaces) {
    console.log("✅ Text extraction appears successful");
    return { valid: true };
  } else {
    console.log("⚠️ Text extraction may have issues - content doesn't look like normal text");
    
    // In development, allow even problematic text to proceed
    if (process.env.NODE_ENV === 'development') {
      console.warn("Development mode - allowing text with quality issues to proceed");
      return { valid: true, qualityIssues: true };
    }
    
    return { valid: false, reason: "text_quality_issues" };
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
async function ensureUploadsDirectory() {
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log("Created uploads directory:", uploadsDir);
  }
}

// Verify that Firebase Admin credentials are available
async function checkFirebaseAdminCredentials() {
  try {
    const adminDb = await getAdminFirestore();
    return !!adminDb;
  } catch (error) {
    console.error("Firebase Admin credentials check failed:", error);
    return false;
  }
}

export async function POST(request) {
  console.log('POST /api/process-document starting');
  console.time('documentProcessing');
  
  try {
    // Step 1: Authenticate the user
    const user = await authenticateUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Create context-specific error handler
    const errorHandler = createErrorHandler({ userId: user.uid });
    
    // Step 2: Parse and validate the form data
    const formData = await request.formData();
    const file = formData.get('file');
    const documentId = formData.get('documentId');
    const tempJobId = formData.get('tempJobId'); // Get tempJobId if provided
    
    // Create a job ID (use the temp one if provided)
    const jobId = tempJobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Check if we're processing an existing document
    if (documentId) {
      console.log(`Processing existing document: ${documentId}`);
      
      try {
        // Create initial status
        await createProcessingStatus(jobId, {
          userId: user.uid,
          documentId,
          status: 'created',
          progress: 0,
          stage: 'initialization'
        });
        
        // Update to show we're starting
        await updateProcessingStatus(jobId, {
          status: 'processing',
          message: 'Processing started for existing document',
          progress: 5
        });
      } catch (statusError) {
        console.error('Error creating initial status:', statusError);
        // Non-critical, continue processing
      }
      
      // Parse options for existing document
      const options = {
        chunkSize: parseInt(formData.get('chunkSize') || 1000, 10),
        overlap: parseInt(formData.get('overlap') || 100, 10),
        outputFormat: formData.get('outputFormat') || 'jsonl',
        classFilter: formData.get('classFilter') || 'all',
        prioritizeImportant: formData.get('prioritizeImportant') === 'true',
        enableOcr: formData.get('enableOcr') === 'true' || process.env.USE_OCR === 'true'
      };
      
      // Check admin credentials
      const hasAdminCredentials = await checkFirebaseAdminCredentials();
      
      // Process the existing document
      const documentResult = await processExistingDocument(
        user.uid, 
        documentId, 
        options, 
        jobId, 
        hasAdminCredentials
      );
      
      // Check if there was an error
      if (documentResult.error) {
        return Response.json(errorHandler(new Error(documentResult.message || documentResult.error), {
          stage: 'document_retrieval',
          jobId,
          documentId,
          statusCode: 400
        }), { status: 400 });
      }
      
      // Update status
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Document retrieved, starting processing',
        progress: 15,
        documentId
      });
      
      // Now process the document with the pipeline similar to file upload case
      try {
        // Initialize the pipeline with options 
        const pipeline = new SyntheticDataPipeline({
          apiKey: process.env.OPENAI_API_KEY,
          extractorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
          classifierModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:abcdefgh",
          duplicatorModel: "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
          chunkSize: options.chunkSize,
          overlap: options.overlap,
          outputFormat: options.outputFormat,
          classFilter: options.classFilter,
          prioritizeImportant: options.prioritizeImportant,
          maxClausesToProcess: parseInt(formData.get("maxClauses") || 0, 10),
          maxVariantsPerClause: parseInt(formData.get("maxVariants") || 3, 10),
          timeouts: {
            documentProcessing: parseInt(formData.get("documentTimeout") || 600000, 10),
            chunkProcessing: parseInt(formData.get("chunkTimeout") || 120000, 10),
            clauseExtraction: parseInt(formData.get("extractionTimeout") || 30000, 10),
            clauseClassification: parseInt(formData.get("classificationTimeout") || 15000, 10),
            variantGeneration: parseInt(formData.get("variantTimeout") || 20000, 10),
          },
        });
        
        // Estimate resource requirements
        const complexity = evaluateTextComplexity(documentResult.text);
        
        // Configure pipeline options with progress callback
        const pipelineOptions = {
          ...options,
          progressCallback: async (progressData) => {
            // Similar progress callback as in the file upload case
            try {
              if (!progressData) return;
              
              const { currentChunk, totalChunks, processedClauses, totalClauses, stage, variantsGenerated } = progressData;
              
              const chunkProgress = totalChunks ? Math.round((currentChunk / totalChunks) * 100) : 0;
              
              const statusUpdate = {
                status: 'processing',
                processedChunks: currentChunk || 0,
                totalChunks: totalChunks || complexity.estimatedChunks,
                progress: 20 + Math.floor(chunkProgress * 0.6),
                stage: stage || 'processing',
                processingStats: {
                  processedClauses: processedClauses || 0,
                  totalClauses: totalClauses || 0,
                  variantsGenerated: variantsGenerated || 0,
                  currentStage: stage || 'processing',
                  currentChunk,
                  totalChunks,
                  lastUpdateTime: new Date().toISOString()
                }
              };
              
              if (stage === 'extracting') {
                statusUpdate.message = `Extracting clauses (chunk ${currentChunk}/${totalChunks})`;
              } else if (stage === 'classifying') {
                statusUpdate.message = `Classifying clauses (${processedClauses} found)`;
              } else if (stage === 'generating') {
                statusUpdate.message = `Generating variants (${variantsGenerated} variants created)`;
              } else {
                statusUpdate.message = `Processing document (${currentChunk}/${totalChunks} chunks)`;
              }
              
              await updateProcessingStatus(jobId, statusUpdate);
            } catch (progressError) {
              console.error('Error in progress callback:', progressError);
            }
          },
          jobId
        };
        
        // Process the document
        const result = await processDocument(documentResult.text, pipelineOptions);
        
        // Update status before saving results
        await updateProcessingStatus(jobId, {
          status: 'processing',
          message: 'Processing complete, saving results',
          progress: 90,
          processingStats: {
            ...result.stats,
            completed: true
          }
        });
        
        // Save the processing results
        await saveProcessingResults(documentId, jobId, result);
        
        // Complete the processing job
        await completeProcessingJob(jobId, result);
        
        // Return success response with the real jobId
        return Response.json({
          success: true,
          message: 'Document processed successfully',
          jobId,
          documentId,
          stats: result.stats
        });
      } catch (processingError) {
        return Response.json(errorHandler(processingError, { 
          stage: 'pipeline_processing', 
          jobId,
          documentId,
          statusCode: 500 
        }), { status: 500 });
      }
    }
    
    // If we got here, we're dealing with a new file upload
    // Validate required fields for new uploads
    if (!file) {
      return Response.json(errorHandler(new Error('File is required for new document uploads'), { 
        stage: 'validation', 
        statusCode: 400 
      }), { status: 400 });
    }
    
    // Parse options
    const options = {
      name: formData.get('name') || file.name,
      description: formData.get('description') || '',
      chunkSize: parseInt(formData.get('chunkSize') || 1000, 10),
      overlap: parseInt(formData.get('overlap') || 100, 10),
      outputFormat: formData.get('outputFormat') || 'jsonl',
      classFilter: formData.get('classFilter') || 'all',
      prioritizeImportant: formData.get('prioritizeImportant') === 'true',
      enableOcr: formData.get('enableOcr') === 'true' || process.env.USE_OCR === 'true'
    };
    
    // Step 3: Create a processing job record (using the jobId from above)
    try {
      // Create initial status
      await createProcessingStatus(jobId, {
        userId: user.uid,
        fileName: file.name,
        status: 'created',
        progress: 0,
        stage: 'initialization'
      });
      
      // Update to show we're starting
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Processing started',
        progress: 5
      });
    } catch (statusError) {
      console.error('Error creating initial status:', statusError);
      // Non-critical, continue processing
    }
    
    // Step 4: Save the document to storage
    let documentInfo;
    try {
      documentInfo = await saveDocument(file, user.uid, options);
      
      // Update status
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Document uploaded, extracting text',
        progress: 10,
        documentId: documentInfo.documentId
      });
    } catch (docError) {
      return Response.json(errorHandler(docError, { 
        stage: 'document_storage', 
        jobId,
        statusCode: 500 
      }), { status: 500 });
    }
    
    // Step 5: Extract text from the document
    let extractionResult;
    try {
      // Get the uploaded file buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Extract text based on file type
      extractionResult = await extractText(buffer, file.type, {
        enableOcr: options.enableOcr
      });
      
      // Check if extraction succeeded
      if (!extractionResult.validation.valid) {
        throw new Error(`Text extraction failed: ${extractionResult.validation.reason}`);
      }
      
      // Update status
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Text extracted successfully',
        progress: 15,
        stats: {
          textLength: extractionResult.length
        }
      });
    } catch (extractError) {
      return Response.json(errorHandler(extractError, { 
        stage: 'text_extraction', 
        jobId,
        documentId: documentInfo.documentId,
        statusCode: 400 
      }), { status: 400 });
    }
    
    // Step 6: Process the document with the pipeline
    try {
      // Initialize the pipeline with options from the request
      const pipeline = new SyntheticDataPipeline({
        apiKey: process.env.OPENAI_API_KEY,
        extractorModel:
          "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
        classifierModel:
          "ft:gpt-4o-mini-2024-07-18:personal:clause-classifier:abcdefgh", // Replace with your actual model ID
        duplicatorModel:
          "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
        chunkSize: parseInt(formData.get("chunkSize") || 1000, 10),
        overlap: parseInt(formData.get("overlap") || 100, 10),
        outputFormat: formData.get("outputFormat") || "jsonl",
        classFilter: formData.get("classFilter") || "all",
        prioritizeImportant: formData.get("prioritizeImportant") === "true",
        maxClausesToProcess: parseInt(formData.get("maxClauses") || 0, 10),
        maxVariantsPerClause: parseInt(formData.get("maxVariants") || 3, 10),
        // Add timeout configurations
        timeouts: {
          documentProcessing: parseInt(formData.get("documentTimeout") || 600000, 10), // 10 minutes
          chunkProcessing: parseInt(formData.get("chunkTimeout") || 120000, 10),      // 2 minutes
          clauseExtraction: parseInt(formData.get("extractionTimeout") || 30000, 10),     // 30 seconds
          clauseClassification: parseInt(formData.get("classificationTimeout") || 15000, 10), // 15 seconds
          variantGeneration: parseInt(formData.get("variantTimeout") || 20000, 10),   // 20 seconds per variant
        },
      });
      
      // Log the timeout configurations
      console.log("Pipeline timeouts:", {
        documentProcessing: parseInt(formData.get("documentTimeout") || 600000, 10),
        chunkProcessing: parseInt(formData.get("chunkTimeout") || 120000, 10),
        clauseExtraction: parseInt(formData.get("extractionTimeout") || 30000, 10),
        clauseClassification: parseInt(formData.get("classificationTimeout") || 15000, 10),
        variantGeneration: parseInt(formData.get("variantTimeout") || 20000, 10),
      });
      
      // Estimate resource requirements
      const complexity = evaluateTextComplexity(extractionResult.text);
      
      // Update status
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Initializing processing pipeline',
        progress: 18,
        estimatedChunks: complexity.estimatedChunks,
        totalChunks: complexity.estimatedChunks,
        complexity: complexity.complexity
      });
      
      // Configure pipeline options
      const pipelineOptions = {
        ...options,
        progressCallback: async (progressData) => {
          // Report progress from the pipeline
          try {
            if (!progressData) return;
            
            const { currentChunk, totalChunks, processedClauses, totalClauses, stage, variantsGenerated } = progressData;
            
            // Calculate progress percentage
            const chunkProgress = totalChunks ? Math.round((currentChunk / totalChunks) * 100) : 0;
            
            // Create status update with detailed stats
            const statusUpdate = {
              status: 'processing',
              processedChunks: currentChunk || 0,
              totalChunks: totalChunks || complexity.estimatedChunks,
              progress: 20 + Math.floor(chunkProgress * 0.6), // Scale to 20-80% range
              stage: stage || 'processing',
              processingStats: {
                processedClauses: processedClauses || 0,
                totalClauses: totalClauses || 0,
                variantsGenerated: variantsGenerated || 0,
                currentStage: stage || 'processing',
                currentChunk,
                totalChunks,
                lastUpdateTime: new Date().toISOString()
              }
            };
            
            // Add a message based on stage
            if (stage === 'extracting') {
              statusUpdate.message = `Extracting clauses (chunk ${currentChunk}/${totalChunks})`;
            } else if (stage === 'classifying') {
              statusUpdate.message = `Classifying clauses (${processedClauses} found)`;
            } else if (stage === 'generating') {
              statusUpdate.message = `Generating variants (${variantsGenerated} variants created)`;
            } else {
              statusUpdate.message = `Processing document (${currentChunk}/${totalChunks} chunks)`;
            }
            
            // Update status
            await updateProcessingStatus(jobId, statusUpdate);
          } catch (progressError) {
            console.error('Error in progress callback:', progressError);
          }
        },
        jobId
      };
      
      // Process the document
      const result = await processDocument(extractionResult.text, pipelineOptions);
      
      // Update status before saving results
      await updateProcessingStatus(jobId, {
        status: 'processing',
        message: 'Processing complete, saving results',
        progress: 90,
        processingStats: {
          ...result.stats,
          completed: true
        }
      });
      
      // Save the processing results
      await saveProcessingResults(documentInfo.documentId, jobId, result);
      
      // Complete the processing job
      await completeProcessingJob(jobId, result);
      
      // Return success response with results summary
      return Response.json({
        success: true,
        message: 'Document processed successfully',
        jobId,
        documentId: documentInfo.documentId,
        stats: result.stats
      });
    } catch (processingError) {
      return Response.json(errorHandler(processingError, { 
        stage: 'pipeline_processing', 
        jobId,
        documentId: documentInfo.documentId,
        statusCode: 500 
      }), { status: 500 });
    }
  } catch (error) {
    console.error('Unexpected error in document processing:', error);
    return Response.json({ 
      error: error.message || 'An unexpected error occurred',
      success: false 
    }, { status: 500 });
  } finally {
    console.timeEnd('documentProcessing');
  }
}

// Create a dataset record for the processed document
async function createDatasetRecord(
  documentId,
  text,
  summary,
  hasAdminCredentials,
  userId
) {
  try {
    if (!userId) {
      console.warn("No userId provided for dataset record - skipping creation");
      return null;
    }

    console.log(
      `Creating dataset record for document ${documentId} for user ${userId}`
    );

    const datasetData = {
      documentId,
      length: text.length,
      summary,
      createdAt: new Date(), // Use standard Date object instead of serverTimestamp
      processed: false, // will be processed by the training pipeline later
      userId, // Always include the userId
    };

    if (hasAdminCredentials) {
      try {
        // Try Admin SDK first
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          const datasetRef = adminDb.collection("datasets").doc();
          // Create clean data object to avoid serialization issues
          await datasetRef.set({
            ...datasetData,
            id: datasetRef.id,
          });
          console.log(
            `Created dataset record ${datasetRef.id} using Admin SDK`
          );
          return datasetRef.id;
        }
      } catch (error) {
        console.error("Admin Firestore dataset creation failed:", error);
        // Will fall back to client method
      }
    }

    // Fall back to client method
    try {
      const db = getFirestore();
      if (!db) {
        throw new Error("Firestore client not initialized");
      }

      const datasetRef = await addDoc(collection(db, "datasets"), {
        ...datasetData,
        createdAt: serverTimestamp(), // Use serverTimestamp for client SDK
      });

      await updateDoc(datasetRef, { id: datasetRef.id });
      console.log(`Created dataset record ${datasetRef.id} using client SDK`);
      return datasetRef.id;
    } catch (error) {
      console.error("Client Firestore dataset creation failed:", error);
      return null;
    }
  } catch (error) {
    console.error("Error creating dataset record:", error);
    // Continue without throwing - this is a non-critical operation
    return null;
  }
}

// API route for downloading files
export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("file");

  if (!filePath) {
    return NextResponse.json(
      { error: "File path is required" },
      { status: 400 }
    );
  }

  try {
    // Parse file path to get userId and fileName
    const [userId, fileName] = filePath.split("/");

    if (!userId || !fileName) {
      throw new Error("Invalid file path format");
    }

    const fullPath = path.join(process.cwd(), "uploads", userId, fileName);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read file content
    const fileContent = await fs.readFile(fullPath);

    // Determine content type
    let contentType = "application/octet-stream";
    if (fileName.endsWith(".jsonl")) {
      contentType = "application/json";
    } else if (fileName.endsWith(".csv")) {
      contentType = "text/csv";
    }

    // Return file
    return new NextResponse(fileContent, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename=${fileName}`,
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}

/**
 * Process an existing document from Firestore
 */
async function processExistingDocument(userId, documentId, processingOptions = {}, jobId, hasAdminCredentials) {
  console.log(`Processing existing document with ID: ${documentId}`);
  
  try {
    // Get document from Firestore
    let documentData = null;
    let db;
    
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
          } else {
            console.error(`Document ${documentId} not found in Firestore`);
          }
        }
      } catch (adminError) {
        console.error("Admin Firestore document retrieval failed:", adminError);
      }
    }
    
    // Fall back to client SDK if needed
    if (!documentData) {
      console.log("Falling back to client SDK");
      db = getFirestore();
      const docRef = doc(db, "documents", documentId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        documentData = docSnap.data();
        console.log(`Document exists via client SDK. Fields: ${Object.keys(documentData).join(', ')}`);
      } else {
        throw new Error(`Document ${documentId} not found`);
      }
    }
    
    // Check if document belongs to user
    if (documentData.userId !== userId && !hasAdminCredentials) {
      throw new Error("Not authorized to process this document");
    }
    
    // Get text content from document
    let text = documentData.content || documentData.text || "";
    console.log(`Retrieved document content: ${text.length} characters`);
    console.log(`Content field name: ${documentData.content ? 'content' : (documentData.text ? 'text' : 'neither')}`);
    
    // If there's a file path but no content, try to get from storage
    if ((!text || text.length < 25) && documentData.filePath) {
      console.log(`Document has filePath: ${documentData.filePath}. Attempting to retrieve from storage.`);
      
      try {
        // Try to get file from Firebase Storage
        let fileBuffer;
        
        if (hasAdminCredentials) {
          // Try admin storage first
          try {
            const adminStorage = await getAdminStorage();
            if (adminStorage) {
              console.log("Getting file using Admin Storage SDK");
              const bucket = adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
              const file = bucket.file(documentData.filePath);
              
              // Check if file exists
              const [exists] = await file.exists();
              if (exists) {
                console.log("File exists in storage, downloading...");
                const [fileContents] = await file.download();
                fileBuffer = fileContents;
              } else {
                console.error("File does not exist in storage:", documentData.filePath);
              }
            }
          } catch (adminStorageError) {
            console.error("Admin Storage file retrieval failed:", adminStorageError);
          }
        }
        
        // Fall back to client storage if needed
        if (!fileBuffer) {
          console.log("Falling back to client Storage SDK");
          const storage = getStorage();
          const fileRef = ref(storage, documentData.filePath);
          
          try {
            // Get download URL
            const url = await getDownloadURL(fileRef);
            console.log("File download URL obtained");
            
            // Fetch the file
            const response = await fetch(url);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
              console.log(`File downloaded successfully: ${fileBuffer.length} bytes`);
            } else {
              console.error("File fetch failed:", response.status, response.statusText);
            }
          } catch (clientStorageError) {
            console.error("Client Storage file retrieval failed:", clientStorageError);
          }
        }
        
        // Extract text from file if we got it
        if (fileBuffer && fileBuffer.length > 0) {
          console.log(`File retrieved, size: ${fileBuffer.length} bytes`);
          
          const fileName = documentData.fileName || documentData.name || path.basename(documentData.filePath);
          const fileType = documentData.contentType || documentData.type || '';
          
          console.log(`File name: ${fileName}, type: ${fileType}`);
          
          const useOcr = processingOptions?.useOcr === true || processingOptions?.ocr === true;
          const useTextract = process.env.USE_TEXTRACT === 'true';
          
          try {
            // Extract text based on file type
            if (fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
              console.log(`Extracting text from PDF (OCR enabled: ${useOcr}, Textract enabled: ${useTextract})`);
              
              if (useTextract) {
                // Use Textract for PDF extraction
                text = await extractTextFromPdfWithTextract(fileBuffer, { 
                  useOcr: useOcr
                });
              } else {
                // Use traditional methods
                text = await extractTextFromPdf(fileBuffer, { 
                  useOcr: useOcr,
                  attemptAlternativeMethods: true 
                });
              }

              // If text extraction failed and OCR wasn't already enabled, try again with OCR
              if ((!text || text.trim().length < 25) && !useOcr) {
                console.log("Initial extraction failed, retrying with OCR enabled");
                if (useTextract) {
                  text = await extractTextFromPdfWithTextract(fileBuffer, { 
                    useOcr: true
                  });
                } else {
                  text = await extractTextFromPdf(fileBuffer, { 
                    useOcr: true, 
                    attemptAlternativeMethods: true 
                  });
                }
              }
            } else if (fileType.includes('text/plain') || fileName.toLowerCase().endsWith('.txt')) {
              console.log("Extracting text from plain text");
              text = extractTextFromTxt(fileBuffer);
            } else if (fileType.includes('word') || fileName.toLowerCase().endsWith('.docx')) {
              console.log("Extracting text from Word document");
              const result = await mammoth.extractRawText({ buffer: fileBuffer });
              text = result.value;
            } else {
              console.warn(`Unsupported file type: ${fileType}`);
            }
            
            console.log(`Text extracted from file: ${text?.length || 0} characters`);
            
            // Update the document with the extracted text if we got some
            if (text && text.length > 25) {
              console.log("Updating document with extracted text");
              try {
                if (hasAdminCredentials) {
                  const adminDb = await getAdminFirestore();
                  if (adminDb) {
                    await adminDb.collection("documents").doc(documentId).update({
                      content: text,
                      updatedAt: new Date()
                    });
                  }
                } else {
                  const db = getFirestore();
                  await updateDoc(doc(db, "documents", documentId), {
                    content: text,
                    updatedAt: serverTimestamp()
                  });
                }
                console.log("Document updated with extracted text");
              } catch (updateError) {
                console.error("Failed to update document with extracted text:", updateError);
              }
            } else {
              console.warn("Extracted text was too short or empty, document not updated");
            }
          } catch (extractionError) {
            console.error("Error during text extraction:", extractionError);
          }
        } else {
          console.warn("No file buffer obtained, cannot extract text");
        }
      } catch (storageError) {
        console.error("Error retrieving file from storage:", storageError);
      }
    }
    
    // Check if text extraction worked
    const textValidation = validateExtractedText(text);
    if (!textValidation.valid) {
      console.error(`Text extraction failed or produced insufficient content. Text length: ${text?.length || 0} characters`);
      console.error(`Text validation failed reason: ${textValidation.reason}`);
      
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
