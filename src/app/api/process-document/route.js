// src/app/api/process-document/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  serverTimestamp,
  collection,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from '../../../lib/firebase';
import { addDataSet } from '../../../lib/firestoreService';
import { parse as pdfParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { OpenAI } from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  fs.access(uploadsDir);
} catch (error) {
  fs.mkdir(uploadsDir, { recursive: true });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId');
    const file = formData.get('file');
    const documentId = formData.get('documentId');
    const chunkSize = parseInt(formData.get('chunkSize') || '1000', 10);
    const overlap = parseInt(formData.get('overlap') || '100', 10);
    const outputFormat = formData.get('outputFormat') || 'jsonl';
    const classFilter = formData.get('classFilter') || 'all';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!file && !documentId) {
      return NextResponse.json(
        { error: 'Either file or document ID is required' },
        { status: 400 }
      );
    }

    // Create a unique folder for this user's uploads
    const userUploadsDir = path.join(uploadsDir, userId);
    await fs.mkdir(userUploadsDir, { recursive: true });

    let fileName;
    let fileContent;
    let buffer;

    // If we have a file from the form, save and use it
    if (file) {
      fileName = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
      
      // Save the file temporarily
      const filePath = path.join(userUploadsDir, fileName);
      await fs.writeFile(filePath, buffer);
      
      // Also upload to Firebase Storage if needed
      try {
        const storageRef = ref(storage, `documents/${userId}/${fileName}`);
        await uploadBytes(storageRef, buffer);
      } catch (error) {
        console.warn('Failed to upload to Firebase Storage:', error);
        // Continue anyway since we saved locally
      }
    } 
    // If we have a document ID, retrieve the document info
    else if (documentId) {
      const docRef = doc(firestore, 'documents', documentId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      
      const documentData = docSnap.data();
      
      // Check if this document belongs to the user
      if (documentData.userId !== userId) {
        return NextResponse.json(
          { error: 'Unauthorized access to document' },
          { status: 403 }
        );
      }
      
      // Get the file download URL and name
      fileName = documentData.fileName;
      
      // If we have a file URL, download it
      if (documentData.fileUrl) {
        const response = await fetch(documentData.fileUrl);
        buffer = Buffer.from(await response.arrayBuffer());
        
        // Save the file temporarily
        const filePath = path.join(userUploadsDir, fileName);
        await fs.writeFile(filePath, buffer);
      } else {
        return NextResponse.json(
          { error: 'Document has no file associated with it' },
          { status: 400 }
        );
      }
    }

    // Initialize status object
    const statusObj = {
      userId,
      fileName,
      status: 'extracting',
      processedChunks: 0,
      totalChunks: 0,
      creditsUsed: 0,
      updatedAt: new Date().toISOString()
    };

    // Update initial status
    await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/process-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(statusObj)
    });

    // Extract text from the document based on file type
    let text = '';
    try {
      const fileType = path.extname(fileName).toLowerCase();
      
      if (fileType === '.pdf') {
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else if (fileType === '.docx') {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (fileType === '.txt') {
        text = buffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      
      // Update status to error
      statusObj.status = 'error';
      statusObj.error = 'Failed to extract text from document';
      statusObj.updatedAt = new Date().toISOString();
      
      await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/process-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(statusObj)
      });
      
      return NextResponse.json(
        { error: 'Failed to extract text from document' },
        { status: 500 }
      );
    }

    // Split text into chunks
    const chunks = chunkText(text, chunkSize, overlap);
    statusObj.totalChunks = chunks.length;
    statusObj.status = 'processing';
    
    // Update status with total chunks
    await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/process-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(statusObj)
    });

    // Start asynchronous processing
    processDocumentAsync(
      chunks, 
      userId, 
      fileName,
      outputFormat,
      classFilter,
      request.headers.get('origin') || 'http://localhost:3000'
    );

    // Return immediate response to client
    return NextResponse.json({
      success: true,
      message: 'Document processing started',
      fileName: fileName
    });
    
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json(
      { error: 'Failed to process document: ' + error.message },
      { status: 500 }
    );
  }
}

// Process document chunks asynchronously
async function processDocumentAsync(chunks, userId, fileName, outputFormat, classFilter, origin) {
  try {
    // Results array
    const results = [];
    let processedChunks = 0;
    let creditsUsed = 0;
    
    // Process each chunk
    for (const chunk of chunks) {
      try {
        // Process the chunk
        const chunkResults = await processChunk(chunk);
        
        // Filter results by classification if needed
        const filteredResults = filterByClassification(chunkResults, classFilter);
        
        // Add results to the array
        results.push(...filteredResults);
        
        // Update credits used
        creditsUsed += filteredResults.length;
        
        // Increment processed chunks
        processedChunks++;
        
        // Update status
        await fetch(`${origin}/api/process-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            fileName,
            status: 'processing',
            processedChunks,
            totalChunks: chunks.length,
            creditsUsed,
            updatedAt: new Date().toISOString()
          })
        });
      } catch (error) {
        console.error('Error processing chunk:', error);
      }
    }
    
    // Generate output file name
    const outputFileName = `${path.basename(fileName, path.extname(fileName))}_processed.jsonl`;
    const userUploadsDir = path.join(process.cwd(), 'uploads', userId);
    const outputFilePath = path.join(userUploadsDir, outputFileName);
    
    // Format results based on requested format
    const formattedResults = formatOutput(results, outputFormat);
    
    // Write the output file
    let outputContent;
    if (outputFormat === 'csv') {
      outputContent = formattedResults; // Already formatted as CSV string
    } else {
      // For JSON formats, stringify each result separately for JSONL format
      outputContent = formattedResults.map(result => JSON.stringify(result)).join('\n');
    }
    
    await fs.writeFile(outputFilePath, outputContent);
    
    // Calculate classification stats
    const classificationStats = {
      Critical: results.filter(r => r.classification === 'Critical').length,
      Important: results.filter(r => r.classification === 'Important').length,
      Standard: results.filter(r => r.classification === 'Standard').length
    };
    
    // Create result object
    const resultObject = {
      fileName: outputFileName,
      filePath: `${userId}/${outputFileName}`,
      resultCount: results.length,
      classificationStats
    };
    
    // Update final status
    await fetch(`${origin}/api/process-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        fileName,
        status: 'complete',
        processedChunks,
        totalChunks: chunks.length,
        creditsUsed,
        result: resultObject,
        updatedAt: new Date().toISOString()
      })
    });
    
    // Create record in the datasets collection
    try {
      await addDataSet({
        name: `${path.basename(fileName, path.extname(fileName))}_processed`,
        description: `Processed with AI using ${outputFormat} format`,
        userId,
        fileName: outputFileName,
        filePath: `${userId}/${outputFileName}`,
        entryCount: results.length,
        sourceDocument: fileName,
        creditsUsed,
        outputFormat,
        classificationStats,
        processedAt: new Date()
      });
    } catch (error) {
      console.error('Error adding dataset record:', error);
    }
    
  } catch (error) {
    console.error('Error in async processing:', error);
  }
}

// Process a single chunk of text
async function processChunk(chunk) {
  try {
    // For demo purposes, we'll use a simplified processing approach
    // In a real implementation, you'd call your ML models here
    
    // Extract sentences from the chunk
    const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [];
    
    // Process each sentence
    const results = [];
    
    for (const sentence of sentences) {
      // Skip very short sentences
      if (sentence.trim().length < 20) continue;
      
      // Create a semi-random classification
      const classifications = ['Critical', 'Important', 'Standard'];
      const classification = classifications[Math.floor(Math.random() * classifications.length)];
      
      // Generate a variant using OpenAI
      try {
        const generatedVariant = await generateVariant(sentence);
        
        // Add to results
        results.push({
          input: sentence.trim(),
          classification,
          output: generatedVariant.trim()
        });
      } catch (error) {
        console.error('Error generating variant:', error);
        
        // Fallback to a simple variant if OpenAI fails
        const fallbackVariant = createFallbackVariant(sentence);
        
        results.push({
          input: sentence.trim(),
          classification,
          output: fallbackVariant.trim()
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error processing chunk:', error);
    return [];
  }
}

// Generate a variant using OpenAI
async function generateVariant(sentence) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a document rewriter that creates variations of sentences while preserving their meaning. Create a single variant without any explanations or additional text."
        },
        {
          role: "user",
          content: sentence
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}

// Create a fallback variant if OpenAI fails
function createFallbackVariant(sentence) {
  // Simple word replacements
  const replacements = {
    'shall': 'will',
    'must': 'needs to',
    'may': 'might',
    'client': 'customer',
    'company': 'organization',
    'provide': 'supply',
    'receive': 'obtain',
    'payment': 'fee',
    'services': 'assistance',
    'immediately': 'promptly',
    'agreement': 'contract'
  };
  
  let variant = sentence;
  
  // Apply some random replacements
  Object.entries(replacements).forEach(([original, replacement]) => {
    if (variant.includes(original) && Math.random() > 0.5) {
      variant = variant.replace(new RegExp(original, 'gi'), replacement);
    }
  });
  
  return variant;
}

// Filter results by classification
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
      
    case 'csv':
      // Return a CSV string
      const header = 'Input,Classification,Output\n';
      const rows = results.map(r => 
        `"${r.input.replace(/"/g, '""')}","${r.classification}","${r.output.replace(/"/g, '""')}"`
      ).join('\n');
      return header + rows;
      
    case 'jsonl':
    default:
      return results;
  }
}

// Split text into chunks while preserving paragraphs
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

// API route for downloading files
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
    // Parse file path to get userId and fileName
    const [userId, fileName] = filePath.split('/');
    
    if (!userId || !fileName) {
      throw new Error('Invalid file path format');
    }
    
    const fullPath = path.join(process.cwd(), 'uploads', userId, fileName);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Read file content
    const fileContent = await fs.readFile(fullPath);
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.jsonl')) {
      contentType = 'application/json';
    } else if (fileName.endsWith('.csv')) {
      contentType = 'text/csv';
    }
    
    // Return file
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename=${fileName}`
      }
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    );
  }
}