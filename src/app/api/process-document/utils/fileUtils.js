import fs from 'fs/promises';
import path from 'path';

/**
 * Ensure the uploads directory exists
 * @param {string} uploadsDir - The path to the uploads directory
 * @returns {Promise<void>}
 */
export async function ensureUploadsDir(uploadsDir) {
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(uploadsDir, { recursive: true });
  }
}

/**
 * Create a user-specific directory within the uploads directory
 * @param {string} userId - The user ID
 * @param {string} uploadsDir - The base uploads directory
 * @returns {Promise<string>} The path to the user directory
 */
export async function createUserDirectory(userId, uploadsDir) {
  const userDir = path.join(uploadsDir, userId);
  await ensureUploadsDir(userDir);
  return userDir;
}

/**
 * Save a file to disk
 * @param {File|Blob|Buffer} file - The file to save
 * @param {string} filePath - The path to save the file to
 * @returns {Promise<void>}
 */
export async function saveFileToDisk(file, filePath) {
  try {
    console.log(`Saving file to ${filePath}`);
    
    // Convert File/Blob to Buffer if needed
    let buffer;
    
    if (file instanceof File || file instanceof Blob) {
      // Handle web File or Blob object
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (Buffer.isBuffer(file)) {
      // Already a buffer
      buffer = file;
    } else if (typeof file === 'string') {
      // Handle string data
      buffer = Buffer.from(file);
    } else {
      throw new Error(`Unsupported file type: ${typeof file}`);
    }
    
    // Write the file
    await fs.writeFile(filePath, buffer);
  } catch (error) {
    console.error(`Error saving file to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Generate a clean filename without special characters
 * @param {string} originalName - The original filename
 * @returns {string} A cleaned version of the filename
 */
export function sanitizeFileName(originalName) {
  // Get the file extension
  const extension = path.extname(originalName);
  
  // Get the base name without extension
  const baseName = path.basename(originalName, extension);
  
  // Replace special characters
  const cleanBaseName = baseName
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50); // Limit length
  
  // Combine clean base name with original extension
  return `${cleanBaseName}${extension}`;
} 