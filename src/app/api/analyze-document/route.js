import { NextResponse } from "next/server";
import { evaluateTextComplexity } from "../process-document/services/pipeline";
import { validateUserSession } from "@/lib/auth";

// Memory estimations - these are rough approximations
const MEMORY_BASE_MB = 250; // Base memory usage
const MEMORY_PER_CHAR_MB = 0.00002; // ~20KB per 1000 chars
const MEMORY_PER_CHUNK_MB = 2.5; // ~2.5MB per chunk processing overhead

/**
 * API endpoint to analyze a document and estimate processing requirements
 * This helps the client make decisions about batch processing
 */
export async function POST(request) {
  try {
    // Validate user session
    const session = await validateUserSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse the request
    const data = await request.json();
    const { text, documentSize } = data;

    if (!text && !documentSize) {
      return NextResponse.json(
        { error: "Text or document size is required" },
        { status: 400 }
      );
    }

    // Analyze the document
    const complexity = evaluateTextComplexity(text);
    
    // Calculate memory estimates based on text length and complexity
    const memoryEstimateMB = Math.ceil(
      MEMORY_BASE_MB + 
      (text.length * MEMORY_PER_CHAR_MB) + 
      (complexity.estimatedChunks * MEMORY_PER_CHUNK_MB)
    );
    
    // Memory requirements increase with complexity
    const memoryMultiplier = 
      complexity.level === "high" ? 1.5 : 
      complexity.level === "medium" ? 1.2 : 1;
    
    const adjustedMemoryEstimateMB = Math.ceil(memoryEstimateMB * memoryMultiplier);
    
    // Determine if batch processing is recommended
    // Base recommendation on memory usage and text complexity
    const BATCH_MEMORY_THRESHOLD_MB = 500; // If estimated memory usage exceeds this, use batching
    const BATCH_CHUNKS_THRESHOLD = 20; // If estimated chunks exceed this, use batching
    
    const recommendBatchProcessing = 
      adjustedMemoryEstimateMB > BATCH_MEMORY_THRESHOLD_MB || 
      complexity.estimatedChunks > BATCH_CHUNKS_THRESHOLD ||
      complexity.level === "high";
    
    // Number of recommended batches
    const recommendedBatches = recommendBatchProcessing
      ? Math.min(
          Math.max(
            2,
            Math.ceil(adjustedMemoryEstimateMB / BATCH_MEMORY_THRESHOLD_MB),
            Math.ceil(complexity.estimatedChunks / BATCH_CHUNKS_THRESHOLD)
          ),
          10 // Cap at 10 batches
        )
      : 1;
    
    // Add recommended batch size if batching is needed
    const batchSize = recommendBatchProcessing
      ? Math.ceil(text.length / recommendedBatches)
      : text.length;
    
    // Return analysis results
    return NextResponse.json({
      textLength: text.length,
      documentSize: documentSize || text.length,
      complexity: complexity.level,
      complexityScore: complexity.score,
      estimatedChunks: complexity.estimatedChunks,
      estimatedTimeSeconds: complexity.estimatedProcessingTimeSeconds,
      estimatedCredits: complexity.estimatedCredits,
      memoryEstimateMB: adjustedMemoryEstimateMB,
      recommendBatchProcessing,
      recommendedBatches,
      batchSize,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Error analyzing document:", error);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
} 