'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { addDataSet, getUserProfile } from '../lib/firestoreService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, FileText, File, X, CheckCircle, AlertCircle, Download, CreditCard, Settings, Filter } from 'lucide-react';

export default function DocumentProcessor({ initialDocument = null }) {
  const { user } = useAuth();
  const [name, setName] = useState(initialDocument?.name || '');
  const [description, setDescription] = useState(initialDocument?.description || '');
  const [file, setFile] = useState(null);
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(100);
  const [outputFormat, setOutputFormat] = useState('jsonl');
  const [classFilter, setClassFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [processingState, setProcessingState] = useState('idle'); // idle, uploading, processing, complete, error
  const [processResult, setProcessResult] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [creditsAvailable, setCreditsAvailable] = useState(5000);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [classStats, setClassStats] = useState({ Critical: 0, Important: 0, Standard: 0 });

  // Fetch user credits on component mount
  useEffect(() => {
    async function fetchCredits() {
      try {
        if (user) {
          const userDoc = await getUserProfile(user.uid);
          if (userDoc && userDoc.credits !== undefined) {
            setCreditsAvailable(userDoc.credits);
          }
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    }
    
    fetchCredits();
  }, [user]);

  useEffect(() => {
    if (processingState === 'complete' && processResult) {
      setActiveTab('preview');
    }
  }, [processingState, processResult]);

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

  const handleProcess = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setProgress(0);
      setProcessingState('uploading');
      
      // Create form data with all parameters
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.uid);
      formData.append('chunkSize', chunkSize);
      formData.append('overlap', overlap);
      formData.append('outputFormat', outputFormat);
      formData.append('classFilter', classFilter);
      
      // Upload and process document
      const response = await fetch('/api/process-document', {
        method: 'POST',
        body: formData
      });
      
      if (response.status === 402) {
        // 402 Payment Required - not enough credits
        setError('Insufficient credits. Please purchase more credits to process this document.');
        setProcessingState('error');
        setLoading(false);
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process document');
      }
      
      setProcessingState('processing');
      
      // Set up polling to check progress
      const pollingInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch(`/api/process-status?userId=${user.uid}&fileName=${file.name}`);
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            
            if (progressData.status === 'processing') {
              const progressPercent = Math.round((progressData.processedChunks / progressData.totalChunks) * 100);
              setProgress(progressPercent);
              setCreditsUsed(progressData.creditsUsed || 0);
            } else if (progressData.status === 'complete') {
              clearInterval(pollingInterval);
              setProgress(100);
              setProcessingState('complete');
              setProcessResult(progressData.result);
              
              if (progressData.result.classificationStats) {
                setClassStats(progressData.result.classificationStats);
              }
              
              // Update credits
              setCreditsAvailable(progressData.creditsRemaining || 0);
              setCreditsUsed(progressData.creditsUsed || 0);
              
              // Load preview data
              if (progressData.result.filePath) {
                const previewResponse = await fetch(`/api/preview-jsonl?file=${progressData.result.filePath}&limit=5`);
                if (previewResponse.ok) {
                  const previewData = await previewResponse.json();
                  setPreviewData(previewData.data);
                }
              }
              
              setActiveTab('preview');
            }
          }
        } catch (error) {
          console.error('Error checking progress:', error);
        }
      }, 2000);
      
      // Stop polling after 30 minutes (prevent infinite polling)
      setTimeout(() => {
        clearInterval(pollingInterval);
      }, 30 * 60 * 1000);
      
    } catch (error) {
      console.error('Error processing document:', error);
      setError(error.message || 'Failed to process document');
      setProcessingState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!processResult || !processResult.filePath) return;
    
    try {
      const response = await fetch(`/api/process-document?file=${processResult.filePath}`);
      if (!response.ok) throw new Error('Failed to download file');
      
      // Convert response to blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = processResult.fileName;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      setError('Failed to download file');
    }
  };

  // Render processing state
  const renderProcessingState = () => {
    switch (processingState) {
      case 'uploading':
        return (
          <div className="text-center py-6">
            <div className="animate-pulse text-indigo-600 mb-4">
              <Upload className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Uploading Document</h3>
            <p className="text-sm text-gray-500 mb-4">Please wait while we upload your document</p>
            <Progress value={30} className="h-2 w-full max-w-md mx-auto" />
          </div>
        );
      
      case 'processing':
        return (
          <div className="text-center py-6">
            <div className="animate-spin text-indigo-600 mb-4">
              <FileText className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Processing Document</h3>
            <p className="text-sm text-gray-500 mb-2">
              {`Processing clauses through all three models (${progress}% complete)`}
            </p>
            <p className="text-xs text-indigo-600 mb-4">
              {`Credits used: ${creditsUsed} / ${creditsAvailable} available`}
            </p>
            <Progress value={progress} className="h-2 w-full max-w-md mx-auto" />
          </div>
        );
      
      case 'complete':
        return (
          <div className="text-center py-6">
            <div className="text-green-500 mb-4">
              <CheckCircle className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Processing Complete</h3>
            <p className="text-sm text-gray-500 mb-2">
              {`Successfully generated ${processResult?.resultCount || 0} synthetic variants`}
            </p>
            <div className="flex gap-2 justify-center items-center mb-4">
              <div className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                Critical: {classStats.Critical || 0}
              </div>
              <div className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                Important: {classStats.Important || 0}
              </div>
              <div className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                Standard: {classStats.Standard || 0}
              </div>
            </div>
            <p className="text-xs text-indigo-600 mb-4">
              {`Credits used: ${creditsUsed}`}
            </p>
            <Button onClick={handleDownload} className="flex items-center">
              <Download className="h-4 w-4 mr-2" />
              Download {outputFormat === 'csv' ? 'CSV' : 'JSONL'}
            </Button>
          </div>
        );
      
      case 'error':
        return (
          <div className="text-center py-6">
            <div className="text-red-500 mb-4">
              <AlertCircle className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Processing Failed</h3>
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button variant="outline" onClick={() => setProcessingState('idle')}>
              Try Again
            </Button>
          </div>
        );
      
      default:
        return null;
    }
  };

  // Render file preview
  const renderFilePreview = () => {
    if (!file) return null;
    
    return (
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
            disabled={loading || processingState !== 'idle'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  // Render preview data
  const renderPreviewData = () => {
    if (!previewData || previewData.length === 0) {
      return (
        <div className="text-center py-6">
          <p className="text-gray-500">No preview data available</p>
        </div>
      );
    }

    // Handle different output formats
    if (outputFormat === 'openai' || outputFormat === 'jsonl') {
      return (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Preview (First 5 Entries)</h3>
          
          {previewData.map((item, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Entry {index + 1}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Original:</h4>
                    <p className="text-sm bg-gray-50 p-2 rounded">
                      {item.input}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Classification:</h4>
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold 
                      ${item.classification === 'Critical' ? 'bg-red-100 text-red-700' : 
                        item.classification === 'Important' ? 'bg-amber-100 text-amber-700' : 
                        'bg-blue-100 text-blue-700'}`}>
                      {item.classification}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-indigo-500 mb-1">Synthetic Variant:</h4>
                    <p className="text-sm bg-indigo-50 p-2 rounded">
                      {item.output}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          <div className="flex justify-center mt-6">
            <Button onClick={handleDownload} className="flex items-center">
              <Download className="h-4 w-4 mr-2" />
              Download Full {outputFormat === 'csv' ? 'CSV' : 'JSONL'} ({processResult?.resultCount || 0} entries)
            </Button>
          </div>
        </div>
      );
    } else {
      // Show preview for other formats
      return (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Preview ({outputFormat.toUpperCase()} Format)</h3>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Format Sample</CardTitle>
              <CardDescription>
                This is how your data will look in {outputFormat.toUpperCase()} format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-md text-xs overflow-auto">
                {outputFormat === 'mistral' && 
                  `<s>[INST] Write a clause similar to this: ${previewData[0]?.input || 'Example input clause'} [/INST] ${previewData[0]?.output || 'Example output clause'} </s>`
                }
                {outputFormat === 'falcon' && 
                  `Human: Rewrite this clause: ${previewData[0]?.input || 'Example input clause'}\n\nAssistant: ${previewData[0]?.output || 'Example output clause'}`
                }
                {outputFormat === 'claude' && 
                  `Human: ${previewData[0]?.input || 'Example input clause'}\n\nAssistant: ${previewData[0]?.output || 'Example output clause'}`
                }
                {outputFormat === 'csv' && 
                  `"${previewData[0]?.input || 'Example input clause'}","${previewData[0]?.classification || 'Critical'}","${previewData[0]?.output || 'Example output clause'}"`
                }
              </pre>
            </CardContent>
          </Card>
          
          <div className="flex justify-center mt-6">
            <Button onClick={handleDownload} className="flex items-center">
              <Download className="h-4 w-4 mr-2" />
              Download Full {outputFormat.toUpperCase()} File ({processResult?.resultCount || 0} entries)
            </Button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload">Upload Document</TabsTrigger>
          <TabsTrigger value="preview" disabled={processingState !== 'complete'}>Preview Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Document Upload</CardTitle>
                <CardDescription>
                  Upload a document to generate synthetic training data
                </CardDescription>
              </div>
              <div className="flex items-center text-sm gap-2 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">
                <CreditCard className="h-4 w-4" />
                <span>Credits: {creditsAvailable}</span>
              </div>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {processingState !== 'idle' ? (
                renderProcessingState()
              ) : (
                <form onSubmit={handleProcess} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Dataset Name (Optional)</Label>
                    <Input 
                      id="name" 
                      placeholder="Enter a name for the generated dataset" 
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
                      placeholder="Enter a description for this dataset" 
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  
                  <div className="border-t pt-4">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm text-gray-500 mb-4"
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    >
                      <Settings className="h-4 w-4" />
                      {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                    </button>
                    
                    {showAdvancedSettings && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="chunkSize">Chunk Size</Label>
                            <Select 
                              value={chunkSize.toString()} 
                              onValueChange={(value) => setChunkSize(parseInt(value, 10))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select chunk size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="500">500 characters</SelectItem>
                                <SelectItem value="1000">1000 characters (Default)</SelectItem>
                                <SelectItem value="1500">1500 characters</SelectItem>
                                <SelectItem value="2000">2000 characters</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Length of text chunks to process
                            </p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="overlap">Chunk Overlap</Label>
                            <Select 
                              value={overlap.toString()} 
                              onValueChange={(value) => setOverlap(parseInt(value, 10))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select overlap size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">No overlap</SelectItem>
                                <SelectItem value="50">50 characters</SelectItem>
                                <SelectItem value="100">100 characters (Default)</SelectItem>
                                <SelectItem value="200">200 characters</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Amount of text to overlap between chunks
                            </p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="outputFormat">Output Format</Label>
                            <Select 
                              value={outputFormat} 
                              onValueChange={setOutputFormat}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select output format" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="jsonl">JSONL (Default)</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="mistral">Mistral</SelectItem>
                                <SelectItem value="falcon">Falcon</SelectItem>
                                <SelectItem value="claude">Claude</SelectItem>
                                <SelectItem value="csv">CSV</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Format of the generated training data
                            </p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="classFilter">Classification Filter</Label>
                            <Select 
                              value={classFilter} 
                              onValueChange={setClassFilter}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select classification filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Classifications</SelectItem>
                                <SelectItem value="critical">Critical Only</SelectItem>
                                <SelectItem value="important">Important Only</SelectItem>
                                <SelectItem value="critical_important">Critical & Important</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Filter clauses by importance classification
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
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
                      renderFilePreview()
                    )}
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading || !file}
                  >
                    {loading ? 'Processing...' : 'Process Document'}
                  </Button>
                </form>
              )}
            </CardContent>
            <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
              <div className="space-y-2 text-center max-w-md">
                <h3 className="font-medium">Three-Step Processing Pipeline</h3>
                <p className="text-sm text-gray-600">
                  Our AI uses three specialized models to extract clauses, classify their importance, 
                  and generate synthetic variants that match your organization's exact language style.
                  The output is formatted for fine-tuning various AI models.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="preview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Results Preview</CardTitle>
              <CardDescription>
                Preview the generated synthetic training data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderPreviewData()}
            </CardContent>
            <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
              <div className="space-y-2 text-center max-w-md">
                <h3 className="font-medium">Using Your Data</h3>
                <p className="text-sm text-gray-600">
                  The downloaded {outputFormat.toUpperCase()} file is ready for fine-tuning with OpenAI, Anthropic, 
                  or other AI platforms. Each entry contains the original content, classification, and a synthetic variant.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}