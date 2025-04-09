// src/app/api/preview-jsonl/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('file');
  const limit = parseInt(url.searchParams.get('limit') || '5', 10);
  
  if (!filePath) {
    return NextResponse.json(
      { error: 'File path is required' },
      { status: 400 }
    );
  }

  try {
    const fullPath = path.join(process.cwd(), 'api/uploads', filePath);
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    
    // Parse JSONL content
    const lines = fileContent.trim().split('\n');
    const jsonData = [];
    
    for (let i = 0; i < Math.min(lines.length, limit); i++) {
      try {
        const parsedLine = JSON.parse(lines[i]);
        jsonData.push(parsedLine);
      } catch (error) {
        console.error(`Error parsing line ${i + 1}:`, error);
      }
    }
    
    return NextResponse.json({
      data: jsonData,
      total: lines.length
    });
  } catch (error) {
    console.error('Error previewing JSONL file:', error);
    return NextResponse.json(
      { error: 'Failed to preview JSONL file' },
      { status: 500 }
    );
  }
}