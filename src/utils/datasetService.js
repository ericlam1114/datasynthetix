import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Save generated dataset as JSONL to Firebase Storage
 * @param {string} datasetId - ID of the dataset
 * @param {string} userId - User ID
 * @param {Array} records - Array of JSON records to save as JSONL
 * @returns {Promise<Object>} File info including download URL
 */
export async function saveDatasetAsJsonl(datasetId, userId, records) {
  try {
    // Convert records array to JSONL format (one JSON object per line)
    const jsonlContent = records.map(record => JSON.stringify(record)).join('\n');
    
    // Convert to buffer
    const buffer = Buffer.from(jsonlContent, 'utf-8');
    
    // Get storage reference
    const storage = getStorage();
    const fileName = `dataset-${datasetId}.jsonl`;
    const filePath = `datasets/${userId}/${fileName}`;
    const fileRef = ref(storage, filePath);
    
    // Upload JSONL file
    await uploadBytes(fileRef, buffer, {
      contentType: 'application/jsonl',
      customMetadata: {
        'userId': userId,
        'datasetId': datasetId,
        'recordCount': records.length.toString()
      }
    });
    
    // Get download URL
    const downloadUrl = await getDownloadURL(fileRef);
    
    // Update dataset record with file information
    const db = getFirestore();
    await updateDoc(doc(db, "datasets", datasetId), {
      jsonlUrl: downloadUrl,
      jsonlPath: filePath,
      recordCount: records.length,
      updatedAt: serverTimestamp()
    });
    
    return {
      fileName,
      filePath,
      downloadUrl,
      recordCount: records.length
    };
  } catch (error) {
    console.error('Error saving dataset as JSONL:', error);
    throw error;
  }
}

/**
 * Generate a temporary download URL for a dataset
 * @param {string} datasetId - ID of the dataset
 * @param {string} userId - User ID
 * @returns {Promise<string>} Download URL
 */
export async function getDatasetDownloadUrl(datasetId, userId) {
  try {
    const storage = getStorage();
    const filePath = `datasets/${userId}/dataset-${datasetId}.jsonl`;
    const fileRef = ref(storage, filePath);
    
    // Generate a URL that expires in 1 hour
    const downloadUrl = await getDownloadURL(fileRef);
    
    return downloadUrl;
  } catch (error) {
    console.error('Error getting dataset download URL:', error);
    throw error;
  }
} 