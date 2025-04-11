// Test script for the split-document API endpoint
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function testSplitDocument() {
  console.log('Starting split document API test...');
  
  // Path for sample PDF and output directory
  const pdfPath = path.join(__dirname, 'sample.pdf');
  const outputDir = path.join(__dirname, 'split_output');
  
  // Create a simple PDF if it doesn't exist
  if (!fs.existsSync(pdfPath)) {
    console.log('Creating sample PDF...');
    // Simple PDF content with multiple pages
    const pdfContent = '%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>\nendobj\n3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>/Contents 5 0 R>>\nendobj\n4 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>/Contents 6 0 R>>\nendobj\n5 0 obj\n<</Length 23>>stream\nBT /F1 12 Tf 100 700 Td (Page 1) Tj ET\nendstream\nendobj\n6 0 obj\n<</Length 23>>stream\nBT /F1 12 Tf 100 700 Td (Page 2) Tj ET\nendstream\nendobj\nxref\n0 7\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000203 00000 n\n0000000295 00000 n\n0000000369 00000 n\ntrailer\n<</Size 7/Root 1 0 R>>\nstartxref\n443\n%%EOF';
    
    fs.writeFileSync(pdfPath, pdfContent);
    console.log('Sample PDF created');
  }
  
  // Read the PDF file as a Buffer and convert to Base64
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64Data = pdfBuffer.toString('base64');
  
  // Prepare data for the API request
  const data = {
    chunks: 2,
    file: base64Data
  };
  
  try {
    // Make the API request
    console.log('Sending request to split-document API...');
    const response = await fetch('http://localhost:3000/api/split-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    console.log(`API Response Status: ${response.status}`);
    const responseData = await response.json();
    console.log('API Response:', JSON.stringify(responseData, null, 2));
    
    // Save split documents if available
    if (responseData.documents && responseData.documents.length > 0) {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save each document
      responseData.documents.forEach((doc, index) => {
        const outputPath = path.join(outputDir, `split_${index + 1}.pdf`);
        const docBuffer = Buffer.from(doc, 'base64');
        fs.writeFileSync(outputPath, docBuffer);
        console.log(`Split document ${index + 1} saved to ${outputPath}`);
      });
    }
  } catch (error) {
    console.error('Error testing split-document API:', error);
  }
}

// Run the test
testSplitDocument(); 