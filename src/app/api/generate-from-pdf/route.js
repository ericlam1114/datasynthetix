import { NextResponse } from "next/server";
import { initializeFirebaseAdmin } from "@/lib/firebase-admin";
import { db, storage } from '@/firebase/admin';
import { verifyAuth } from '@/lib/auth-utils';
import { v4 as uuidv4 } from 'uuid';
import { extractPdfData } from '@/lib/pdf-extraction';
import { saveDatasetAsJsonl } from '@/utils/datasetService';

// Initialize Firebase admin
initializeFirebaseAdmin();

/**
 * One-step endpoint to process a PDF and generate synthetic data
 * POST /api/generate-from-pdf
 */
export async function POST(request) {
  console.log('POST /api/generate-from-pdf starting');
  
  try {
    // Verify authentication
    const { user } = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create form data handler for file upload
    const formData = await request.formData();
    
    // Get document ID or PDF file
    const documentId = formData.get('documentId');
    const pdfFile = formData.get('pdfFile');
    
    // Get optional processing parameters
    const options = {
      recordCount: parseInt(formData.get('recordCount') || '10', 10),
      detectTables: formData.get('detectTables') !== 'false',
      enhancedExtraction: formData.get('enhancedExtraction') === 'true',
      datasetName: formData.get('datasetName') || null,
      datasetDescription: formData.get('datasetDescription') || null,
      useCase: formData.get('useCase') || 'rewriter-legal',
      outputFormat: formData.get('outputFormat') || 'openai-jsonl'
    };
    
    if (!documentId && !pdfFile) {
      return NextResponse.json(
        { error: 'Either documentId or pdfFile is required' },
        { status: 400 }
      );
    }

    // Generate a unique job ID for tracking
    const jobId = uuidv4();
    const timestamp = new Date();
    
    // Initial job data
    const jobData = {
      userId: user.uid,
      status: 'pending',
      stage: 'initializing',
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      options: options,
      error: null
    };

    // Add document reference if provided
    if (documentId) {
      jobData.documentId = documentId;
    }

    // Create the job document in Firestore
    await db.collection('processingJobs').doc(jobId).set(jobData);

    // Start the processing in the background
    processDocument(jobId, documentId, pdfFile, user.uid, options).catch(error => {
      console.error('Background processing error:', error);
      updateJobStatus(jobId, 'error', null, 0, error.message);
    });

    // Return the job ID for client polling
    return NextResponse.json({
      success: true,
      message: 'PDF processing started',
      jobId: jobId
    });
    
  } catch (error) {
    console.error('Error in PDF processing API:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Background processing function for PDF data extraction and generation
 */
async function processDocument(jobId, documentId, pdfFile, userId, options = {}) {
  try {
    // Update job to processing state
    await updateJobStatus(jobId, 'processing', 'uploading');
    
    let pdfBuffer;
    let filename;
    let docData;
    
    // Get PDF data either from existing document or uploaded file
    if (documentId) {
      // Fetch the document from Firestore
      const docRef = await db.collection('documents').doc(documentId).get();
      
      if (!docRef.exists) {
        throw new Error('Document not found');
      }
      
      docData = docRef.data();
      
      // Verify document belongs to user
      if (docData.userId !== userId) {
        throw new Error('Unauthorized access to document');
      }
      
      // Get the PDF file from storage
      const fileRef = storage.bucket().file(docData.filePath);
      const [fileExists] = await fileRef.exists();
      
      if (!fileExists) {
        throw new Error('PDF file not found in storage');
      }
      
      // Download the file
      const [fileBuffer] = await fileRef.download();
      pdfBuffer = fileBuffer;
      filename = docData.name || 'document.pdf';
      
      await updateJobStatus(jobId, 'processing', 'downloading', 15);
      
    } else if (pdfFile) {
      // Handle uploaded file
      const arrayBuffer = await pdfFile.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
      filename = pdfFile.name || 'uploaded.pdf';
      
      // Save the uploaded file
      const filePath = `users/${userId}/documents/${uuidv4()}.pdf`;
      const fileRef = storage.bucket().file(filePath);
      
      await fileRef.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: {
          originalName: filename
        }
      });
      
      // Create a document record
      const newDocId = uuidv4();
      docData = {
        id: newDocId,
        userId: userId,
        name: filename,
        description: 'Uploaded PDF document',
        filePath: filePath,
        fileSize: pdfBuffer.length,
        fileType: 'application/pdf',
        uploadedAt: new Date(),
        processingStatus: 'pending',
      };
      
      await db.collection('documents').doc(newDocId).set(docData);
      
      // Update job with document ID
      await db.collection('processingJobs').doc(jobId).update({
        documentId: newDocId,
        updatedAt: new Date()
      });
      
      await updateJobStatus(jobId, 'processing', 'uploading_complete', 20);
    }
    
    // Update job status to extraction
    await updateJobStatus(jobId, 'processing', 'extraction', 25);
    
    // Extract data from PDF with options
    const extractionOptions = {
      detectTables: options.detectTables !== false,
      logProgress: process.env.NODE_ENV === 'development',
      attemptAllMethods: options.enhancedExtraction === true
    };
    
    const extractedData = await extractPdfData(pdfBuffer, extractionOptions);
    
    if (!extractedData || !extractedData.textContent || extractedData.textContent.length < 10) {
      throw new Error('Failed to extract readable text from PDF');
    }
    
    await updateJobStatus(jobId, 'processing', 'extraction_complete', 40, null, {
      pageCount: extractedData.pageCount || 0,
      extractedCharacterCount: extractedData.textContent.length,
      tableCount: extractedData.tables?.length || 0
    });
    
    // Update job status to analyzing structure
    await updateJobStatus(jobId, 'processing', 'analyzing_structure', 50);
    
    // Analyze structure and detect data types
    const dataFields = analyzeDataStructure(extractedData);
    
    // If no fields were extracted, try a different approach
    if (dataFields.length === 0) {
      console.log('No fields detected with primary method, trying fallback extraction...');
      // Try to extract fields from tables if available
      if (extractedData.tables && extractedData.tables.length > 0) {
        for (const table of extractedData.tables) {
          if (table.headerRow && table.headerRow.length > 0 && table.rows.length > 1) {
            // Use the table's header row as field names
            for (let i = 0; i < table.headerRow.length; i++) {
              const headerName = table.headerRow[i].trim();
              if (headerName.length > 1) {
                // Get a sample value from the second row
                const sampleRow = table.rows[1] || [];
                const sampleValue = (sampleRow[i] || '').trim();
                
                // Determine field type
                let fieldType = 'string';
                if (/^\d+$/.test(sampleValue)) {
                  fieldType = 'integer';
                } else if (/^\d+\.\d+$/.test(sampleValue)) {
                  fieldType = 'decimal';
                } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(sampleValue) || 
                          /^\d{2,4}-\d{1,2}-\d{1,2}$/.test(sampleValue)) {
                  fieldType = 'date';
                }
                
                dataFields.push({
                  name: headerName,
                  type: fieldType,
                  sample: sampleValue,
                  source: 'table'
                });
              }
            }
            
            if (dataFields.length > 0) {
              break; // Stop after getting fields from first valid table
            }
          }
        }
      }
    }
    
    // Update job with field detection results
    await updateJobStatus(jobId, 'processing', 'fields_detected', 60, null, {
      fieldCount: dataFields.length
    });
    
    // Return error if no fields could be detected
    if (dataFields.length === 0) {
      throw new Error('Could not detect any data fields in the document. The PDF may contain only images or be heavily formatted.');
    }
    
    // Update job to data generation stage
    await updateJobStatus(jobId, 'processing', 'data_generation', 70);
    
    // Generate synthetic data based on extracted fields
    const recordCount = Math.min(Math.max(options.recordCount || 10, 1), 1000);
    const syntheticData = generateSyntheticData(dataFields, extractedData, recordCount);
    
    // Update job to saving stage
    await updateJobStatus(jobId, 'processing', 'saving', 90);
    
    // Create dataset name from options or use filename
    const datasetName = options.datasetName || `${filename.split('.')[0]} Dataset`;
    
    // Save the generated data
    const datasetId = uuidv4();
    const datasetRef = db.collection('datasets').doc(datasetId);
    
    await datasetRef.set({
      id: datasetId,
      name: datasetName,
      description: options.datasetDescription || `Generated from ${filename}`,
      userId: userId,
      sourceDocumentId: documentId,
      fields: dataFields,
      records: syntheticData,
      recordCount: syntheticData.length,
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceMetadata: {
        pageCount: extractedData.pageCount || 0,
        tableCount: extractedData.tables?.length || 0,
        documentName: filename,
        extractionMethod: extractedData.extractionMethod || 'standard'
      }
    });
    
    // Save dataset as JSONL to Firebase Storage
    await updateJobStatus(jobId, 'processing', 'saving_jsonl', 92);
    
    try {
      const jsonlResult = await saveDatasetAsJsonl(datasetId, userId, syntheticData);
      
      // Update dataset with JSONL file information
      await datasetRef.update({
        jsonlUrl: jsonlResult.downloadUrl,
        jsonlPath: jsonlResult.filePath,
        updatedAt: new Date()
      });
      
      console.log(`JSONL file saved at ${jsonlResult.filePath}`);
    } catch (jsonlError) {
      console.error('Error saving JSONL file:', jsonlError);
      // Continue processing even if JSONL saving fails
    }
    
    // Update the document record with processing complete
    if (docData && docData.id) {
      await db.collection('documents').doc(docData.id).update({
        processingStatus: 'complete',
        datasetId: datasetId,
        updatedAt: new Date()
      });
    }
    
    // Update job to complete
    await updateJobStatus(jobId, 'complete', 'complete', 100, null, { 
      datasetId,
      recordCount: syntheticData.length,
      fieldCount: dataFields.length
    });
    
    return {
      success: true,
      datasetId: datasetId,
      recordCount: syntheticData.length
    };
    
  } catch (error) {
    console.error('Document processing error:', error);
    
    // Update job with error
    await updateJobStatus(jobId, 'error', null, 0, error.message);
    
    throw error;
  }
}

/**
 * Update the status of a processing job
 */
async function updateJobStatus(jobId, status, stage, progress = null, error = null, additionalData = {}) {
  const updateData = {
    status,
    updatedAt: new Date(),
    ...additionalData
  };
  
  if (stage) updateData.stage = stage;
  if (progress !== null) updateData.progress = progress;
  if (error !== null) updateData.error = error;
  
  await db.collection('processingJobs').doc(jobId).update(updateData);
}

/**
 * Analyze the structure of extracted PDF data
 */
function analyzeDataStructure(extractedData) {
  // Initialize fields array
  const fields = [];
  const { textContent, tables, structure } = extractedData;
  
  // Track field names to avoid duplicates
  const fieldNames = new Set();
  
  // Method 1: Look for patterns like "Field: Value" or "Field - Value" in text content
  if (textContent) {
    const textLines = textContent.split('\n')
      .filter(line => line.trim().length > 0);
    
    // Look for patterns like "Field: Value" or "Field - Value"
    for (const line of textLines) {
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      const dashMatch = line.match(/^([^-]+)-\s*(.+)$/);
      
      if (colonMatch || dashMatch) {
        const match = colonMatch || dashMatch;
        const fieldName = match[1].trim();
        const fieldValue = match[2].trim();
        
        // Skip very short or very long field names
        if (fieldName.length < 2 || fieldName.length > 50) continue;
        
        // Skip duplicates
        if (fieldNames.has(fieldName.toLowerCase())) continue;
        
        // Determine field type
        let fieldType = 'string';
        if (/^\d+$/.test(fieldValue)) {
          fieldType = 'integer';
        } else if (/^\d+\.\d+$/.test(fieldValue)) {
          fieldType = 'decimal';
        } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(fieldValue) || 
                  /^\d{2,4}-\d{1,2}-\d{1,2}$/.test(fieldValue)) {
          fieldType = 'date';
        }
        
        fields.push({
          name: fieldName,
          type: fieldType,
          sample: fieldValue,
          source: 'text'
        });
        
        fieldNames.add(fieldName.toLowerCase());
      }
    }
  }
  
  // Method 2: Extract from tables if available
  if (tables && tables.length > 0) {
    // Use first row of tables as potential field names
    for (const table of tables) {
      if (table.headerRow && table.rows.length > 1) {
        for (let i = 0; i < table.headerRow.length; i++) {
          const headerName = table.headerRow[i].trim();
          
          // Skip empty or very short headers
          if (headerName.length < 2) continue;
          
          // Skip duplicates
          if (fieldNames.has(headerName.toLowerCase())) continue;
          
          // Get a sample value from the second row
          const sampleRow = table.rows[1] || [];
          const sampleValue = (sampleRow[i] || '').trim();
          
          // Determine field type
          let fieldType = 'string';
          if (/^\d+$/.test(sampleValue)) {
            fieldType = 'integer';
          } else if (/^\d+\.\d+$/.test(sampleValue)) {
            fieldType = 'decimal';
          } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(sampleValue) || 
                    /^\d{2,4}-\d{1,2}-\d{1,2}$/.test(sampleValue)) {
            fieldType = 'date';
          }
          
          fields.push({
            name: headerName,
            type: fieldType,
            sample: sampleValue,
            source: 'table'
          });
          
          fieldNames.add(headerName.toLowerCase());
        }
      }
    }
  }
  
  // Method 3: Look for sections/headers with content
  if (structure && structure.sections && structure.sections.length > 0) {
    for (const section of structure.sections) {
      if (section.title && section.content && !fieldNames.has(section.title.toLowerCase())) {
        // Use the first 100 chars of content as sample
        const sampleContent = section.content.substring(0, 100).trim();
        
        fields.push({
          name: section.title,
          type: 'text',
          sample: sampleContent,
          source: 'section'
        });
        
        fieldNames.add(section.title.toLowerCase());
      }
    }
  }
  
  return fields;
}

/**
 * Generate synthetic data based on analyzed fields
 */
function generateSyntheticData(fields, extractedData, recordCount = 10) {
  // Generate synthetic records
  const records = [];
  const recordLimit = Math.min(Math.max(recordCount, 1), 1000);
  
  // For tables, try to reuse actual rows if available
  const tableSamples = new Map();
  if (extractedData.tables && extractedData.tables.length > 0) {
    for (const table of extractedData.tables) {
      if (table.rows.length > 1) {
        // Skip header row, use data rows for samples
        for (let i = 1; i < table.rows.length; i++) {
          const row = table.rows[i];
          for (let j = 0; j < row.length; j++) {
            const headerName = (table.headerRow[j] || '').trim();
            if (headerName) {
              if (!tableSamples.has(headerName)) {
                tableSamples.set(headerName, []);
              }
              tableSamples.get(headerName).push(row[j]);
            }
          }
        }
      }
    }
  }
  
  for (let i = 0; i < recordLimit; i++) {
    const record = {};
    
    for (const field of fields) {
      // Check if we have real samples from tables
      const samples = tableSamples.get(field.name);
      
      if (samples && samples.length > 0) {
        // Use real samples when available, with some randomization
        record[field.name] = samples[Math.floor(Math.random() * samples.length)];
      } else {
        // Generate data based on field type
        switch (field.type) {
          case 'integer':
            record[field.name] = Math.floor(Math.random() * 1000);
            break;
          case 'decimal':
            record[field.name] = +(Math.random() * 1000).toFixed(2);
            break;
          case 'date':
            // Random date in the last 5 years
            const date = new Date();
            date.setFullYear(date.getFullYear() - Math.floor(Math.random() * 5));
            date.setMonth(Math.floor(Math.random() * 12));
            date.setDate(Math.floor(Math.random() * 28) + 1);
            record[field.name] = date.toISOString().split('T')[0];
            break;
          case 'text':
            // Generate paragraphs for text fields
            record[field.name] = generateRandomParagraph(3 + Math.floor(Math.random() * 3));
            break;
          case 'string':
          default:
            // Generate random string based on sample
            if (field.sample) {
              if (field.sample.includes('@')) {
                // Email format
                record[field.name] = `user${i}${Math.floor(Math.random() * 100)}@example.com`;
              } else if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(field.sample)) {
                // Name format
                const firstNames = ['John', 'Jane', 'Alex', 'Sarah', 'Mike', 'Lisa', 'David', 'Emily', 'Robert', 'Emma'];
                const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Lee', 'Taylor', 'Clark', 'Lewis', 'Young'];
                record[field.name] = `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
              } else if (/^\d{3}-\d{3}-\d{4}$/.test(field.sample)) {
                // Phone number format
                record[field.name] = `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
              } else if (/^\d{5}$/.test(field.sample)) {
                // ZIP code format
                record[field.name] = `${Math.floor(Math.random() * 90000) + 10000}`;
              } else {
                record[field.name] = `Sample-${field.name}-${i}`;
              }
            } else {
              record[field.name] = `Value-${i}`;
            }
        }
      }
    }
    
    records.push(record);
  }
  
  return records;
}

/**
 * Generate a random paragraph for text fields
 */
function generateRandomParagraph(sentenceCount = 3) {
  const sentences = [
    "The data shown here is completely synthetic and generated for demonstration purposes.",
    "All information presented is fictional and does not represent real individuals or entities.",
    "This sample data can be used to test applications without privacy concerns.",
    "No real personal information is contained in this dataset.",
    "The values are randomly generated according to the detected data patterns.",
    "This synthetic data maintains the format of the original document.",
    "The structure reflects what was detected in the source PDF document.",
    "Sample records follow the same schema as the original but contain fictional data.",
    "These values are artificially created and not extracted from the source.",
    "Use this data for testing and development purposes only.",
    "The format matches the original document but values are randomized.",
    "This synthetic data is useful for application testing and development."
  ];
  
  const result = [];
  for (let i = 0; i < sentenceCount; i++) {
    const randomIndex = Math.floor(Math.random() * sentences.length);
    result.push(sentences[randomIndex]);
  }
  
  return result.join(' ');
} 