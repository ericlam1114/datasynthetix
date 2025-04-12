"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import DocumentProcessingStatus from '@/components/DocumentProcessingStatus';

export default function DocumentUploadPage() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (!selectedFile) return;
    
    // Validate file type
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, DOCX, or TXT file.');
      return;
    }
    
    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }
    
    setFile(selectedFile);
    setError('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    
    try {
      setIsUploading(true);
      setError('');
      
      // Create form data for the file
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload to API
      const response = await fetch('/api/process-document', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error uploading document');
      }
      
      const data = await response.json();
      
      // Set the job ID for tracking
      setJobId(data.jobId);
      setIsUploading(false);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Error processing document');
      setIsUploading(false);
    }
  };

  const handleComplete = (resultData) => {
    setResult(resultData);
    // You could redirect to a result page or do other actions
    console.log('Processing complete:', resultData);
  };

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Upload Document</h1>
        
        {!jobId ? (
          <Card>
            <CardHeader>
              <CardTitle>Select Document to Process</CardTitle>
              <CardDescription>
                Upload a document to extract structured data with our AI pipeline. 
                Supported formats: PDF, DOCX, TXT.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Document File</Label>
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => document.getElementById('file-upload').click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const droppedFile = e.dataTransfer.files[0];
                        const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
                        
                        if (!validTypes.includes(droppedFile.type)) {
                          setError('Please upload a PDF, DOCX, or TXT file.');
                          return;
                        }
                        
                        if (droppedFile.size > 10 * 1024 * 1024) {
                          setError('File is too large. Maximum size is 10MB.');
                          return;
                        }
                        
                        setFile(droppedFile);
                        setError('');
                      }
                    }}
                  >
                    <Input 
                      id="file-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={handleFileChange}
                    />
                    <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      PDF, DOCX, or TXT (Max 10MB)
                    </p>
                  </div>
                </div>
                
                {file && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center">
                      <FileText className="h-8 w-8 text-indigo-500 mr-3" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={!file || isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Process Document'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
              <div className="space-y-2 text-center max-w-md">
                <h3 className="font-medium">Intelligent Document Processing</h3>
                <p className="text-sm text-gray-600">
                  Our AI-powered pipeline analyzes your document, extracts key information,
                  and generates structured data for your application.
                </p>
              </div>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Document Processing</CardTitle>
              <CardDescription>
                Your document is being processed with our AI pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentProcessingStatus 
                jobId={jobId} 
                onComplete={handleComplete}
              />
              
              {result && (
                <div className="mt-6 p-4 bg-green-50 rounded-lg">
                  <h3 className="font-medium text-green-800 mb-2">Processing Complete</h3>
                  <p className="text-sm text-green-700">
                    Your document has been processed successfully.
                  </p>
                  
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-xs text-gray-500">Processed Items</p>
                      <p className="text-xl font-bold">{result.totalItems || 0}</p>
                    </div>
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-xs text-gray-500">Processing Time</p>
                      <p className="text-xl font-bold">{result.processingTimeMs ? `${(result.processingTimeMs/1000).toFixed(1)}s` : 'N/A'}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => setJobId(null)}>Process Another Document</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 