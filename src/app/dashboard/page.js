"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import {
  getUserDocumentsSafe,
  getUserDataSetsSafe,
  getUserProcessingJobs,
} from "../../lib/firestoreService";
import { Button } from "../../components/ui/button";
import DocumentList from "../../components/DocumentList";
import DocumentCard from "../../components/DocumentCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  ToastProvider, 
  Toast, 
  ToastTitle, 
  ToastDescription, 
  ToastClose,
  ToastViewport
} from "../../components/ui/toast";
import {
  ArrowRight,
  FileText,
  Database,
  Upload,
  Clock,
  AlertCircle,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import ProcessingJobs from "../../components/dashboard/processing-jobs";
import { 
  Dialog, 
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingJobs, setProcessingJobs] = useState([]);
  const [previousJobs, setPreviousJobs] = useState({});
  const [toasts, setToasts] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [selectedDocumentName, setSelectedDocumentName] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [useCase, setUseCase] = useState("rewriter-legal");
  const [outputFormat, setOutputFormat] = useState("openai-jsonl");

  // Load data including processing jobs
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (user) {
          const [fetchedDocuments, fetchedDatasets, fetchedJobs] = await Promise.all([
            getUserDocumentsSafe(user.uid),
            getUserDataSetsSafe(user.uid),
            getUserProcessingJobs(user.uid),
          ]);

          setDocuments(fetchedDocuments);
          setDatasets(fetchedDatasets);
          
          // Check for job status changes
          const previousJobsObj = {};
          processingJobs.forEach(job => {
            previousJobsObj[job.id] = job;
          });
          
          // Find newly completed jobs
          const newlyCompleted = fetchedJobs.filter(job => 
            job.status === 'complete' && 
            previousJobsObj[job.id]?.status === 'processing'
          );
          
          // Find newly errored jobs
          const newlyErrored = fetchedJobs.filter(job => 
            job.status === 'error' && 
            previousJobsObj[job.id]?.status === 'processing'
          );
          
          // Add notifications for completed jobs
          newlyCompleted.forEach(job => {
            addToast({
              id: `complete-${job.id}`,
              title: "Processing Complete",
              description: `${job.fileName || 'Document'} has finished processing successfully.`,
              type: "success"
            });
          });
          
          // Add notifications for errored jobs
          newlyErrored.forEach(job => {
            addToast({
              id: `error-${job.id}`,
              title: "Processing Failed",
              description: `${job.fileName || 'Document'} processing has failed: ${job.errorMessage || 'Unknown error'}`,
              type: "error"
            });
          });
          
          // Update the list of jobs
          setProcessingJobs(fetchedJobs);
          
          // Save the current job state for comparison on next update
          setPreviousJobs(
            fetchedJobs.reduce((obj, job) => {
              obj[job.id] = job;
              return obj;
            }, {})
          );
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load data. Please try again later.");
      } finally {
        setLoading(false);
        setIsRetrying(false);
      }
    }

    fetchData();
    
    // Set up interval to refresh job status
    const refreshInterval = setInterval(() => {
      if (user) {
        getUserProcessingJobs(user.uid)
          .then(fetchedJobs => {
            // Check for newly completed or errored jobs
            const previousJobsObj = {};
            processingJobs.forEach(job => {
              previousJobsObj[job.id] = job;
            });
            
            // Find newly completed jobs
            const newlyCompleted = fetchedJobs.filter(job => 
              job.status === 'complete' && 
              previousJobsObj[job.id]?.status === 'processing'
            );
            
            // Find newly errored jobs
            const newlyErrored = fetchedJobs.filter(job => 
              job.status === 'error' && 
              previousJobsObj[job.id]?.status === 'processing'
            );
            
            // Add notifications for completed jobs
            newlyCompleted.forEach(job => {
              addToast({
                id: `complete-${job.id}`,
                title: "Processing Complete",
                description: `${job.fileName || 'Document'} has finished processing successfully.`,
                type: "success"
              });
            });
            
            // Add notifications for errored jobs
            newlyErrored.forEach(job => {
              addToast({
                id: `error-${job.id}`,
                title: "Processing Failed",
                description: `${job.fileName || 'Document'} processing has failed: ${job.errorMessage || 'Unknown error'}`,
                type: "error"
              });
            });
            
            // Update the list of jobs
            setProcessingJobs(fetchedJobs);
          })
          .catch(error => {
            console.error("Error refreshing jobs:", error);
          });
      }
    }, 45000); // Check every 45 seconds
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [user, isRetrying, processingJobs]);
  
  // Toast notification system
  const addToast = (toast) => {
    setToasts(prev => {
      // Check if this toast already exists
      if (prev.some(t => t.id === toast.id)) {
        return prev;
      }
      return [...prev, { ...toast, id: toast.id || Date.now() }];
    });
  };
  
  const dismissToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleRetry = () => {
    setIsRetrying(true);
  };

  // Simply navigate to the process page with auto-start parameter
  const handleProcessDocument = (docId) => {
    router.push(`/dashboard/process?documentId=${docId}&autoStart=true`);
  };

  const handleDownloadDataset = (filePath) => {
    // Open the download in a new tab/window
    window.open(`/api/process-document?file=${filePath}`, "_blank");
  };

  // Display processing stats
  const activeJobCount = processingJobs.filter(job => job.status === 'processing').length;
  const completedJobCount = processingJobs.filter(job => job.status === 'complete').length;

  const handleGenerateData = async (documentId, documentName) => {
    console.log(`Dashboard: handleGenerateData called for ${documentId}`, { documentName });
    
    try {
      // Create a temporary job ID
      const tempJobId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Show advanced options dialog before processing
      console.log(`Dashboard: Opening advanced options dialog for ${documentId}`);
      setSelectedDocumentId(documentId);
      setSelectedDocumentName(documentName);
      setShowAdvancedOptions(true);
    } catch (error) {
      console.error('Error generating data:', error);
      setError('Failed to start processing. Please try again.');
    }
  };

  // Expose handleGenerateData function to window for DocumentList component
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Only set the global function if it's not already defined
      if (!window.handleGenerateData) {
        console.log('Dashboard: Registering global handleGenerateData function');
        window.handleGenerateData = handleGenerateData;
      }
    }
    
    // Cleanup function
    return () => {
      if (typeof window !== 'undefined' && window.handleGenerateData === handleGenerateData) {
        console.log('Dashboard: Cleaning up global handleGenerateData function');
        delete window.handleGenerateData;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-lg border border-red-200 text-red-800">
        <div className="flex items-center mb-4">
          <AlertCircle className="h-6 w-6 mr-2" />
          <div>{error}</div>
        </div>
        <Button onClick={handleRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <ToastProvider>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleRetry}
                size="icon"
                title="Refresh data"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button asChild>
                <Link href="/dashboard/upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{documents.length}</div>
                <p className="text-xs text-gray-500">Total documents uploaded</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Data Sets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{datasets.length}</div>
                <p className="text-xs text-gray-500">
                  Generated training data sets
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Processing Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeJobCount}</div>
                <div className="flex gap-2 mt-1">
                  {activeJobCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                      {activeJobCount} Active
                    </span>
                  )}
                  {completedJobCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                      {completedJobCount} Completed
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Process Status */}
          <ProcessingJobs />

          {/* Tabs for Documents and Datasets */}
          <Tabs defaultValue="documents" className="mt-6">
            <TabsList>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="datasets">Generated Data Sets</TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="mt-6">
              <DocumentList />
            </TabsContent>

            <TabsContent value="datasets" className="mt-6">
              {datasets.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No data sets yet
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Process a document to generate your first synthetic data set
                  </p>
                  <Button asChild>
                    <Link href="/dashboard/upload">Upload Document</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {datasets.map((dataset) => (
                    <Card key={dataset.id}>
                      <CardHeader>
                        <CardTitle className="truncate">
                          {dataset.name || "Untitled Dataset"}
                        </CardTitle>
                        <CardDescription className="flex items-center text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {dataset.createdAt
                            ? new Date(
                                dataset.createdAt.seconds * 1000
                              ).toLocaleDateString()
                            : "Date unavailable"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-gray-500 mb-2">
                          <span className="font-medium">Entries:</span>{" "}
                          {dataset.entryCount || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                          <span className="font-medium">Source:</span>{" "}
                          {dataset.sourceDocument || "Unknown"}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleDownloadDataset(dataset.filePath)}
                        >
                          Download JSONL
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Quick Start Guide */}
          {documents.length === 0 && datasets.length === 0 && (
            <Card className="mt-6 bg-indigo-50 border-indigo-100">
              <CardHeader>
                <CardTitle>Quick Start Guide</CardTitle>
                <CardDescription>
                  Follow these steps to get started with data synthetix
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Upload a Document</h3>
                    <p className="text-sm text-gray-600">
                      Start by uploading a document such as a contract, SOP, or any
                      text-based file.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Generate Synthetic Data</h3>
                    <p className="text-sm text-gray-600">
                      Our AI will extract key statements and generate synthetic
                      variants.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Download Your Data</h3>
                    <p className="text-sm text-gray-600">
                      Get your JSONL file ready for fine-tuning AI models.
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild>
                  <Link href="/dashboard/upload">
                    Get Started <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )}
          
          {/* Toast notifications */}
          {toasts.map(toast => (
            <Toast key={toast.id} className={toast.type === 'error' ? 'bg-red-50' : toast.type === 'success' ? 'bg-green-50' : ''}>
              <div className="flex items-start gap-2">
                {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
                {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                <div className="grid gap-1">
                  <ToastTitle className={toast.type === 'error' ? 'text-red-700' : toast.type === 'success' ? 'text-green-700' : ''}>
                    {toast.title}
                  </ToastTitle>
                  <ToastDescription className="text-sm">
                    {toast.description}
                  </ToastDescription>
                </div>
              </div>
              <ToastClose onClick={() => dismissToast(toast.id)} />
            </Toast>
          ))}
          <ToastViewport />
        </div>

        {/* Advanced options dialog */}
        <Dialog open={showAdvancedOptions} onOpenChange={setShowAdvancedOptions}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Synthetic Data</DialogTitle>
              <DialogDescription>
                Select a use case and output format for generating synthetic data from "{selectedDocumentName}".
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="useCase">Use Case</Label>
                <Select
                  value={useCase}
                  onValueChange={(value) => setUseCase(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a use case" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rewriter-legal">Rewriter for Legal</SelectItem>
                    <SelectItem value="qa-sops" disabled className="text-gray-400">Q&A for SOPs (Coming Soon)</SelectItem>
                    <SelectItem value="math-finance" disabled className="text-gray-400">Math for Finance (Coming Soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="outputFormat">Output Format</Label>
                <Select
                  value={outputFormat}
                  onValueChange={(value) => setOutputFormat(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an output format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai-jsonl">OpenAI JSONL</SelectItem>
                    <SelectItem value="llama" disabled className="text-gray-400">Llama (Coming Soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdvancedOptions(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                setShowAdvancedOptions(false);
                router.push(`/dashboard/process?documentId=${selectedDocumentId}&useCase=${useCase}&outputFormat=${outputFormat}`);
              }}>
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ToastProvider>
    </>
  );
}
