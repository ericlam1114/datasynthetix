import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import { getFirestore, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { extractTextFromPdf } from "../process-document/utils/extractText";
import { getAdminFirestore, checkFirebaseAdminCredentials } from "../../../lib/firebase-admin";
import { initializeOpenAI } from "../../../lib/openai";
import { ensureUploadsDir } from "../process-document/utils/fileUtils";
import { SyntheticDataPipeline } from "../../../lib/SyntheticDataPipeline";
import { saveProcessingJob } from "../process-status/utils/jobUtils";

/**
 * Handles batch document uploads, processes all documents, and aggregates results
 */
export async function POST(request) {
  const jobId = uuidv4();
  
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");
    const authToken = formData.get("authToken");
    const userId = formData.get("userId");
    const projectName = formData.get("projectName") || `Batch Project ${new Date().toISOString()}`;
    
    // Validate input
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided for batch processing" },
        { status: 400 }
      );
    }
    
    if (!authToken && !userId) {
      return NextResponse.json(
        { error: "Authentication token or user ID is required" },
        { status: 400 }
      );
    }
    
    // Use admin credentials if available
    const hasAdminCredentials = await checkFirebaseAdminCredentials();
    
    // Initialize processing options
    const processingOptions = {
      chunkSize: parseInt(formData.get("chunkSize") || 1000, 10),
      overlap: parseInt(formData.get("overlap") || 100, 10),
      outputFormat: formData.get("outputFormat") || "jsonl",
      classFilter: formData.get("classFilter") || "all",
      ocr: formData.get("ocr") === "true",
    };
    
    // Verify userId or get it from authToken
    let verifiedUserId = userId;
    if (!verifiedUserId && authToken) {
      // Add verification logic here if needed
      verifiedUserId = "user_" + uuidv4().substring(0, 8);
    }
    
    // Create batch project ID
    const batchProjectId = uuidv4();
    
    // Create uploads directory
    const uploadsDir = path.join(process.cwd(), "uploads");
    await ensureUploadsDir(uploadsDir);
    
    // Create batch project directory
    const batchDir = path.join(uploadsDir, verifiedUserId, "batch_" + batchProjectId);
    await ensureUploadsDir(batchDir);
    
    // Start batch processing job in Firestore
    const batchJob = {
      userId: verifiedUserId,
      jobId,
      status: "processing",
      progress: 0,
      totalFiles: files.length,
      processedFiles: 0,
      createdAt: new Date(),
      projectName,
      batchProjectId,
      processingOptions,
    };
    
    await saveProcessingJob(verifiedUserId, batchJob);
    
    // Update client
    const response = NextResponse.json({
      batchProjectId,
      jobId,
      status: "processing",
      message: `Processing ${files.length} documents`,
    });
    
    // Process each file asynchronously
    processFilesInBackground(files, verifiedUserId, batchProjectId, batchDir, processingOptions, jobId, hasAdminCredentials, projectName);
    
    return response;
    
  } catch (error) {
    console.error("Batch document processing error:", error);
    return NextResponse.json(
      { error: "Failed to process batch documents", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Processes files in the background and aggregates results
 */
async function processFilesInBackground(files, userId, batchProjectId, batchDir, processingOptions, jobId, hasAdminCredentials, projectName) {
  try {
    // Array to store processing results
    const results = [];
    let processedFiles = 0;
    const totalFiles = files.length;
    
    // Process files sequentially to avoid memory issues
    for (const file of files) {
      try {
        // Extract file data
        const fileName = file.name;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const fileType = file.type;
        
        // Determine file extension and extraction method
        let extractedText = "";
        if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
          extractedText = await extractTextFromPdf(fileBuffer, { useOcr: processingOptions.ocr });
        } else if (fileType === "text/plain" || fileName.toLowerCase().endsWith(".txt")) {
          extractedText = fileBuffer.toString("utf-8");
        } else {
          console.warn(`Unsupported file type: ${fileType}, skipping: ${fileName}`);
          continue;
        }
        
        if (!extractedText || extractedText.trim().length < 25) {
          console.warn(`Insufficient text extracted from file: ${fileName}`);
          continue;
        }
        
        // Process the document
        const pipeline = new SyntheticDataPipeline({
          ...processingOptions,
          onProgress: (stage, stats) => {
            console.log(`File: ${fileName}, Stage: ${stage}, Stats:`, stats);
          }
        });
        
        const pipelineResult = await pipeline.process(extractedText);
        
        // Save individual file output
        const outputFileName = `${fileName.replace(/\.[^/.]+$/, "")}-${Date.now()}.${
          pipeline.outputFormat === "csv" ? "csv" : "jsonl"
        }`;
        const outputFilePath = path.join(batchDir, outputFileName);
        await fs.writeFile(outputFilePath, pipelineResult.output);
        
        // Store result for aggregation
        results.push({
          fileName,
          stats: pipelineResult.stats,
          outputPath: outputFilePath,
          output: pipelineResult.output,
        });
        
        // Update progress
        processedFiles++;
        
        // Update job status
        await updateJobStatus(userId, jobId, {
          status: "processing",
          progress: Math.round((processedFiles / totalFiles) * 100),
          processedFiles,
          totalFiles,
        });
        
      } catch (fileError) {
        console.error(`Error processing file: ${file.name}`, fileError);
        // Continue with next file
      }
    }
    
    // Aggregate results after all files are processed
    const aggregatedOutput = await aggregateResults(results, batchProjectId, batchDir, processingOptions.outputFormat);
    
    // Save batch project to Firestore
    await saveBatchProject(userId, batchProjectId, projectName, results, aggregatedOutput, hasAdminCredentials);
    
    // Update final job status
    await updateJobStatus(userId, jobId, {
      status: "completed",
      progress: 100,
      processedFiles,
      totalFiles,
      batchProjectId,
      aggregatedOutput: {
        fileName: aggregatedOutput.fileName,
        path: aggregatedOutput.outputPath,
      },
    });
    
  } catch (error) {
    console.error("Background processing error:", error);
    
    // Update job status to failed
    try {
      await updateJobStatus(userId, jobId, {
        status: "failed",
        error: error.message,
      });
    } catch (statusError) {
      console.error("Failed to update job status:", statusError);
    }
  }
}

/**
 * Updates the status of a batch processing job
 */
async function updateJobStatus(userId, jobId, statusUpdate) {
  try {
    const update = {
      ...statusUpdate,
      updatedAt: new Date(),
    };
    
    await saveProcessingJob(userId, {
      userId,
      jobId,
      ...update,
    });
    
    // Also update the process-status API
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/process-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          jobId,
          ...update,
        }),
      });
    } catch (fetchError) {
      console.error("Error updating status API:", fetchError);
      // Non-critical, continue
    }
    
  } catch (error) {
    console.error("Error updating job status:", error);
    // Non-critical, continue
  }
}

/**
 * Aggregates results from multiple document processing
 */
async function aggregateResults(results, batchProjectId, batchDir, outputFormat) {
  if (results.length === 0) {
    return { output: "", fileName: "empty-batch.jsonl", outputPath: "" };
  }
  
  try {
    // Get all processed data
    const allData = [];
    
    // For each result, parse the output based on the format and add to allData
    for (const result of results) {
      try {
        const fileData = result.output || "";
        
        if (outputFormat === "jsonl") {
          // Parse JSONL (each line is a JSON object)
          const lines = fileData.split("\n").filter(line => line.trim().length > 0);
          for (const line of lines) {
            const parsedLine = JSON.parse(line);
            
            // Add filename information
            parsedLine.sourceFile = result.fileName;
            allData.push(parsedLine);
          }
        } else if (outputFormat === "csv") {
          // For CSV, we'll need proper CSV parsing, but for now just append
          // This is simplified - a real implementation would need proper CSV handling
          if (allData.length === 0) {
            // Include header for first file
            allData.push(fileData);
          } else {
            // Skip header for subsequent files
            const lines = fileData.split("\n");
            if (lines.length > 1) {
              allData.push(lines.slice(1).join("\n"));
            }
          }
        } else {
          // For other formats, just keep as is
          allData.push(fileData);
        }
      } catch (parseError) {
        console.error(`Error parsing result output for file: ${result.fileName}`, parseError);
        // Continue with next result
      }
    }
    
    // Create aggregated output
    let aggregatedContent = "";
    if (outputFormat === "jsonl") {
      aggregatedContent = allData.map(item => JSON.stringify(item)).join("\n");
    } else if (outputFormat === "csv") {
      // For CSV, just join the parts
      aggregatedContent = allData.join("\n");
    } else {
      // For other formats, concatenate with separator
      aggregatedContent = allData.join("\n\n");
    }
    
    // Save aggregated content
    const fileName = `batch-${batchProjectId}.${outputFormat === "csv" ? "csv" : "jsonl"}`;
    const outputPath = path.join(batchDir, fileName);
    await fs.writeFile(outputPath, aggregatedContent);
    
    return {
      output: aggregatedContent,
      fileName,
      outputPath,
    };
  } catch (error) {
    console.error("Error aggregating results:", error);
    throw error;
  }
}

/**
 * Saves batch project information to Firestore
 */
async function saveBatchProject(userId, batchProjectId, projectName, results, aggregatedOutput, hasAdminCredentials) {
  try {
    const batchProject = {
      userId,
      batchProjectId,
      projectName,
      fileCount: results.length,
      createdAt: new Date(),
      aggregatedStats: calculateAggregatedStats(results),
      outputPath: aggregatedOutput.outputPath,
      outputFileName: aggregatedOutput.fileName,
    };
    
    if (hasAdminCredentials) {
      try {
        // Try Admin SDK first
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          const batchRef = adminDb.collection("batchProjects").doc(batchProjectId);
          await batchRef.set({
            ...batchProject,
            id: batchProjectId,
          });
          return batchProjectId;
        }
      } catch (adminError) {
        console.error("Admin Firestore batch project creation failed:", adminError);
        // Fall back to client SDK
      }
    }
    
    // Fall back to client SDK
    const db = getFirestore();
    const batchRef = await addDoc(collection(db, "batchProjects"), {
      ...batchProject,
      createdAt: serverTimestamp(),
    });
    
    await updateDoc(batchRef, { id: batchRef.id });
    return batchRef.id;
    
  } catch (error) {
    console.error("Error saving batch project:", error);
    throw error;
  }
}

/**
 * Calculates aggregated stats across all processed files
 */
function calculateAggregatedStats(results) {
  const aggregated = {
    totalChunks: 0,
    extractedClauses: 0,
    classifiedClauses: 0,
    generatedVariants: 0,
    processedFiles: results.length,
    classificationStats: {
      Critical: 0,
      Important: 0,
      Standard: 0,
    },
  };
  
  for (const result of results) {
    if (result.stats) {
      aggregated.totalChunks += result.stats.totalChunks || 0;
      aggregated.extractedClauses += result.stats.extractedClauses || 0;
      aggregated.classifiedClauses += result.stats.classifiedClauses || 0;
      aggregated.generatedVariants += result.stats.generatedVariants || 0;
      
      // Add classification stats if available
      if (result.stats.classificationStats) {
        aggregated.classificationStats.Critical += result.stats.classificationStats.Critical || 0;
        aggregated.classificationStats.Important += result.stats.classificationStats.Important || 0;
        aggregated.classificationStats.Standard += result.stats.classificationStats.Standard || 0;
      }
    }
  }
  
  return aggregated;
}

/**
 * GET endpoint to retrieve batch project status and results
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const batchProjectId = url.searchParams.get("batchProjectId");
    const userId = url.searchParams.get("userId");
    
    if (!batchProjectId) {
      return NextResponse.json(
        { error: "Batch project ID is required" },
        { status: 400 }
      );
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }
    
    // Try to get batch project info
    let batchProject = null;
    
    // Try Admin SDK first
    const hasAdminCredentials = await checkFirebaseAdminCredentials();
    if (hasAdminCredentials) {
      try {
        const adminDb = await getAdminFirestore();
        if (adminDb) {
          const batchRef = adminDb.collection("batchProjects").doc(batchProjectId);
          const batchDoc = await batchRef.get();
          
          if (batchDoc.exists && batchDoc.data().userId === userId) {
            batchProject = batchDoc.data();
          }
        }
      } catch (adminError) {
        console.error("Admin Firestore batch project retrieval failed:", adminError);
        // Fall back to client SDK
      }
    }
    
    // Fall back to client SDK if needed
    if (!batchProject) {
      const db = getFirestore();
      const batchQuery = query(
        collection(db, "batchProjects"),
        where("batchProjectId", "==", batchProjectId),
        where("userId", "==", userId)
      );
      
      const querySnapshot = await getDocs(batchQuery);
      if (!querySnapshot.empty) {
        batchProject = querySnapshot.docs[0].data();
      }
    }
    
    if (!batchProject) {
      return NextResponse.json(
        { error: "Batch project not found" },
        { status: 404 }
      );
    }
    
    // Get related job status
    let jobStatus = null;
    try {
      const db = getFirestore();
      const jobQuery = query(
        collection(db, "processingJobs"),
        where("batchProjectId", "==", batchProjectId),
        where("userId", "==", userId)
      );
      
      const jobSnapshot = await getDocs(jobQuery);
      if (!jobSnapshot.empty) {
        jobStatus = jobSnapshot.docs[0].data();
      }
    } catch (jobError) {
      console.error("Error retrieving job status:", jobError);
      // Non-critical, continue
    }
    
    return NextResponse.json({
      batchProject,
      jobStatus,
    });
    
  } catch (error) {
    console.error("Error retrieving batch project:", error);
    return NextResponse.json(
      { error: "Failed to retrieve batch project", message: error.message },
      { status: 500 }
    );
  }
} 