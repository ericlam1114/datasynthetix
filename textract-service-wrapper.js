// CommonJS wrapper for the Textract service
// This file adapts the ES modules to CommonJS for testing outside of Next.js

const fs = require('fs');
const path = require('path');

// Dynamically load the ES module by transpiling it
try {
  // Load the textract-service.js content
  const esModuleContent = fs.readFileSync(
    path.join(__dirname, 'src/lib/textract-service.js'),
    'utf8'
  );

  // Simple transformation to replace ES imports with CommonJS
  const transformedContent = esModuleContent
    .replace(/import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?/g, 
      (_, imports, module) => `const { ${imports} } = require('${module}');`)
    .replace(/import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g, 
      (_, name, module) => `const ${name} = require('${module}');`)
    .replace(/export\s+async\s+function/g, 'async function')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+default/g, 'module.exports =')
    .replace(/export\s+{([^}]+)}/g, 'module.exports = { $1 }');

  // Write to temporary file
  const tempFile = path.join(__dirname, 'textract-service-temp.js');
  fs.writeFileSync(tempFile, transformedContent, 'utf8');

  // Load the transformed file
  const textractService = require('./textract-service-temp');

  // Clean up temp file
  // fs.unlinkSync(tempFile);

  // Export the service
  module.exports = textractService;
} catch (error) {
  console.error('Error loading Textract service:', error);
  
  // Fallback implementation
  module.exports = {
    extractTextSync: async () => { 
      throw new Error('Textract service wrapper failed to load'); 
    },
    extractTextAsync: async () => { 
      throw new Error('Textract service wrapper failed to load'); 
    },
    extractTextWithTextract: async () => { 
      throw new Error('Textract service wrapper failed to load'); 
    }
  };
}

const documentBucket = process.env.AWS_S3_BUCKET;
const textractBucket = process.env.AWS_TEXTRACT_S3_BUCKET || process.env.AWS_S3_BUCKET; 