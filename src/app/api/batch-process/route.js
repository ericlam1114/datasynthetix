import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import PDFParser from "pdf-parse";
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  arrayUnion,
  Timestamp,
  getFirestore
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeApp } from "firebase/app";
import { checkFirebaseAdminCredentials, initializeAdminApp } from "../../../lib/firebase-admin";
import { ensureUploadsDir, createUserDirectory, saveFileToDisk, sanitizeFileName } from "../process-document/utils/fileUtils";
import { initializeOpenAI, getOpenAI } from "../../../lib/openai";
import { SyntheticDataPipeline } from "../../../lib/SyntheticDataPipeline";
import { saveProcessingJob, getProcessingJob, updateJobStatus } from "../process-status/utils/jobUtils.js";

// Initialize Firebase if needed
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase app locally for this route
const firebaseApp = initializeApp(firebaseConfig, 'batch-process-route');
const firestore = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// Initialize PDF.js GlobalWorkerOptions
// This prevents the "Using PDF.js without GlobalWorkerOptions in Node.js" warning
if (typeof window === 'undefined') {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
    
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      console.log("PDF.js GlobalWorkerOptions initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing PDF.js GlobalWorkerOptions:", error);
  }
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MIN_TEXT_LENGTH = 50; // Minimum characters required for processing

export async function POST(req) {
  // Generate a unique job ID
  const jobId = uuidv4();
  const projectId = uuidv4();

  try {
    const formData = await req.formData();
    
    // Get authentication token
    const authToken = formData.get('authToken');
    if (!authToken) {
      return NextResponse.json({ error: 'Authentication token is required' }, { status: 401 });
    }
    
    // Use the authToken as userId for simplicity in testing
    // In a real application, we would verify the token with Firebase Auth
    const userId = authToken;
    
    // Get project name or use default
    const projectName = formData.get('projectName') || `Batch Project ${new Date().toISOString()}`;
    
    // Processing options
    const outputFormat = formData.get('outputFormat') || 'JSONL';
    const minLength = parseInt(formData.get('minLength') || '50', 10);
    const maxClausesToProcess = parseInt(formData.get('maxClausesToProcess') || '0', 10);
    const maxVariantsPerClause = parseInt(formData.get('maxVariantsPerClause') || '3', 10);
    const includeOriginal = formData.get('includeOriginal') === 'true';
    const filterClassifications = formData.get('filterClassifications') || '';
    
    // Get the files
    const files = formData.getAll('files');
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`Processing ${files.length} files for user ${userId}`);
    
    // Create directories
    const userUploadsDir = path.join(process.cwd(), 'uploads', userId);
    const batchProjectDir = path.join(userUploadsDir, 'batch', projectId);
    
    // Ensure directories exist
    await ensureUploadsDir(userUploadsDir);
    await ensureUploadsDir(batchProjectDir);
    
    // Initialize batch processing job in Firestore
    const initialJobData = {
      userId,
      jobId,
      projectId,
      projectName,
      totalFiles: files.length,
      processedFiles: 0,
      status: 'processing',
      outputFormat,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      options: {
        minLength,
        maxClausesToProcess,
        maxVariantsPerClause,
        includeOriginal,
        filterClassifications: filterClassifications.split(',').filter(Boolean),
        outputFormat
      }
    };
    
    await saveProcessingJob(userId, initialJobData);
    
    // Process files in background
    processFilesInBackground(
      files,
      userId,
      jobId,
      projectId,
      batchProjectDir,
      initialJobData.options
    ).catch(error => {
      console.error(`Error processing batch job ${jobId}:`, error);
      updateJobStatus(userId, jobId, 'error', {
        error: error.message || 'Unknown error during batch processing'
      }).catch(e => console.error('Failed to update job status:', e));
    });
    
    return NextResponse.json({
      message: 'Batch processing started',
      jobId,
      projectId,
      totalFiles: files.length
    });
  } catch (error) {
    console.error('Error in batch processing endpoint:', error);
    return NextResponse.json({ error: error.message || 'Failed to process batch request' }, { status: 500 });
  }
}

// Processes files in the background, updates job status, and aggregates results
async function processFilesInBackground(files, userId, jobId, projectId, batchProjectDir, options) {
  console.log(`Starting background processing for job ${jobId} with ${files.length} files`);
  
  // Enable simulation mode for faster testing
  const isSimulationMode = process.env.NEXT_PUBLIC_USE_SIMULATION === 'true';
  console.log(`Simulation mode: ${isSimulationMode ? 'enabled' : 'disabled'}`);
  
  try {
    const fileResults = [];
    let processedFiles = 0;
    const totalFiles = files.length;
    
    // Update job status to show we've started processing
    await updateJobStatus(userId, jobId, 'processing', {
      message: 'Starting batch processing',
      processedFiles: 0,
      totalFiles,
      percentComplete: 0
    });
    
    console.log(`Processing ${files.length} files sequentially to avoid memory issues`);
    
    // Process files sequentially to avoid memory issues
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const originalFilename = file.name;
      const fileId = uuidv4();
      const filePath = path.join(batchProjectDir, `${fileId}-${originalFilename}`);
      
      console.log(`[${i+1}/${files.length}] Processing file: ${originalFilename}`);
      
      try {
        // Save file to disk
        console.log(`Saving file ${originalFilename} to ${filePath}`);
        
        // Import the saveFileToDisk function from the fileUtils
        const { saveFileToDisk } = await import('../process-document/utils/fileUtils.js');
        await saveFileToDisk(file, filePath);
        console.log(`Successfully saved file to ${filePath}`);
        
        // Extract text based on file type
        let extractedText = '';
        const fileExtension = path.extname(originalFilename).toLowerCase();
        
        console.log(`Extracting text from ${fileExtension} file`);
        
        if (fileExtension === '.pdf') {
          extractedText = await extractTextFromPdf(filePath, options.useOcr);
        } else if (fileExtension === '.txt') {
          const buffer = await fs.promises.readFile(filePath, 'utf8');
          extractedText = buffer.toString();
        } else {
          throw new Error(`Unsupported file type: ${fileExtension}`);
        }
        
        console.log(`Extracted ${extractedText.length} characters of text`);
        
        if (extractedText.length < options.minLength) {
          throw new Error(`Extracted text is too short (${extractedText.length} chars). Minimum required: ${options.minLength}`);
        }
        
        // For simulation mode, skip actual processing but simulate success
        let pipelineResult;
        
        if (isSimulationMode) {
          console.log('Using simulation mode - skipping actual processing');
          pipelineResult = {
            data: JSON.stringify({ 
              simulation: true, 
              sample: extractedText.substring(0, 100),
              timestamp: new Date().toISOString()
            }),
            stats: {
              totalClauses: 5,
              extractedClauses: 5,
              classifiedClauses: 5,
              importantClauses: 2,
              processedTokens: 1000
            }
          };
          
          // Add a slight delay to simulate processing time
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Process the extracted text using the SyntheticDataPipeline
          console.log('Initializing SyntheticDataPipeline for processing');
          const pipeline = new SyntheticDataPipeline();
          
          console.log('Starting document processing with options:', JSON.stringify(options));
          pipelineResult = await pipeline.processDocument(extractedText, {
            outputFormat: options.outputFormat,
            maxClausesToProcess: options.maxClausesToProcess,
            maxVariantsPerClause: options.maxVariantsPerClause,
            includeOriginal: options.includeOriginal,
            filterClassifications: options.filterClassifications,
          });
          console.log('Document processing completed successfully');
        }
        
        // Save individual file output
        const outputFilePath = path.join(batchProjectDir, `${fileId}-output.${options.outputFormat.toLowerCase()}`);
        await fs.promises.writeFile(outputFilePath, pipelineResult.data);
        console.log(`Saved output to ${outputFilePath}`);
        
        // Update job status
        processedFiles++;
        const percentComplete = Math.round((processedFiles / totalFiles) * 100);
        
        console.log(`Processed ${processedFiles}/${totalFiles} files (${percentComplete}% complete)`);
        await updateJobStatus(userId, jobId, 'processing', {
          processedFiles,
          percentComplete,
          message: `Processed ${processedFiles} of ${totalFiles} files`
        });
        
        // Add to results
        fileResults.push({
          fileId,
          originalFilename,
          outputFilePath,
          stats: pipelineResult.stats
        });
        
        console.log(`Successfully processed file ${originalFilename}`);
      } catch (error) {
        console.error(`Error processing file ${originalFilename}:`, error);
        
        fileResults.push({
          fileId,
          originalFilename,
          error: error.message || 'Unknown error during processing'
        });
        
        // Update job status
        processedFiles++;
        await updateJobStatus(userId, jobId, 'processing', {
          processedFiles,
          percentComplete: Math.round((processedFiles / totalFiles) * 100),
          message: `Error processing file ${originalFilename}: ${error.message}`
        });
      }
    }
    
    console.log('All files processed, generating aggregated result');
    
    // All files processed, generate aggregated result
    if (fileResults.some(result => !result.error)) {
      const aggregatedResult = await aggregateResults(fileResults, options.outputFormat, batchProjectDir);
      
      console.log('Saving batch project to Firestore');
      
      // Save batch project
      await saveBatchProject(userId, {
        projectId,
        jobId,
        projectName: options.projectName || `Batch Project ${new Date().toISOString()}`,
        status: 'completed',
        outputFormat: options.outputFormat,
        totalFiles,
        processedFiles,
        successfulFiles: fileResults.filter(result => !result.error).length,
        failedFiles: fileResults.filter(result => result.error).length,
        outputPath: aggregatedResult.outputPath,
        files: fileResults,
        completedAt: new Date().toISOString(),
        stats: calculateAggregatedStats(fileResults)
      });
      
      console.log('Updating job status to completed');
      
      // Update job status to completed
      await updateJobStatus(userId, jobId, 'completed', {
        processedFiles,
        stats: calculateAggregatedStats(fileResults),
        message: 'Batch processing completed successfully'
      });
    } else {
      console.log('All files failed to process');
      
      // All files failed
      await saveBatchProject(userId, {
        projectId,
        jobId,
        projectName: options.projectName || `Batch Project ${new Date().toISOString()}`,
        status: 'failed',
        outputFormat: options.outputFormat,
        totalFiles,
        processedFiles,
        successfulFiles: 0,
        failedFiles: fileResults.length,
        files: fileResults,
        completedAt: new Date().toISOString(),
        error: 'All files failed to process'
      });
      
      console.log('Updating job status to failed');
      
      // Update job status to failed
      await updateJobStatus(userId, jobId, 'failed', {
        error: 'All files failed to process',
        message: 'All files failed to process'
      });
    }
    
    console.log(`Background processing completed for job ${jobId}`);
  } catch (error) {
    console.error('Error in background processing:', error);
    await updateJobStatus(userId, jobId, 'failed', {
      error: error.message || 'Unknown error during batch processing',
      message: `Background processing error: ${error.message}`
    });
  }
}

// Update batch project in Firestore
async function updateBatchProject(projectId, updateData) {
  try {
    // Reference to the project document
    const projectRef = doc(firestore, "batchProjects", projectId);
    
    // Update the document
    await updateDoc(projectRef, updateData);
    console.log(`Batch project ${projectId} updated with:`, updateData);
    return true;
  } catch (error) {
    console.error(`Error updating batch project ${projectId}:`, error);
    return false;
  }
}

// Save batch project to Firestore
async function saveBatchProject(userId, projectData) {
  try {
    const db = getFirestore();
    await setDoc(doc(db, 'users', userId, 'batchProjects', projectData.projectId), projectData);
  } catch (error) {
    console.error('Error saving batch project:', error);
    throw new Error('Failed to save batch project to Firestore');
  }
}

// Helper function to aggregate results from multiple document processing
async function aggregateResults(results, outputFormat, batchProjectDir) {
  const successfulResults = results.filter(r => !r.error);
  
  if (successfulResults.length === 0) {
    return { outputPath: null, success: false };
  }
  
  try {
    // Create aggregated output file
    const aggregatedFileName = `aggregated_output.${outputFormat === 'jsonl' ? 'jsonl' : 'csv'}`;
    const aggregatedPath = path.join(batchProjectDir, aggregatedFileName);
    
    if (outputFormat === 'jsonl') {
      // For JSONL, concatenate all files
      const combinedContent = [];
      
      for (const result of successfulResults) {
        const content = await fsPromises.readFile(result.outputFilePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            // Add source file information
            parsed.sourceFile = result.originalFilename;
            combinedContent.push(JSON.stringify(parsed));
          } catch (error) {
            console.warn(`Error parsing JSONL line from ${result.originalFilename}:`, error);
          }
        }
      }
      
      await fsPromises.writeFile(aggregatedPath, combinedContent.join('\n'));
      
    } else if (outputFormat === 'csv') {
      // For CSV, combine with headers only once
      let isFirstFile = true;
      let aggregatedContent = '';
      
      for (const result of successfulResults) {
        const content = await fsPromises.readFile(result.outputFilePath, 'utf8');
        const lines = content.split('\n');
        
        if (isFirstFile) {
          // Include header from first file
          aggregatedContent += lines[0] + ',sourceFile\n';
          isFirstFile = false;
        }
        
        // Add data rows with source file
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            aggregatedContent += lines[i].trim() + `,"${result.originalFilename}"\n`;
          }
        }
      }
      
      await fsPromises.writeFile(aggregatedPath, aggregatedContent);
    }
    
    return {
      outputPath: aggregatedPath,
      success: true
    };
    
  } catch (error) {
    console.error("Error aggregating results:", error);
    return { 
      outputPath: null, 
      success: false, 
      error: error.message 
    };
  }
}

// Helper function to calculate aggregated stats across all processed files
function calculateAggregatedStats(results) {
  const successfulResults = results.filter(r => !r.error);
  
  if (successfulResults.length === 0) {
    return {
      totalChunks: 0,
      extractedClauses: 0,
      classifiedClauses: 0,
      generatedVariants: 0,
      successfulFiles: 0,
      failedFiles: results.length
    };
  }
  
  // Initialize aggregated stats
  const aggregated = {
    totalChunks: 0,
    extractedClauses: 0,
    classifiedClauses: 0,
    generatedVariants: 0,
    successfulFiles: successfulResults.length,
    failedFiles: results.length - successfulResults.length
  };
  
  // Sum up stats from all successful results
  for (const result of successfulResults) {
    if (result.stats) {
      aggregated.totalChunks += result.stats.totalChunks || 0;
      aggregated.extractedClauses += result.stats.extractedClauses || 0;
      aggregated.classifiedClauses += result.stats.classifiedClauses || 0;
      aggregated.generatedVariants += result.stats.generatedVariants || 0;
    }
  }
  
  return aggregated;
}

// Extract text from PDF file
async function extractTextFromPdf(filePath, useOcr = false) {
  try {
    console.log(`Extracting text from PDF: ${filePath}`);
    const pdfBuffer = await fsPromises.readFile(filePath);
    
    try {
      // Try using PDF.js directly first
      const PDFParser = require('pdf-parse');
      const data = await PDFParser(pdfBuffer, {
        // We need to pass a valid path to a dummy PDF for pdf-parse
        // because it uses it for some internal checks
        password: '',
        max: 0, // 0 = unlimited
        version: 'v1.10.100' // Current version of pdf.js
      });
      
      console.log(`PDF parsing complete. Extracted ${data.text.length} characters`);
      
      if (data.text && data.text.trim().length > 0) {
        return data.text;
      }
      
      console.log("No text extracted from PDF using pdf-parse, trying backup method");
    } catch (pdfParseError) {
      console.error("Error with pdf-parse:", pdfParseError);
      console.log("Falling back to backup method");
    }
    
    // Fall back to imported extractTextFromPdf if available
    try {
      // Import the function from utils
      const { extractTextFromPdf: extractPdfFromUtils } = await import("../process-document/utils/extractText.js");
      return await extractPdfFromUtils(pdfBuffer, { useOcr });
    } catch (importError) {
      console.error("Error importing text extraction utility:", importError);
      throw new Error("PDF text extraction failed: " + importError.message);
    }
  } catch (error) {
    console.error(`Error extracting text from PDF ${filePath}:`, error);
    throw error;
  }
}

// GET endpoint to retrieve batch project status and results
export async function GET(request) {
  try {
    // Check Firebase Admin credentials are initialized
    await checkFirebaseAdminCredentials();
    
    // Parse URL parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    
    // Validate required parameters
    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }
    
    // Get batch project from Firestore
    const db = getFirestore();
    const projectRef = doc(db, "batchProjects", projectId);
    const projectSnap = await getDoc(projectRef);
    
    if (!projectSnap.exists()) {
      return NextResponse.json(
        { error: "Batch project not found" },
        { status: 404 }
      );
    }
    
    // Get the related job status
    const batchProject = projectSnap.data();
    let jobStatus = null;
    
    if (batchProject.jobId) {
      const job = await getProcessingJob(batchProject.userId, batchProject.jobId);
      if (job) {
        jobStatus = job;
      }
    }
    
    // Return batch project and job status
    return NextResponse.json({
      batchProject,
      jobStatus
    });
    
  } catch (error) {
    console.error("Error retrieving batch project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve batch project" },
      { status: 500 }
    );
  }
} 