// src/app/api/process-document/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { parse as pdfParse } from 'pdf-parse';
import mammoth from 'mammoth';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model IDs
const EXTRACTOR_MODEL = "ft:gpt-4o-mini-2024-07-18:personal:clause-extractor:BJoJl5pB";
const DUPLICATOR_MODEL = "ft:gpt-4o-mini-2024-07-18:personal:clause-duplicator:BK81g7rc";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'api/uploads');

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('userId');
    const chunkSize = parseInt(formData.get('chunkSize') || '1000', 10);
    const overlap = parseInt(formData.get('overlap') || '100', 10);
    
    if (!file || !userId) {
      return NextResponse.json(
        { error: 'File and user ID are required' },
        { status: 400 }
      );
    }

    // Create a unique folder for this user's uploads if it doesn't exist
    const userUploadsDir = path.join(uploadsDir, userId);
    await fs.mkdir(userUploadsDir, { recursive: true });

    // Save the file temporarily
    const fileName = file.name;
    const fileType = getFileExtension(fileName);
    const filePath = path.join(userUploadsDir, fileName);
    
    const buffer = Buffer.from(await file.arrayBuffer());
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
    
    // Process each chunk with the OpenAI models
    const results = [];
    let processedChunks = 0;
    
    for (const chunk of chunks) {
      try {
        // Step 1: Extract clauses with the first model
        const extractedContent = await processWithExtractor(chunk);
        
        // Step 2: Generate variations with the second model
        const generatedContent = await processWithDuplicator(extractedContent);
        
        // Add to results
        results.push({
          messages: [
            { role: "system", content: "You are a clause rewriter that duplicates organizational language and formatting with high fidelity." },
            { role: "user", content: extractedContent },
            { role: "assistant", content: generatedContent }
          ]
        });
        
        processedChunks++;
      } catch (error) {
        console.error('Error processing chunk:', error);
      }
    }

    // Create JSONL file
    const jsonlContent = results.map(result => JSON.stringify(result)).join('\n');
    const jsonlFileName = `${path.basename(fileName, path.extname(fileName))}_processed.jsonl`;
    const jsonlFilePath = path.join(userUploadsDir, jsonlFileName);
    
    await fs.writeFile(jsonlFilePath, jsonlContent);

    // Clean up the original file
    await fs.unlink(filePath).catch(console.error);

    return NextResponse.json({
      success: true,
      fileName: jsonlFileName,
      filePath: `/api/uploads/${userId}/${jsonlFileName}`,
      totalChunks: chunks.length,
      processedChunks,
      resultCount: results.length
    });
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    );
  }
}

// Process text with the extractor model
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
    stream: false,
    temperature: 0.2, // Low temperature for consistent outputs
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

// Process text with the duplicator model
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
    stream: false,
    temperature: 0.7, // Higher temperature for more variation
    max_tokens: 2000
  });

  return response.choices[0].message.content;
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