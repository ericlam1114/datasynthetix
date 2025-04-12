// src/app/api/process-document/route.js
import "@ungap/with-resolvers"; // Polyfill for Promise.withResolvers
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';

// Validators and helpers
import { validateFormData, parseProcessingOptions } from "./utils/validators";
import { checkFirebaseAdminCredentials } from "./utils/admin";
import { saveDocumentToStorage } from "./utils/storage";

// Services
import { authenticateUser } from './services/auth';
import { saveProcessingResults } from './services/document';
import { extractText } from './services/textExtraction';
import { handleDocumentProcessing } from './services/pipelineProcessing';
import { createProgressCallback } from './services/progress';
import { 
  createProcessingStatus, 
  updateProcessingStatus, 
  completeProcessingJob 
} from './services/statusUpdate';
import { createErrorHandler } from './services/errorHandler';
import { processExistingDocument } from './services/document-processing';
import { processWithPipeline, evaluateTextComplexity, getMemoryUsage, triggerMemoryCleanup } from './services/pipeline';

// Status tracking for document processing jobs
const jobStatuses = new Map();

// Memory thresholds for API management
const MEMORY_SAFE_THRESHOLD = 70;  // 70% is considered safe
const MEMORY_WARNING_THRESHOLD = 85;  // 85% triggers warnings and throttling
const MEMORY_CRITICAL_THRESHOLD = 95;  // 95% will reject new requests

// Queue management
let isProcessing = false;
const requestQueue = [];
const MAX_QUEUE_SIZE = 10;

/**
 * Updates the status of a processing job
 */
export async function updateJobStatus(jobId, status, details = {}) {
  if (!jobId) return;
  
  // Merge with existing status if present
  const currentStatus = jobStatuses.get(jobId) || {};
  
  const updatedStatus = {
    ...currentStatus,
    ...status,
    ...details,
    lastUpdated: new Date().toISOString()
  };
  
  // Store the updated status
  jobStatuses.set(jobId, updatedStatus);
  
  // Clean up old jobs (older than 1 hour) to prevent memory leaks
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const now = Date.now();
  
  jobStatuses.forEach((status, id) => {
    const lastUpdated = new Date(status.lastUpdated || 0).getTime();
    if (now - lastUpdated > ONE_HOUR_MS) {
      jobStatuses.delete(id);
    }
  });
}

/**
 * Get memory status object for monitoring
 */
function checkMemoryStatus() {
  const memoryUsage = getMemoryUsage();
  return {
    usagePercent: memoryUsage,
    isSafe: memoryUsage < MEMORY_SAFE_THRESHOLD,
    isWarning: memoryUsage >= MEMORY_WARNING_THRESHOLD,
    isCritical: memoryUsage >= MEMORY_CRITICAL_THRESHOLD,
    queueSize: requestQueue.length,
    isProcessing
  };
}

/**
 * Process the next item in the queue
 */
async function processNextInQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }
  
  // Check memory conditions before processing
  const memStatus = checkMemoryStatus();
  if (memStatus.isCritical) {
    console.warn('Critical memory situation, delaying queue processing');
    triggerMemoryCleanup();
    setTimeout(processNextInQueue, 5000); // Try again in 5 seconds
    return;
  }
  
  isProcessing = true;
  
  try {
    const nextItem = requestQueue.shift();
    const { jobId, text, options } = nextItem;
    
    // Update status to show we're processing
    await updateJobStatus(jobId, { status: 'processing', queuePosition: 0 });
    
    // Process the document
    const complexity = evaluateTextComplexity(text);
    const result = await processWithPipeline(text, options, jobId, complexity, updateJobStatus);
    
    // Update final status with results
    await updateJobStatus(jobId, { 
      status: 'completed', 
      result,
      processingTimeMs: result.processingTimeMs || 0,
      complexity
    });
  } catch (error) {
    console.error('Error processing queue item:', error);
  } finally {
    isProcessing = false;
    
    // Clean up memory if needed
    if (getMemoryUsage() > MEMORY_WARNING_THRESHOLD) {
      triggerMemoryCleanup();
    }
    
    // Process next item if any
    if (requestQueue.length > 0) {
      processNextInQueue();
    }
  }
}

/**
 * Add a request to the processing queue
 */
function addToProcessingQueue(jobId, text, options) {
  // Check memory status before adding to queue
  const memStatus = checkMemoryStatus();
  
  if (memStatus.isCritical || requestQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error(
      `Server is currently under high load. Memory usage: ${memStatus.usagePercent}%, ` +
      `Queue size: ${requestQueue.length}/${MAX_QUEUE_SIZE}`
    );
  }
  
  // Add to queue with position
  requestQueue.push({
    jobId,
    text, 
    options,
    addedAt: Date.now()
  });
  
  // Update status to show queue position
  updateJobStatus(jobId, { 
    status: 'queued', 
    queuePosition: requestQueue.length,
    queueLength: requestQueue.length
  });
  
  // Start processing if not already
  if (!isProcessing) {
    processNextInQueue();
  }
  
  return {
    jobId,
    queuePosition: requestQueue.length
  };
}

/**
 * Main POST handler for document processing
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { text, options = {} } = body;
    
    // Validate input
    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }
    
    // Check system capacity
    const memStatus = checkMemoryStatus();
    if (memStatus.isCritical) {
      return NextResponse.json(
        { 
          error: 'Server is currently under high memory load, please try again later',
          memoryUsage: memStatus.usagePercent,
          queueStatus: {
            size: requestQueue.length,
            maxSize: MAX_QUEUE_SIZE
          }
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    // Generate a job ID for tracking
    const jobId = options.jobId || uuidv4();
    
    // Get complexity estimate
    const complexity = evaluateTextComplexity(text);
    
    // Initialize job status
    await updateJobStatus(jobId, { 
      status: 'initialized',
      text: text.length > 500 ? `${text.substring(0, 500)}...` : text,
      complexity,
      options
    });
    
    // For very large documents or when system is under load, use queue
    const shouldQueue = complexity.level === 'high' || 
                       text.length > 50000 || 
                       memStatus.isWarning || 
                       isProcessing;
    
    if (shouldQueue) {
      // Add to processing queue
      const queueInfo = addToProcessingQueue(jobId, text, options);
      
      return NextResponse.json({
        jobId,
        status: 'queued',
        complexity,
        queuePosition: queueInfo.queuePosition,
        queueLength: requestQueue.length,
        estimatedProcessingTime: complexity.estimatedProcessingTime
      });
    } else {
      // For smaller documents, process immediately
      updateJobStatus(jobId, { status: 'processing' });
      
      // Process document with the pipeline
      const result = await processWithPipeline(text, options, jobId, complexity, updateJobStatus);
      
      // Update job status with results
      updateJobStatus(jobId, { 
        status: 'completed',
        result
      });
      
      // Return results
      return NextResponse.json({
        jobId,
        status: 'completed',
        result,
        complexity
      });
    }
  } catch (error) {
    console.error('Error processing document:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error processing document' },
      { status: 500 }
    );
  }
}

/**
 * Process an existing document request
 */
async function processExistingDocumentRequest(userId, documentId, options, jobId, errorHandler) {
  console.log(`Processing existing document: ${documentId}`);
  
  try {
    // Create initial status
    await createProcessingStatus(jobId, {
      userId,
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
  
  // Check admin credentials
  const hasAdminCredentials = await checkFirebaseAdminCredentials();
  
  // Process the existing document
  const documentResult = await processExistingDocument(
    userId, 
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
  
  // Process the document with the pipeline
  try {
    // Handle the document processing with the pipeline
    const result = await handleDocumentProcessing(
      documentResult.text,
      options,
      documentId,
      jobId
    );
    
    // Check if the result has warnings
    const hasWarning = result.warning ? true : false;
    
    // Return success response (with warning info if present)
    return Response.json({
      success: true,
      message: result.message || 'Document processed successfully',
      warning: hasWarning ? result.warning : undefined,
      warningDetails: hasWarning ? result.message : undefined,
      jobId,
      documentId,
      stats: result.stats
    });
  } catch (processingError) {
    // Check for specific error types and handle accordingly
    const statusCode = processingError.statusCode || 500;
    const errorType = processingError.type || 'processing_error';
    const isRecoverable = processingError.recoverable || false;
    
    // For timeout errors, we want to provide a more user-friendly response
    if (errorType === 'timeout_error' || errorType === 'network_timeout') {
      // Log the timeout but don't fail completely - instead mark as a warning
      console.warn(`Processing timeout occurred for document ${documentId}, job ${jobId}`);
      
      await updateProcessingStatus(jobId, {
        status: 'warning',
        message: 'Processing timed out - partial results may be available',
        warning: true,
        warningType: 'timeout',
        progress: 95
      });
      
      // Return a success response with warning
      return Response.json({
        success: true,
        warning: 'timeout',
        message: 'Document processing timed out, but partial results may be available',
        jobId,
        documentId,
        errorDetails: processingError.message
      });
    }
    
    // For other errors, use the error handler
    return Response.json(errorHandler(processingError, { 
      stage: 'pipeline_processing', 
      jobId,
      documentId,
      statusCode,
      errorType,
      recoverable: isRecoverable
    }), { status: statusCode });
  }
}

/**
 * Process a new document request
 */
async function processNewDocumentRequest(userId, file, options, jobId, errorHandler) {
  // Create a processing job record
  try {
    await createProcessingStatus(jobId, {
      userId,
      fileName: file.name,
      status: 'created',
      progress: 0,
      stage: 'initialization'
    });
    
    await updateProcessingStatus(jobId, {
      status: 'processing',
      message: 'Processing started',
      progress: 5
    });
  } catch (statusError) {
    console.error('Error creating initial status:', statusError);
    // Non-critical, continue processing
  }
  
  // Save the document to storage
  let documentInfo;
  try {
    documentInfo = await saveDocumentToStorage(file, userId, options);
    
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
  
  // Extract text from the document
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
  
  // Process the document with the pipeline
  try {
    // Handle the document processing with the pipeline
    const result = await handleDocumentProcessing(
      extractionResult.text,
      options,
      documentInfo.documentId,
      jobId
    );
    
    // Check if the result has warnings
    const hasWarning = result.warning ? true : false;
    
    // Return success response (with warning info if present)
    return Response.json({
      success: true,
      message: result.message || 'Document processed successfully',
      warning: hasWarning ? result.warning : undefined,
      warningDetails: hasWarning ? result.message : undefined,
      jobId,
      documentId: documentInfo.documentId,
      stats: result.stats
    });
  } catch (processingError) {
    // Check for specific error types and handle accordingly
    const statusCode = processingError.statusCode || 500;
    const errorType = processingError.type || 'processing_error';
    const isRecoverable = processingError.recoverable || false;
    
    // For timeout errors, provide a more user-friendly response
    if (errorType === 'timeout_error' || errorType === 'network_timeout') {
      // Log the timeout but don't fail completely
      console.warn(`Processing timeout occurred for document ${documentInfo.documentId}, job ${jobId}`);
      
      await updateProcessingStatus(jobId, {
        status: 'warning',
        message: 'Processing timed out - partial results may be available',
        warning: true,
        warningType: 'timeout',
        progress: 95
      });
      
      // Return a success response with warning
      return Response.json({
        success: true,
        warning: 'timeout',
        message: 'Document processing timed out, but partial results may be available',
        jobId,
        documentId: documentInfo.documentId,
        errorDetails: processingError.message
      });
    }
    
    // For other errors, use the error handler
    return Response.json(errorHandler(processingError, { 
      stage: 'pipeline_processing', 
      jobId,
      documentId: documentInfo.documentId,
      statusCode,
      errorType,
      recoverable: isRecoverable
    }), { status: statusCode });
  }
}

/**
 * API route for downloading files
 */
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
 * GET handler to check job status
 */
export async function GET(request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  
  if (!jobId) {
    return NextResponse.json(
      { error: 'Job ID is required' },
      { status: 400 }
    );
  }
  
  // Get status for the specified job
  const status = jobStatuses.get(jobId);
  
  if (!status) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }
  
  // Return the current job status
  return NextResponse.json({
    jobId,
    ...status,
    memoryStatus: checkMemoryStatus()
  });
}