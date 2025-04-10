// src/app/api/process-document/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { parse as pdfParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  serverTimestamp 
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { addDataSet } from '@/lib/firestoreService';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model IDs
const EXTRACTOR_MODEL = "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB";
const CLASSIFIER_MODEL = "ft:gpt-4o-mini-2024-07-18:personal:classifier:BKXRNBJy";
const DUPLICATOR_MODEL = "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'api/uploads');

// Add to all API routes where you need to verify identity (e.g., src/app/api/process-document/route.js)

// Near the start of your POST handler
const userId = formData.get('userId');
const authToken = request.headers.get('authorization')?.split('Bearer ')[1];

// Verify this token matches the user
if (!authToken) {
  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  );
}

try {
  // Verify the token (you need to implement this with Firebase Admin SDK)
  const decodedToken = await verifyAuthToken(authToken);
  
  // Only allow users to access their own data
  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: 'Unauthorized access' },
      { status: 403 }
    );
  }
} catch (error) {
  return NextResponse.json(
    { error: 'Invalid authentication' },
    { status: 401 }
  );
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('userId');
    const chunkSize = parseInt(formData.get('chunkSize') || '1000', 10);
    const overlap = parseInt(formData.get('overlap') || '100', 10);
    const outputFormat = formData.get('outputFormat') || 'jsonl';
    const classFilter = formData.get('classFilter') || 'all'; // 'all', 'critical', 'important', 'critical_important'
    
    const rateLimitResponse = await checkRateLimit(userId, 'process-document');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (!file || !userId) {
      return NextResponse.json(
        { error: 'File and user ID are required' },
        { status: 400 }
      );
    }

    // Check if user has enough credits
    // Estimate 1 credit per 100 words in the document (rough estimate)
    const buffer = Buffer.from(await file.arrayBuffer());
    const estimatedWords = Math.ceil(buffer.toString().split(/\s+/).length / 100) * 100;
    const estimatedCredits = Math.ceil(estimatedWords / 100);
    
    const hasEnoughCredits = await checkUserCredits(userId, estimatedCredits);
    if (!hasEnoughCredits) {
      return NextResponse.json(
        { error: 'Insufficient credits. Please purchase more credits to process this document.' },
        { status: 402 } // 402 Payment Required
      );
    }

    // Create a unique folder for this user's uploads
    const userUploadsDir = path.join(uploadsDir, userId);
    await fs.mkdir(userUploadsDir, { recursive: true });

    // Save the file temporarily
    const fileName = file.name;
    const fileType = getFileExtension(fileName);
    const filePath = path.join(userUploadsDir, fileName);
    
    await fs.writeFile(filePath, buffer);

    // Extract text from file
    let text = '';
    try {
      if (fileType === 'pdf') {
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else if (fileType === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (fileType === 'txt') {
        text = buffer.toString('utf-8');
      } else {
        throw new Error('Unsupported file type');
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      await fs.unlink(filePath).catch(console.error); // Clean up file
      return NextResponse.json(
        { error: 'Failed to extract text from document' },
        { status: 500 }
      );
    }

    // Chunk the text
    const chunks = chunkText(text, chunkSize, overlap);
    
    // Process each chunk with the three models
    const allResults = [];
    let processedChunks = 0;
    let creditsUsed = 0;
    
    for (const chunk of chunks) {
      try {
        // Process the chunk through all three models
        const chunkResults = await processChunk(chunk, userId);
        
        // Filter results based on classification if specified
        const filteredResults = filterByClassification(chunkResults, classFilter);
        
        // Add to results
        allResults.push(...filteredResults);
        
        // Update credits used
        creditsUsed += filteredResults.length;
        
        processedChunks++;
        
        // Update processing status
        await updateProcessingStatus(userId, fileName, processedChunks, chunks.length, creditsUsed);
      } catch (error) {
        if (error.message === 'Insufficient credits') {
          // If we run out of credits during processing, return what we have so far
          break;
        }
        console.error('Error processing chunk:', error);
      }
    }

    // Format the results according to the requested output format
    const formattedResults = formatOutput(allResults, outputFormat);
    
    // Create output file
    let outputContent;
    let outputFileName;
    
    if (outputFormat === 'csv') {
      outputContent = formattedResults; // Already formatted as CSV string
      outputFileName = `${path.basename(fileName, path.extname(fileName))}_processed.csv`;
    } else {
      // For JSON formats, stringify each result separately for JSONL format
      outputContent = formattedResults.map(result => JSON.stringify(result)).join('\n');
      outputFileName = `${path.basename(fileName, path.extname(fileName))}_processed.jsonl`;
    }
    
    const outputFilePath = path.join(userUploadsDir, outputFileName);
    await fs.writeFile(outputFilePath, outputContent);

    // Clean up the original file
    await fs.unlink(filePath).catch(console.error);

    // Create record in the datasets collection
    await addDataSet({
      name: `${path.basename(fileName, path.extname(fileName))}_processed`,
      description: `Processed with SynthData AI using ${outputFormat} format`,
      userId,
      fileName: outputFileName,
      filePath: `${userId}/${outputFileName}`,
      entryCount: allResults.length,
      sourceDocument: fileName,
      creditsUsed,
      outputFormat,
      classificationStats: getClassificationStats(allResults),
      processedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      fileName: outputFileName,
      filePath: `${userId}/${outputFileName}`,
      totalChunks: chunks.length,
      processedChunks,
      resultCount: allResults.length,
      creditsUsed,
      creditsRemaining: await getUserCredits(userId),
      classificationStats: getClassificationStats(allResults)
    });
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    );
  }
}

// Process each chunk with the OpenAI models
async function processChunk(chunk, userId) {
  try {
    // Step 1: Extract clauses with the first model
    const extractedClauses = await processWithExtractor(chunk);
    
    // Parse the extracted clauses into an array (they might be separated by newlines)
    const clausesArray = extractedClauses
      .split(/\n\n+/)
      .filter(clause => clause.trim().length > 0);
    
    const results = [];
    
    // Process each clause through classification and duplication
    for (const clause of clausesArray) {
      // Validate that the extracted clause is a well-formed sentence or clause
      if (!isValidClause(clause)) {
        console.log('Skipping invalid clause:', clause);
        continue;
      }
      
      // Step 2: Classify the clause with the second model
      const classification = await processWithClassifier(clause);
      
      // Parse the classification result to extract just the classification value
      const classValue = parseClassification(classification);
      
      // Validate the classification is one of the expected values
      if (!isValidClassification(classValue)) {
        console.log('Invalid classification:', classValue, 'for clause:', clause);
        continue;
      }
      
      // Step 3: Generate variant with the third model
      const generatedVariant = await processWithDuplicator(clause);
      
      // Validate the generated variant 
      if (!isValidDuplicate(generatedVariant, clause)) {
        console.log('Invalid duplicate generated for clause:', clause);
        continue;
      }
      
      // Track credit usage
      await updateCreditUsage(userId);
      
      // Add to results
      results.push({
        input: clause,
        classification: classValue,
        output: generatedVariant
      });
    }
    
    return results;
  } catch (error) {
    console.error('Error processing chunk:', error);
    throw error;
  }
}

// Validation functions for middleware checks
function isValidClause(clause) {
  // Check if the clause is a complete sentence or statement
  if (!clause || clause.length < 10) return false;
  
  // Basic checks for clause length and structure
  // Too short clauses might be fragments, too long might be paragraphs
  if (clause.length > 2000) return false;
  
  // Basic sentence check (starts with capital, ends with punctuation)
  return /^[A-Z].*[.!?]$/.test(clause.trim());
}

function parseClassification(classificationResponse) {
  // Extract just the classification value (Critical, Important, or Standard)
  const match = classificationResponse.match(/Classification:\s*(Critical|Important|Standard)/);
  return match ? match[1] : null;
}

function isValidClassification(classification) {
  // Check if the classification is one of the expected values
  return ['Critical', 'Important', 'Standard'].includes(classification);
}

function isValidDuplicate(duplicate, original) {
  // Check if the duplicate is a well-formed clause 
  if (!duplicate || duplicate.length < 10) return false;
  
  // Check if lengths are somewhat similar (duplicate shouldn't be much shorter or longer)
  const lengthRatio = duplicate.length / original.length;
  if (lengthRatio < 0.5 || lengthRatio > 2) return false;
  
  return true;
}

// Process with extractor model
async function processWithExtractor(text) {
  const response = await openai.chat.completions.create({
    model: EXTRACTOR_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a data extractor that identifies and formats exact clauses from documents without rewriting them."
      },
      {
        role: "user",
        content: text
      }
    ],
    temperature: 0.2,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

// Process with classifier model
async function processWithClassifier(text) {
  const response = await openai.chat.completions.create({
    model: CLASSIFIER_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a document importance classifier that analyzes legal and business text to identify and rank the most important clauses. You evaluate clauses based on legal significance, financial impact, risk exposure, and operational relevance. You classify each clause as 'Critical', 'Important', or 'Standard' and explain your reasoning."
      },
      {
        role: "user",
        content: `Please classify the importance of this clause: '${text}'`
      }
    ],
    temperature: 0.3,
    max_tokens: 1000
  });

  return response.choices[0].message.content;
}

// Process with duplicator model
async function processWithDuplicator(text) {
  const response = await openai.chat.completions.create({
    model: DUPLICATOR_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a clause rewriter that duplicates organizational language and formatting with high fidelity."
      },
      {
        role: "user",
        content: text
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

// Credit management functions
async function getUserCredits(userId) {
  try {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists() && userDoc.data().credits !== undefined) {
      return userDoc.data().credits;
    } else {
      // Set default credits if not defined (5000 for new users)
      await updateDoc(userRef, { credits: 5000 });
      return 5000;
    }
  } catch (error) {
    console.error('Error getting user credits:', error);
    return 0; // Default to 0 if we can't get credits
  }
}

// Add this to src/app/api/process-document/route.js
// Update the updateCreditUsage function

async function updateCreditUsage(userId, creditsUsed = 1) {
  try {
    const userRef = doc(firestore, 'users', userId);
    
    // Use transaction to safely update credits
    await runTransaction(firestore, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document does not exist');
      }
      
      const currentCredits = userDoc.data().credits || 0;
      
      // Ensure user has enough credits
      if (currentCredits < creditsUsed) {
        throw new Error('Insufficient credits');
      }
      
      // Update credits
      transaction.update(userRef, {
        credits: currentCredits - creditsUsed,
        creditsUsed: (userDoc.data().creditsUsed || 0) + creditsUsed,
        lastUpdated: serverTimestamp()
      });
      
      // Add credit history entry for usage
      const historyRef = doc(collection(firestore, 'creditHistory'));
      transaction.set(historyRef, {
        userId: userId,
        amount: creditsUsed,
        type: 'usage',
        description: `Document processing (${creditsUsed} credits)`,
        timestamp: serverTimestamp()
      });
    });
    
    return true;
  } catch (error) {
    console.error('Error updating credits:', error);
    throw error;
  }
}

// Check if user has enough credits before processing
async function checkUserCredits(userId, estimatedCredits) {
  const currentCredits = await getUserCredits(userId);
  return currentCredits >= estimatedCredits;
}

// Format output for different LLM systems
function formatOutput(results, formatType) {
  switch (formatType) {
    case 'openai':
      return results.map(result => ({
        messages: [
          { role: "system", content: "You are an assistant trained to write clauses in organizational style." },
          { role: "user", content: result.input },
          { role: "assistant", content: result.output }
        ]
      }));
      
    case 'mistral':
      return results.map(result => ({
        text: `<s>[INST] Write a clause similar to this: ${result.input} [/INST] ${result.output} </s>`
      }));
      
    case 'falcon':
      return results.map(result => ({
        prompt: `Human: Rewrite this clause: ${result.input}\n\nAssistant:`,
        completion: ` ${result.output}`
      }));
      
    case 'claude':
      return results.map(result => ({
        prompt: `Human: ${result.input}\n\nAssistant:`,
        completion: ` ${result.output}`
      }));
      
    case 'jsonl':
      return results.map(result => ({
        input: result.input,
        classification: result.classification,
        output: result.output
      }));
      
    case 'csv':
      // Return a CSV string
      const header = 'Input,Classification,Output\n';
      const rows = results.map(r => 
        `"${r.input.replace(/"/g, '""')}","${r.classification}","${r.output.replace(/"/g, '""')}"`
      ).join('\n');
      return header + rows;
      
    default:
      return results;
  }
}

// Helper function to filter results by classification
function filterByClassification(results, classFilter) {
  if (classFilter === 'all') return results;
  
  if (classFilter === 'critical') {
    return results.filter(r => r.classification === 'Critical');
  }
  
  if (classFilter === 'important') {
    return results.filter(r => r.classification === 'Important');
  }
  
  if (classFilter === 'critical_important') {
    return results.filter(r => 
      r.classification === 'Critical' || r.classification === 'Important'
    );
  }
  
  return results;
}

// Helper to get classification statistics
function getClassificationStats(results) {
  const stats = {
    Critical: 0,
    Important: 0,
    Standard: 0
  };
  
  results.forEach(result => {
    if (stats[result.classification] !== undefined) {
      stats[result.classification]++;
    }
  });
  
  return stats;
}

// Helper to update processing status
async function updateProcessingStatus(userId, fileName, processedChunks, totalChunks, creditsUsed) {
  try {
    await fetch('http://localhost:3000/api/process-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        fileName,
        status: 'processing',
        processedChunks,
        totalChunks,
        creditsUsed,
        creditsRemaining: await getUserCredits(userId),
        updatedAt: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error('Error updating processing status:', error);
  }
}

// Chunking function that preserves paragraphs
function chunkText(text, chunkSize, overlapSize) {
  // Split by paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the chunk size, save the current chunk and start a new one
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      
      // If overlap is enabled, keep some of the previous text
      if (overlapSize > 0) {
        // Split the current chunk into words to ensure we don't cut in the middle of a word
        const words = currentChunk.split(/\s+/);
        const overlapWordCount = Math.min(Math.ceil(overlapSize / 5), words.length); // Estimate average word length as 5
        currentChunk = words.slice(-overlapWordCount).join(' ');
      } else {
        currentChunk = '';
      }
    }
    
    // Add the paragraph to the current chunk
    if (currentChunk.length > 0) {
      currentChunk += '\n\n' + paragraph;
    } else {
      currentChunk = paragraph;
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Helper to get file extension
function getFileExtension(filename) {
  const extension = path.extname(filename).toLowerCase().substring(1);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'docx';
  if (extension === 'txt') return 'txt';
  return null;
}

// API route to download processed JSONL file
export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('file');
  
  if (!filePath) {
    return NextResponse.json(
      { error: 'File path is required' },
      { status: 400 }
    );
  }

  try {
    const fullPath = path.join(process.cwd(), 'api/uploads', filePath);
    const fileContent = await fs.readFile(fullPath);
    
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${path.basename(filePath)}`
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}