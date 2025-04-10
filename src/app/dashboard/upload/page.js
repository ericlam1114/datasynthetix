'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { addDocument } from '../../../lib/firestoreService';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Upload, FileText, File, X, ArrowLeft } from 'lucide-react';

export default function UploadDocumentPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const { user } = useAuth();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      // Check file type - allow PDF, DOCX, TXT
      const fileType = selectedFile.type;
      if (
        fileType !== 'application/pdf' &&
        fileType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        fileType !== 'text/plain'
      ) {
        setError('Invalid file type. Please upload PDF, DOCX, or TXT files.');
        setFile(null);
        return;
      }
      
      // Check file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum file size is 10MB.');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError('');
    }
  };

  const clearFile = () => {
    setFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // Create document data object
      const documentData = {
        name: name || file.name,
        description,
        userId: user.uid,
        fileType: file.type,
        fileSize: file.size,
        fileName: file.name
      };
      
      // Upload document to Firestore and Storage
      await addDocument(documentData, file);
      
      setSuccess('Document uploaded successfully!');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (error) {
      console.error('Error uploading document:', error);
      setError('Failed to upload document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mr-2"
          onClick={() => router.push('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Upload Document</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Document Upload</CardTitle>
          <CardDescription>
            Upload a document to generate synthetic training data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert className="mb-6 bg-green-50 text-green-800 border-green-200">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Document Name (Optional)</Label>
              <Input 
                id="name" 
                placeholder="Enter a name for this document" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                If not provided, the file name will be used
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea 
                id="description" 
                placeholder="Enter a description for this document" 
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Upload File</Label>
              {!file ? (
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => document.getElementById('file-upload').click()}
                >
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF, DOCX, or TXT (Max 10MB)
                  </p>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {file.type === 'application/pdf' ? (
                        <FileText className="h-8 w-8 text-red-500 mr-3" />
                      ) : file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                        <FileText className="h-8 w-8 text-blue-500 mr-3" />
                      ) : (
                        <File className="h-8 w-8 text-gray-500 mr-3" />
                      )}
                      <div>
                        <p className="font-medium truncate max-w-[200px] sm:max-w-sm">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={clearFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !file}
            >
              {loading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
          <div className="space-y-2 text-center max-w-md">
            <h3 className="font-medium">Supported File Types</h3>
            <p className="text-sm text-gray-600">
              We currently support PDF, DOCX, and TXT files. For best results, 
              ensure your documents have clear, readable text content.
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}