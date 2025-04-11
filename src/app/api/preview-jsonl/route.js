// src/app/api/preview-jsonl/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('file');
  const limit = parseInt(url.searchParams.get('limit') || '5', 10);
  const userId = url.searchParams.get('userId');
  
  console.log(`JSONL Preview request: ${filePath}, limit: ${limit}`);

  if (!filePath) {
    return NextResponse.json(
      { error: 'File path is required' },
      { status: 400 }
    );
  }

  try {
    // Parse file path to get userId and fileName
    const parts = filePath.split('/');
    const fileUserId = parts[0];
    const fileName = parts[1];
    
    console.log(`Parsed file path: userID=${fileUserId}, fileName=${fileName}`);
    
    // If userId is provided, verify it matches the file path
    if (userId && userId !== fileUserId) {
      return NextResponse.json(
        { error: 'Unauthorized access to file' },
        { status: 403 }
      );
    }
    
    const fullPath = path.join(process.cwd(), 'uploads', fileUserId, fileName);
    console.log(`Full path: ${fullPath}`);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
      console.log(`File exists: ${fullPath}`);
    } catch (error) {
      console.error(`File not found: ${fullPath}`);
      
      // List available files to help debugging
      try {
        const userDir = path.join(process.cwd(), 'uploads', fileUserId);
        const files = await fs.readdir(userDir);
        console.log(`Available files for user ${fileUserId}:`, files);
        
        // If we find any JSONL files, suggest one as an alternative
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        if (jsonlFiles.length > 0) {
          return NextResponse.json(
            { 
              error: `File ${fileName} not found`, 
              message: `Could not find the requested file. Available JSONL files: ${jsonlFiles.join(', ')}`,
              availableFiles: jsonlFiles,
              suggestedFile: jsonlFiles[0]
            },
            { status: 404 }
          );
        }
      } catch (listError) {
        console.error(`Error listing user directory: ${listError.message}`);
      }
      
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Read file content
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    
    if (!fileContent || fileContent.trim() === '') {
      console.log(`File is empty: ${fullPath}`);
      return NextResponse.json({
        data: [],
        total: 0,
        empty: true,
        message: 'The file exists but contains no data'
      });
    }
    
    console.log(`File content length: ${fileContent.length} characters`);
    
    // Parse JSONL content
    const lines = fileContent.trim().split('\n');
    const jsonData = [];
    
    for (let i = 0; i < Math.min(lines.length, limit); i++) {
      try {
        if (lines[i].trim()) {
          const parsedLine = JSON.parse(lines[i]);
          jsonData.push(parsedLine);
        }
      } catch (error) {
        console.error(`Error parsing line ${i + 1}:`, error);
      }
    }
    
    if (jsonData.length === 0 && lines.length > 0) {
      console.warn(`Could not parse any JSON lines from file with ${lines.length} lines`);
      return NextResponse.json({
        error: 'Invalid JSONL format',
        message: 'The file exists but does not contain valid JSON lines',
        firstLine: lines[0].substring(0, 100) + (lines[0].length > 100 ? '...' : '')
      }, { status: 400 });
    }
    
    console.log(`Successfully parsed ${jsonData.length} JSON objects`);
    
    return NextResponse.json({
      data: jsonData,
      total: lines.length,
      parsed: jsonData.length
    });
  } catch (error) {
    console.error('Error previewing JSONL file:', error);
    return NextResponse.json(
      { error: 'Failed to preview JSONL file: ' + error.message },
      { status: 500 }
    );
  }
}