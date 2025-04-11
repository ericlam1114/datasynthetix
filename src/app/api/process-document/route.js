// src/app/api/process-document/route.js
import "@ungap/with-resolvers"; // Polyfill for Promise.withResolvers
import { NextResponse } from "next/server";

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

/**
 * Main HTTP POST handler for document processing
 */
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
    const tempJobId = formData.get('tempJobId');
    
    // Create a job ID (use the temp one if provided)
    const jobId = tempJobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Validate form data
    const validation = validateFormData(formData);
    if (!validation.valid) {
      return Response.json(errorHandler(new Error(validation.error), { 
        stage: validation.stage,
        statusCode: 400 
      }), { status: 400 });
    }
    
    // Parse processing options
    const options = parseProcessingOptions(formData, file);
    
    // Check if we're processing an existing document
    if (documentId) {
      return await processExistingDocumentRequest(user.uid, documentId, options, jobId, errorHandler);
    } else {
      return await processNewDocumentRequest(user.uid, file, options, jobId, errorHandler);
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
    
    // Return success response
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
    
    // Return success response
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