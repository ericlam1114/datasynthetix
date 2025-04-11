const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function createSamplePDF() {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Add a page to the document
  const page = pdfDoc.addPage([550, 750]);
  
  // Get the font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // Set some content for the document
  const text = [
    "AWS Textract Test Document",
    "",
    "This PDF contains sample text to test Amazon Textract integration.",
    "If you can read this text in the extraction results, Textract is working!",
    "",
    "Some features of Amazon Textract include:",
    "  • OCR (Optical Character Recognition)",
    "  • Document analysis",
    "  • Form extraction",
    "  • Table detection",
    "",
    "AWS Textract can be used for various document processing tasks:",
    "1. Digitizing paper documents",
    "2. Automating data entry",
    "3. Processing receipts and invoices",
    "4. Analyzing business documents",
    "",
    "This test document was created: " + new Date().toISOString()
  ];

  // Add the text to the page
  const textSize = 12;
  const margin = 50;
  let y = page.getHeight() - margin;
  
  // Add title in larger text
  page.drawText(text[0], {
    x: margin,
    y: y,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });
  
  y -= 40;
  
  // Add the rest of the text
  for (let i = 1; i < text.length; i++) {
    const line = text[i];
    page.drawText(line, {
      x: margin,
      y,
      size: textSize,
      font,
      color: rgb(0, 0, 0),
    });
    
    // More space after blank lines
    y -= line === "" ? 20 : 15;
  }
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, 'textract-test-doc.pdf');
  
  // Write to file
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Sample PDF with text created at: ${outputPath}`);
  
  return outputPath;
}

createSamplePDF().catch(console.error); 