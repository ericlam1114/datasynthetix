// src/app/api/process-document/config.js
import path from "path";

// Configuration constants
export const UPLOAD_DIRECTORY = path.join(process.cwd(), "uploads");

// Default processing options
export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_OVERLAP = 100;
export const DEFAULT_OUTPUT_FORMAT = "jsonl";
export const DEFAULT_CLASS_FILTER = "all";
export const DEFAULT_MAX_VARIANTS = 3;

// Timeout defaults (in milliseconds)
export const DEFAULT_TIMEOUTS = {
  documentProcessing: 600000, // 10 minutes
  chunkProcessing: 120000,    // 2 minutes
  clauseExtraction: 30000,    // 30 seconds
  clauseClassification: 15000, // 15 seconds
  variantGeneration: 20000,   // 20 seconds per variant
};

// Model IDs
export const MODELS = {
  extractor: "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB",
  classifier: "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy",
  duplicator: "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc",
};