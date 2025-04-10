'use client';

import { useState } from 'react';

export default function TestPdfPage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  
  const handleFileChange = (e) => {
    if (e.target.files?.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setError('Please select a PDF file first');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await fetch('/api/test-pdf-extraction', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error('Error testing PDF extraction:', err);
      setError('Failed to process PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">PDF Extraction Test Tool</h1>
      
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Select PDF File
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="block w-full text-sm border border-gray-300 rounded p-2"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !selectedFile}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-blue-300"
        >
          {loading ? 'Processing...' : 'Test Extraction'}
        </button>
      </form>
      
      {error && (
        <div className="bg-red-100 border border-red-500 text-red-700 p-4 rounded mb-6">
          {error}
        </div>
      )}
      
      {result && (
        <div className="border border-gray-300 rounded p-4">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          
          <div className="mb-4">
            <p><strong>File Name:</strong> {result.fileName}</p>
            <p><strong>File Size:</strong> {result.fileSize} bytes</p>
            <p><strong>Text Length:</strong> {result.textLength} characters</p>
            <p>
              <strong>Validation:</strong> 
              <span className={result.isValid ? "text-green-600" : "text-red-600"}>
                {result.isValid ? "Valid" : "Invalid"} 
                {!result.isValid && result.validation?.reason && ` (${result.validation.reason})`}
              </span>
            </p>
          </div>
          
          {result.textLength > 0 && (
            <div>
              <h3 className="font-medium mb-2">Text Sample:</h3>
              <div className="bg-gray-100 p-3 rounded max-h-64 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm">{result.textSample}...</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 