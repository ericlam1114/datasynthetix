const fs = require('fs');
const path = require('path');

// List of files to check and fix
const filesToCheck = [
  'src/components/dashboard/processing-jobs.js'
];

// Process each file
filesToCheck.forEach(filePath => {
  console.log(`Checking file: ${filePath}`);
  
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Fix paths for badge and progress components
    const updatedContent = content
      .replace(/from ['"]@\/components\/ui\/badge['"]/g, "from '../ui/badge'")
      .replace(/from ['"]@\/components\/ui\/progress['"]/g, "from '../ui/progress'")
      .replace(/from ['"]\.\.\/\.\.\/components\/ui\/badge['"]/g, "from '../ui/badge'")
      .replace(/from ['"]\.\.\/\.\.\/components\/ui\/progress['"]/g, "from '../ui/progress'");
    
    // Write the updated content back to the file
    fs.writeFileSync(filePath, updatedContent);
    
    console.log(`Updated ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
});

console.log('Done!'); 