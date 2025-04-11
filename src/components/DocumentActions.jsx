import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, IconButton, Tooltip, CircularProgress, Box, Typography, Alert } from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

/**
 * DocumentActions component 
 * Provides buttons for document operations like generating synthetic data
 */
const DocumentActions = ({ document, onRefresh }) => {
  const { user, getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [generationJobId, setGenerationJobId] = useState(null);
  
  // Function to handle data generation
  const handleGenerateData = async () => {
    if (!user) return;
    if (!document?.id) {
      setError('No document selected');
      return;
    }
    
    try {
      setLoading(true);
      setProgress(5);
      setError(null);
      setSuccess(null);
      setStatusMessage('Preparing to generate data...');
      
      // Get authentication token
      const token = await getIdToken();
      
      // Create form data with document ID
      const formData = new FormData();
      formData.append('documentId', document.id);
      formData.append('documentName', document.name || 'Unnamed document');
      
      // Call the API
      const response = await fetch('/api/generate-from-pdf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate data');
      }
      
      // Store job ID to poll status
      if (data.jobId) {
        setGenerationJobId(data.jobId);
        pollJobStatus(data.jobId, token);
      } else {
        // If no job ID, assume success
        setProgress(100);
        setStatusMessage('Data generated successfully!');
        setSuccess(`Generated data with ID: ${data.resultId}`);
        // Refresh the document list or details
        if (onRefresh) onRefresh();
      }
    } catch (error) {
      console.error('Error generating data:', error);
      setError(error.message);
      setStatusMessage('Failed to generate data');
      setProgress(0);
    }
  };
  
  // Function to poll job status
  const pollJobStatus = async (jobId, token) => {
    try {
      const response = await fetch(`/api/jobs/status?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      
      const jobStatus = await response.json();
      
      // Update UI based on status
      setProgress(jobStatus.progress || 0);
      setStatusMessage(getStatusMessage(jobStatus));
      
      if (jobStatus.status === 'complete') {
        setLoading(false);
        setSuccess('Data generated successfully!');
        if (onRefresh) onRefresh();
        return;
      } else if (jobStatus.status === 'error') {
        setLoading(false);
        setError(jobStatus.errorMessage || 'An error occurred during processing');
        return;
      }
      
      // If job is still processing, poll again after delay
      setTimeout(() => pollJobStatus(jobId, token), 2000);
    } catch (error) {
      console.error('Error polling job status:', error);
      setError('Failed to get processing status');
      setLoading(false);
    }
  };
  
  // Helper to get user-friendly status message
  const getStatusMessage = (status) => {
    switch (status.stage) {
      case 'extraction':
        return 'Extracting text from PDF...';
      case 'data_generation':
        return 'Generating synthetic data...';
      case 'analyzing_structure':
        return 'Analyzing document structure...';
      default:
        return status.status === 'complete' 
          ? 'Data generated successfully!' 
          : status.status === 'error'
            ? `Error: ${status.errorMessage}`
            : 'Processing...';
    }
  };

  // Function to handle direct PDF upload and generation
  const handleFileUploadAndGenerate = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Verify it's a PDF
    if (!file.type.includes('pdf')) {
      setError('Only PDF files are supported');
      return;
    }
    
    try {
      setLoading(true);
      setProgress(5);
      setError(null);
      setSuccess(null);
      setStatusMessage('Uploading PDF...');
      
      // Get authentication token
      const token = await getIdToken();
      
      // Create form data with file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentName', file.name.replace('.pdf', ''));
      
      // Call the API
      const response = await fetch('/api/generate-from-pdf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PDF');
      }
      
      // Store job ID to poll status
      if (data.jobId) {
        setGenerationJobId(data.jobId);
        pollJobStatus(data.jobId, token);
      } else {
        // If no job ID, assume success
        setProgress(100);
        setStatusMessage('Data generated successfully!');
        setSuccess(`Generated data with ID: ${data.resultId}`);
        // Refresh the document list or details
        if (onRefresh) onRefresh();
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      setError(error.message);
      setStatusMessage('Failed to process PDF');
      setProgress(0);
      setLoading(false);
    }
  };
  
  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      {/* Generate Data button for existing document */}
      {document?.id && (
        <Button
          variant="contained"
          color="primary"
          startIcon={<DataObjectIcon />}
          onClick={handleGenerateData}
          disabled={loading}
          sx={{ mr: 1 }}
        >
          Generate Data
        </Button>
      )}
      
      {/* Upload and Generate button */}
      <Button
        variant="outlined"
        component="label"
        startIcon={<UploadFileIcon />}
        disabled={loading}
      >
        Upload PDF & Generate
        <input
          type="file"
          hidden
          accept="application/pdf"
          onChange={handleFileUploadAndGenerate}
        />
      </Button>
      
      {/* Status and progress */}
      {loading && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
          <CircularProgress
            variant="determinate"
            value={progress}
            size={24}
            sx={{ mr: 1 }}
          />
          <Typography variant="body2">
            {statusMessage} ({progress}%)
          </Typography>
        </Box>
      )}
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {/* Success message */}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      
      {/* Help tooltip */}
      <Tooltip title="Upload a PDF document and instantly generate synthetic data from it. The system will extract text from the PDF and generate realistic but fictional data based on the document's structure.">
        <IconButton size="small" sx={{ ml: 1 }}>
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default DocumentActions; 