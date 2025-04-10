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
import SyntheticDataPipeline from "../../../../lib/SyntheticDataPipeline";
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

function createTextChunks(text, options = {}) {
  const {
    minLength = 50, // Minimum chunk size in characters
    maxLength = 1000, // Maximum chunk size in characters
    overlap = 0, // Overlap between chunks
  } = options;

  // Use natural language boundaries for chunking
  const sentenceBreaks = [".", "!", "?", "\n\n"];
  const clauseBreaks = [";", ":", "\n", ". "];

  let chunks = [];
  let currentChunk = "";
  let lastBreakPos = 0;

  // Process text character by character
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentChunk += char;

    // Check if we've hit a natural break point
    const isSentenceBreak =
      sentenceBreaks.includes(char) &&
      i + 1 < text.length &&
      text[i + 1] === " ";
    const isClauseBreak = clauseBreaks.includes(char);
    const isBreakPoint =
      isSentenceBreak || (isClauseBreak && currentChunk.length > minLength);

    if (isBreakPoint) {
      lastBreakPos = i;
    }

    // Check if we've hit max length and have a break point
    if (currentChunk.length >= maxLength && lastBreakPos > 0) {
      // Cut at the last break point
      const breakPos = lastBreakPos - (currentChunk.length - i - 1);
      const chunk = currentChunk.substring(0, breakPos + 1).trim();

      if (chunk.length >= minLength) {
        chunks.push(chunk);
      }

      // Start a new chunk with overlap
      const overlapStart = Math.max(0, breakPos - overlap);
      currentChunk = currentChunk.substring(overlapStart);
      lastBreakPos = 0;
    }
  }

  // Add the final chunk if it's not empty
  if (currentChunk.trim().length >= minLength) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

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

// Simple PDF text extraction - does not rely on external libraries
async function extractTextFromPdf(buffer) {
  try {
    // Import pdf.js dynamically
    const pdfjs = await import("pdfjs-dist");
    const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry");

    // Configure worker
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

    // Load document
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let extractedText = "";

    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Extract text items and join with proper spacing
      const pageText = textContent.items.map((item) => item.str).join(" ");

      extractedText += pageText + "\n\n";
    }

    return extractedText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`PDF extraction failed: ${error.message}`);
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
  console.log("Processing document request received");

  try {
    // Check for admin credentials availability first
    const hasAdminCredentials = await checkFirebaseAdminCredentials();
    console.log(`Firebase Admin credentials available: ${hasAdminCredentials}`);

    const formData = await request.formData();
    const file = formData.get("file");
    const documentId = formData.get("documentId");
    const authToken =
      formData.get("authToken") ||
      request.headers.get("authorization")?.split("Bearer ")[1] ||
      null;
    const userId = formData.get("userId");
    const jobId = formData.get("jobId") || `job-${Date.now()}`;
    const useSimulation =
      formData.get("useSimulation") === "true" ||
      process.env.NEXT_PUBLIC_USE_SIMULATION === "true";

    console.log(`Auth token provided: ${!!authToken}`);
    if (authToken) {
      console.log(`Auth token format valid: ${authToken.length > 100}`);
    } else {
      console.warn(
        "No authentication token provided - may result in permission issues"
      );
    }

    // Check if we're running in simulation mode
    if (useSimulation || process.env.NODE_ENV === "development") {
      console.log("Using simulation mode for document processing");

      // Create a simulated document ID if not provided
      const simulatedDocumentId = documentId || `simulated-${Date.now()}`;

      // Extract file name if available
      const fileName = file
        ? file.name
        : documentId
        ? `document-${documentId}`
        : `simulated-document-${Date.now()}.pdf`;

      // Prepare status tracking
      const statusJobId = jobId;

      try {
        // Update status in Firestore to show processing has started
        const processingJob = {
          userId: userId,
          jobId: statusJobId,
          fileName: fileName,
          status: "processing",
          progress: 5, // Initial progress
          documentId: simulatedDocumentId,
          updatedAt: new Date(),
        };

        await saveProcessingJob(userId, processingJob);

        // Create initial status in the process status endpoint
        await fetch(`${new URL(request.url).origin}/api/process-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            fileName,
            jobId: statusJobId,
            status: "processing",
            processedChunks: 5,
            totalChunks: 100,
            updatedAt: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error("Error creating status entry:", error);
        // Non-critical, continue
      }

      // Return simulation response
      return NextResponse.json({
        documentId: simulatedDocumentId,
        summary:
          "This is a simulated summary of the document for testing purposes.",
        textLength: file ? await file.size : 5000,
        fileName,
        jobId: statusJobId,
      });
    }

    // Normal processing continues below...
    // Initialize a user ID variable for tracking ownership
    let verifiedUserId = null;

    // Verify token and get userId if possible
    if (authToken) {
      try {
        if (hasAdminCredentials) {
          // Try to verify the auth token to get the user ID using admin SDK
          const decodedToken = await verifyAuthToken(authToken);
          verifiedUserId = decodedToken.uid;
          console.log(
            `Successfully verified token for user: ${verifiedUserId}`
          );
        } else {
          // No admin credentials available, trust the provided user ID
          console.log(
            `Admin SDK not available. Using provided userId: ${userId}`
          );
          verifiedUserId = userId;
        }

        // If we have a document ID, verify access
        if (documentId && hasAdminCredentials) {
          const hasAccess = await verifyDocumentAccess(
            documentId,
            verifiedUserId
          );
          if (!hasAccess) {
            return NextResponse.json(
              {
                error:
                  "Permission denied. You don't have access to this document.",
              },
              { status: 403 }
            );
          }
        }
      } catch (error) {
        console.error("Token verification error:", error);
        if (error.code === "auth/id-token-expired") {
          return NextResponse.json(
            {
              error: "Authentication error: Your session has expired.",
              message: "Please refresh the page and sign in again.",
            },
            { status: 401 }
          );
        } else if (
          error.code === "auth/argument-error" ||
          error.code === "auth/invalid-id-token"
        ) {
          return NextResponse.json(
            {
              error: "Authentication error: Invalid authentication token.",
              message:
                "Please sign out and sign in again to refresh your session.",
            },
            { status: 401 }
          );
        }
        // Fall back to using the provided user ID if authentication fails
        verifiedUserId = userId;
        console.log(
          `Auth verification failed. Falling back to provided userId: ${verifiedUserId}`
        );
      }
    } else if (userId) {
      // No auth token but we have a user ID from the form data
      verifiedUserId = userId;
      console.log(
        `No auth token provided. Using userId from form data: ${verifiedUserId}`
      );
    }

    if (!verifiedUserId) {
      return NextResponse.json(
        {
          error: "Authentication required",
          message: "Please sign in before processing documents.",
        },
        { status: 401 }
      );
    }

    if (!file && !documentId) {
      return NextResponse.json(
        { error: "No file or document ID provided" },
        { status: 400 }
      );
    }

    // Variables to store document data
    let text = "";
    let docData = null;

    // If we have a document ID, fetch the existing document
    if (documentId) {
      console.log(`Processing existing document with ID: ${documentId}`);

      try {
        // Try to retrieve the document content
        if (hasAdminCredentials) {
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            const docRef = adminDb.collection("documents").doc(documentId);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
              return NextResponse.json(
                { error: "Document not found" },
                { status: 404 }
              );
            }

            docData = docSnap.data();
            text = docData.content || "";
            console.log(
              `Retrieved document content: ${text.length} characters`
            );
          }
        }

        if (!docData) {
          // Fall back to client SDK
          const db = getFirestore();
          const docRef = doc(db, "documents", documentId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            return NextResponse.json(
              { error: "Document not found" },
              { status: 404 }
            );
          }

          docData = docSnap.data();
          text = docData.content || "";
          console.log(`Retrieved document content: ${text.length} characters`);
        }
      } catch (error) {
        console.error("Error retrieving document:", error);
        return NextResponse.json(
          {
            error: "Failed to retrieve document content",
            message: error.message,
          },
          { status: 500 }
        );
      }
    }

    // Process file upload if a file was provided
    let uploadResult = null;

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Extract content from the file
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        text = await extractTextFromPdf(buffer);
      } else if (fileName.endsWith(".txt")) {
        text = buffer.toString("utf-8");
      } else {
        return NextResponse.json(
          { error: "Unsupported file type" },
          { status: 400 }
        );
      }

      // Save the file to Firebase Storage
      if (hasAdminCredentials && verifiedUserId) {
        try {
          // Try to use Admin SDK for storage
          const adminStorage = await getAdminStorage();
          if (adminStorage) {
            const bucket = adminStorage.bucket();
            const filePath = `documents/${verifiedUserId}/${Date.now()}_${
              file.name
            }`;
            const fileRef = bucket.file(filePath);

            await fileRef.save(buffer, {
              metadata: {
                contentType: file.type,
              },
            });

            uploadResult = {
              fileName: file.name,
              path: filePath,
              url: `https://storage.googleapis.com/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/${filePath}`,
            };
          }
        } catch (error) {
          console.error("Admin Storage upload failed:", error);
          // Will fall back to client SDK
        }
      }

      // Fall back to client SDK if admin upload failed
      if (!uploadResult) {
        try {
          const storage = getStorage();
          const storageRef = ref(
            storage,
            `documents/${Date.now()}_${file.name}`
          );
          const snapshot = await uploadBytes(storageRef, buffer, {
            contentType: file.type,
          });
          const downloadURL = await getDownloadURL(snapshot.ref);

          uploadResult = {
            fileName: file.name,
            path: snapshot.ref.fullPath,
            url: downloadURL,
          };
        } catch (error) {
          console.error("Error uploading to Firebase Storage:", error);
          return NextResponse.json(
            { error: "Failed to upload file to storage" },
            { status: 500 }
          );
        }
      }
    }

    // Process the text using our 3-model pipeline
    let summary = "";
    let documentData = {};

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
        onProgress: (stage, stats) => {
          // Update processing status in your database
          try {
            // Calculate progress percentage based on stage
            let progressPercent = 0;
            switch (stage) {
              case "chunking":
                progressPercent = 10;
                break;
              case "extraction":
                progressPercent = 30;
                break;
              case "classification":
                progressPercent = 60;
                break;
              case "generation":
                progressPercent = 90;
                break;
              default:
                progressPercent = 10;
            }

            // Update job status
            saveProcessingJob(verifiedUserId, {
              userId: verifiedUserId,
              jobId,
              fileName: file?.name || docData?.fileName || "document.txt",
              status: "processing",
              progress: progressPercent,
              documentId,
              processingStats: stats,
              currentStage: stage,
              updatedAt: new Date(),
            });
          } catch (error) {
            console.error("Error updating processing status:", error);
          }
        },
      });

      // Process the document
      console.log(
        `Starting 3-model pipeline processing for user ${verifiedUserId}`
      );
      const pipelineResult = await pipeline.process(text);

      // Save the output to a file
      const outputDir = path.join(uploadsDir, verifiedUserId);
      await fs.mkdir(outputDir, { recursive: true });

      const outputFileName = `dataset-${Date.now()}.${
        pipeline.outputFormat === "csv" ? "csv" : "jsonl"
      }`;
      const outputFilePath = path.join(outputDir, outputFileName);

      await fs.writeFile(outputFilePath, pipelineResult.output);

      // Update the summary with results from pipeline processing
      summary = `Successfully processed ${pipelineResult.stats.totalChunks} chunks and generated ${pipelineResult.stats.generatedVariants} synthetic variants.`;

      // Calculate classification stats
      const classificationStats = {
        Critical: 0,
        Important: 0,
        Standard: 0,
      };

      // Update the documentData with the results
      documentData = {
        summary,
        content: text.substring(0, 100000), // Limit text length
        updatedAt: new Date(), // Use standard Date object instead of serverTimestamp()
        processingStats: pipelineResult.stats,
        classificationStats,
        outputFilePath: `${verifiedUserId}/${outputFileName}`,
        processingCompleted: true,
        creditsUsed: pipelineResult.stats.generatedVariants, // Each variant costs 1 credit
      };
    } catch (error) {
      console.error("Pipeline processing error:", error);
      return NextResponse.json(
        { error: "Failed to process document" },
        { status: 500 }
      );
    }

    // Add file info if we uploaded a file
    if (uploadResult) {
      documentData = {
        ...documentData,
        fileName: uploadResult.fileName,
        filePath: uploadResult.path,
        fileUrl: uploadResult.url,
        createdAt: docData?.createdAt || new Date(), // Use standard Date object
      };
    }

    // Set the user ID
    documentData.userId = verifiedUserId;

    let docRef;
    if (documentId) {
      // Update existing document
      if (hasAdminCredentials) {
        try {
          // Try to use Admin SDK
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            // Convert any serverTimestamp to regular Date objects to avoid serialization issues
            const cleanedData = {
              ...documentData,
              id: documentId,
            };

            docRef = adminDb.collection("documents").doc(documentId);
            await docRef.update(cleanedData);
          }
        } catch (error) {
          console.error("Admin Firestore update failed:", error);
          // Will fall back to client SDK
        }
      }

      if (!docRef) {
        // Fall back to client SDK
        const db = getFirestore();
        docRef = doc(db, "documents", documentId);
        await updateDoc(docRef, {
          ...documentData,
          id: documentId,
          updatedAt: serverTimestamp(), // Use serverTimestamp for client SDK
        });
      }
    } else {
      // Create a new document
      if (hasAdminCredentials) {
        try {
          // Try to use Admin SDK
          const adminDb = await getAdminFirestore();
          if (adminDb) {
            docRef = await adminDb.collection("documents").add({
              ...documentData,
            });
            await docRef.update({ id: docRef.id });
            documentId = docRef.id;
          }
        } catch (error) {
          console.error("Admin Firestore create failed:", error);
          // Will fall back to client SDK
        }
      }

      if (!documentId) {
        // Fall back to client SDK
        const db = getFirestore();
        docRef = await addDoc(collection(db, "documents"), {
          ...documentData,
        });

        await updateDoc(docRef, { id: docRef.id });
        documentId = docRef.id;
      }
    }

    // Create a dataset record for the processed document
    await createDatasetRecord(
      documentId,
      text,
      summary,
      hasAdminCredentials,
      documentData.userId
    );

    // After processing has started, save initial status to Firestore
    try {
      const processingJob = {
        userId: verifiedUserId,
        jobId,
        fileName: documentData.fileName || "document-" + documentId,
        status: "processing",
        progress: 0,
        createdAt: new Date(),
        documentId: documentId || null,
        processingOptions: {
          chunkSize: parseInt(formData.get("chunkSize") || 1000, 10),
          overlap: parseInt(formData.get("overlap") || 100, 10),
          outputFormat: formData.get("outputFormat") || "jsonl",
          classFilter: formData.get("classFilter") || "all",
        },
      };

      await saveProcessingJob(verifiedUserId, processingJob);
    } catch (error) {
      console.error("Error saving initial job status to Firestore:", error);
      // Continue processing even if saving to Firestore fails
    }

    // Generate unique job ID for status tracking
    const statusJobId = jobId;

    // Create initial processing status entry
    try {
      // Update status in Firestore to show processing has started
      const processingJob = {
        userId: verifiedUserId,
        jobId: statusJobId,
        fileName: documentData.fileName || "document-" + documentId,
        status: "processing",
        progress: 10, // Initial progress after document is saved
        documentId,
        updatedAt: new Date(),
      };

      await saveProcessingJob(verifiedUserId, processingJob);

      // Also create status entry in the process-status API
      await fetch(`${new URL(request.url).origin}/api/process-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: verifiedUserId,
          fileName: documentData.fileName || "document-" + documentId,
          jobId: statusJobId,
          status: "processing",
          processedChunks: 10,
          totalChunks: 100,
          result: {
            documentId,
            summary: summary,
            textLength: text.length,
            filePath: `${verifiedUserId}/${
              documentData.fileName || "document.txt"
            }`,
          },
          updatedAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error creating status entry:", error);
      // Non-critical, continue even if fails
    }

    // Return the results with job ID
    return NextResponse.json({
      documentId,
      summary: summary,
      textLength: text.length,
      fileName: documentData.fileName || "document-" + documentId,
      jobId: statusJobId,
    });
  } catch (error) {
    console.error("Document processing error:", error);

    if (error.code === "permission-denied") {
      return NextResponse.json(
        {
          error:
            "Authentication error: The server couldn't authenticate with Firebase.",
          message:
            "Please try the following steps:\n1. Refresh the page\n2. Sign out and sign in again\n3. If using an older tab, open a fresh browser tab\n4. If the problem persists, your session may have expired or you may not have access to this document.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to process document",
        message: error.message,
      },
      { status: 500 }
    );
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
