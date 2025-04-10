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
 * @param {Buffer} buffer - The file buffer to save
 * @param {string} filePath - The path where the file should be saved
 * @returns {Promise<void>}
 */
export async function saveFileToDisk(buffer, filePath) {
  try {
    // Ensure the directory exists
    const fileDir = path.dirname(filePath);
    await ensureUploadsDir(fileDir);
    
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