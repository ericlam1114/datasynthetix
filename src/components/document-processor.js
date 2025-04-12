"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  addDataSet,
  getUserProfile,
  saveProcessingJob,
} from "../lib/firestoreService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import {
  Upload,
  FileText,
  File,
  X,
  CheckCircle,
  AlertCircle,
  Download,
  CreditCard,
  Settings,
  Filter,
} from "lucide-react";
import DocumentProcessingStatus from "./DocumentProcessingStatus";
import DocumentSplitter from "./DocumentSplitter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";

const DocumentProcessor = forwardRef(({ 
  initialDocument = null, 
  initialJobId = null, 
  autoShowProcessing = false,
  useCase: initialUseCase = "rewriter-legal",
  outputFormat: initialOutputFormat = "openai-jsonl"
}, ref) => {
  const { user } = useAuth();
  const [name, setName] = useState(initialDocument?.name || "");
  const [description, setDescription] = useState(
    initialDocument?.description || ""
  );
  const [file, setFile] = useState(null);
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(100);
  const [outputFormat, setOutputFormat] = useState(initialOutputFormat);
  const [classFilter, setClassFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [processingState, setProcessingState] = useState(autoShowProcessing ? "processing" : "idle");
  const [processAttempts, setProcessAttempts] = useState(0);
  const [processResult, setProcessResult] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [activeTab, setActiveTab] = useState(autoShowProcessing ? "preview" : "upload");
  const [creditsAvailable, setCreditsAvailable] = useState(5000);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [classStats, setClassStats] = useState({
    Critical: 0,
    Important: 0,
    Standard: 0,
  });
  const [lastProgressUpdate, setLastProgressUpdate] = useState(new Date());
  const [isProcessingActive, setIsProcessingActive] = useState(true);
  const [lastPollingTime, setLastPollingTime] = useState(null);
  const [currentStage, setCurrentStage] = useState("");
  const [processingStats, setProcessingStats] = useState({
    totalChunks: 0,
    extractedClauses: 0,
    classifiedClauses: 0,
    generatedVariants: 0,
  });
  const [files, setFiles] = useState([]);
  const [uploadErrors, setUploadErrors] = useState({});
  const [useOcr, setUseOcr] = useState(false);
  const [prioritizeImportant, setPrioritizeImportant] = useState(false);
  const [jobId, setJobId] = useState(initialJobId);
  const [showSplitter, setShowSplitter] = useState(false);
  const [showSizeWarning, setShowSizeWarning] = useState(false);
  const [documentAnalysis, setDocumentAnalysis] = useState(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchDocuments, setBatchDocuments] = useState([]);
  const [useCase, setUseCase] = useState(initialUseCase);
  const [useTextract, setUseTextract] = useState(true);
  const [componentMounted, setComponentMounted] = useState(false);

  // Expose functions to parent components via ref
  useImperativeHandle(ref, () => ({
    handleProcess: function () {
      return handleProcess();
    },
    setProcessingState: function(state, newJobId = null) {
      console.log(`Setting processing state to ${state}`, {newJobId});
      setProcessingState(state);
      if (newJobId) {
        setJobId(newJobId);
        startPollingStatus(newJobId);
      } else if (state === "processing" && initialDocument) {
        // If setting to processing without a job ID, create one
        const tempJobId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        setJobId(tempJobId);
        handleProcess();
      }
    }
  }));

  // Set component as mounted after initial render
  useEffect(() => {
    setComponentMounted(true);
    return () => setComponentMounted(false);
  }, []);

  // Initialize UI as soon as component loads with initialJobId
  useEffect(() => {
    // If we have an initial job ID or autoShowProcessing is true, we should show processing UI right away
    if (componentMounted && (initialJobId || (autoShowProcessing && initialDocument))) {
      console.log(`Initializing with processing view:`, {
        initialJobId, 
        autoShowProcessing, 
        documentAvailable: !!initialDocument
      });
      
      // Set appropriate state to show processing UI
      setProcessingState("processing"); 
      setProgress(10);
      
      // Force the correct tab based on job state, but show processing UI
      if (processingState === "complete") {
        setActiveTab("preview");
      } else {
        setActiveTab("upload");
      }
      
      // If we have a job ID, start polling for status
      if (initialJobId) {
        console.log(`Starting polling for job ID: ${initialJobId}`);
        startPollingStatus(initialJobId);
      }
    }
  }, [initialJobId, initialDocument, autoShowProcessing, componentMounted]);

  // Function to start polling for a job status
  const startPollingStatus = (jobIdToUse) => {
    console.log(`Starting status polling for job: ${jobIdToUse}`);
    
    // Set initial processing state
    setProcessingState("processing");
    setProgress(10); // Start with some progress
    
    // NOTE: We don't need to manually poll for status now - the DocumentProcessingStatus component will handle that
    // Set the jobId to make the component work
    setJobId(jobIdToUse);
  };

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
        console.error("Error fetching credits:", error);
      }
    }

    fetchCredits();
  }, [user]);

  useEffect(() => {
    if (processingState === "complete" && processResult) {
      setActiveTab("preview");
    }
  }, [processingState, processResult]);

  // Set file placeholder from initialDocument if available
  useEffect(() => {
    if (initialDocument && initialDocument.fileName) {
      // Create a placeholder for the file
      const placeholderFile = {
        name: initialDocument.fileName,
        type: initialDocument.fileType || "application/pdf",
        size: initialDocument.fileSize || 0,
      };
      setFile(placeholderFile);
    }
  }, [initialDocument]);

  const updateProcessingStatus = async (
    status,
    processedChunks,
    totalChunks
  ) => {
    try {
      const fileName = file?.name || initialDocument?.fileName;

      await fetch("/api/process-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          fileName,
          status,
          processedChunks,
          totalChunks,
          creditsUsed,
          creditsRemaining: creditsAvailable,
          updatedAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error updating processing status:", error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (selectedFile) {
      // Check file type - allow PDF, DOCX, TXT
      const fileType = selectedFile.type;
      if (
        fileType !== "application/pdf" &&
        fileType !==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
        fileType !== "text/plain"
      ) {
        setError("Invalid file type. Please upload PDF, DOCX, or TXT files.");
        setFile(null);
        return;
      }

      // Check file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("File too large. Maximum file size is 10MB.");
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError("");
    }
  };

  const clearFile = () => {
    if (!initialDocument) {
      setFile(null);
    }
  };

  // This function analyzes if the document will require batching
  const analyzeDocument = async (documentToCheck) => {
    // Size thresholds
    const MAX_FILE_SIZE_MB = 5; // Lowered from 10MB to 5MB file size warning threshold
    const MAX_PAGES = 30; // Lowered from 50 to 30 pages warning threshold
    const MAX_TOKENS_ESTIMATE = 100000; // Lowered from 150000 to 100000 tokens
    const CHARS_PER_TOKEN = 4; // Rough estimate
    
    // Get document details
    const fileSize = documentToCheck?.fileSize || (file?.size || 0);
    const fileName = documentToCheck?.fileName || documentToCheck?.name || file?.name || "document";
    const fileSizeMB = fileSize / (1024 * 1024);
    const isLargeFile = fileSizeMB > MAX_FILE_SIZE_MB;
    
    // If we have an estimate of pages, use it
    const estimatedPages = documentToCheck?.totalPages || documentToCheck?.pages || 
      (isLargeFile ? Math.round(fileSizeMB * 5) : 0); // Rough estimate: 5 pages per MB
    const isLongDocument = estimatedPages > MAX_PAGES;
    
    // If we have content, estimate token count
    const contentLength = documentToCheck?.content?.length || 0;
    const estimatedTokens = Math.ceil(contentLength / CHARS_PER_TOKEN);
    const exceedsTokenLimit = estimatedTokens > MAX_TOKENS_ESTIMATE;
    
    // For testing purposes, show batching more often
    const needsBatching = isLargeFile || isLongDocument || exceedsTokenLimit || estimatedPages > 15;
    
    // Calculate recommended batches if needed
    let recommendedBatches = 1;
    if (needsBatching) {
      // Base recommendation on the most restrictive factor
      const batchesBySize = isLargeFile ? Math.ceil(fileSizeMB / MAX_FILE_SIZE_MB) : 1;
      const batchesByPages = isLongDocument ? Math.ceil(estimatedPages / MAX_PAGES) : 1;
      const batchesByTokens = exceedsTokenLimit ? Math.ceil(estimatedTokens / MAX_TOKENS_ESTIMATE) : 1;
      
      recommendedBatches = Math.max(2, batchesBySize, batchesByPages, batchesByTokens);
      recommendedBatches = Math.min(recommendedBatches, 10); // Cap at 10 batches
    }
    
    return {
      fileName,
      fileSize,
      fileSizeMB,
      isLargeFile,
      estimatedPages,
      isLongDocument,
      estimatedTokens,
      exceedsTokenLimit,
      needsBatching,
      recommendedBatches,
      reason: isLargeFile ? 'size' : isLongDocument ? 'pages' : exceedsTokenLimit ? 'tokens' : estimatedPages > 15 ? 'pages' : null
    };
  };

  // This function is called before actually processing a document
  const prepareDocumentForProcessing = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    if (!file && !initialDocument) {
      setError("Please select a file to upload.");
      return;
    }
    
    // Analyze document size/complexity
    const analysis = await analyzeDocument(initialDocument || file);
    setDocumentAnalysis(analysis);
    
    // Always show warning if document is very large
    if (analysis.needsBatching) {
      setShowSizeWarning(true);
      return;
    }
    
    // If document is acceptable size, process normally
    handleProcess();
  };

  const handleProcess = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!file && !initialDocument) {
      setError("Please select a file to upload.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setProgress(0);
      setProcessingState("uploading");

      // Get the auth token for passing to the API
      let authToken = null;
      try {
        if (!user) {
          throw new Error("User not authenticated");
        }

        // Get the ID token from Firebase Auth
        authToken = await user.getIdToken(true);
        console.log("Got auth token for API request");
      } catch (tokenError) {
        console.warn("Failed to get auth token:", tokenError);
        setError(
          "Authentication error: " +
            (tokenError.message ||
              "Failed to get authentication token. Try refreshing the page.")
        );
        setProcessingState("auth-error");
        setLoading(false);
        return;
      }

      // Create form data with all parameters
      const formData = new FormData();

      // Safer check for File object without using instanceof
      const isRealFile =
        file &&
        typeof file === "object" &&
        "name" in file &&
        "size" in file &&
        "type" in file &&
        typeof file.name === "string";

      const fileName = isRealFile
        ? file.name
        : initialDocument?.fileName || "document.pdf";

      // Create a unique job ID
      const newJobId = `job-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 7)}`;
      
      // Save the job ID
      setJobId(newJobId);

      // First, create the job in Firestore
      const jobData = {
        userId: user.uid,
        jobId: newJobId,
        fileName,
        status: "uploading",
        progress: 0,
        createdAt: new Date().toISOString(),
        documentId: initialDocument?.id || null,
        processingOptions: {
          chunkSize,
          overlap,
          outputFormat,
          classFilter,
        },
      };

      // Save the initial job to Firestore
      await saveProcessingJob(user.uid, jobData);

      // Update form data
      if (isRealFile && typeof file.arrayBuffer === "function") {
        // If we have an actual File object (from file input)
        formData.append("file", file);
      } else if (initialDocument) {
        // If we're processing from an existing document
        formData.append("documentId", initialDocument.id);
      } else {
        throw new Error("No document to process");
      }

      formData.append("userId", user.uid);
      formData.append("chunkSize", chunkSize);
      formData.append("overlap", overlap);
      formData.append("outputFormat", outputFormat);
      formData.append("classFilter", classFilter);
      formData.append("prioritizeImportant", prioritizeImportant);
      formData.append("jobId", newJobId); // Add job ID to form data
      formData.append("useCase", useCase); // Add use case to form data
      formData.append("useTextract", useTextract);

      // Add timeout configurations for document processing
      formData.append("documentTimeout", "600000"); // 10 minutes overall timeout
      formData.append("chunkTimeout", "120000");    // 2 minutes per chunk
      formData.append("extractionTimeout", "30000"); // 30 seconds for extraction
      formData.append("classificationTimeout", "15000"); // 15 seconds for classification
      formData.append("variantTimeout", "20000");   // 20 seconds for variant generation

      // Add auth token if available
      if (authToken) {
        formData.append("authToken", authToken);
      }

      // Upload and process document
      const response = await fetch("/api/process-document", {
        method: "POST",
        headers: authToken
          ? {
              Authorization: `Bearer ${authToken}`,
            }
          : undefined,
        body: formData,
      });

      if (response.status === 402) {
        // 402 Payment Required - not enough credits
        setError(
          "Insufficient credits. Please purchase more credits to process this document."
        );
        setProcessingState("error");
        setLoading(false);

        // Update job status in Firestore
        await saveProcessingJob(user.uid, {
          ...jobData,
          status: "error",
          errorMessage: "Insufficient credits",
          updatedAt: new Date().toISOString(),
        });

        return;
      }

      if (!response.ok) {
        const errorData = await response.json();

        // Handle specific Firebase auth errors
        if (
          response.status === 403 &&
          errorData.status === "firebase-auth-error"
        ) {
          setError(
            `Authentication Error: ${errorData.error} ${
              errorData.details || ""
            } ${errorData.solution || "Please try again."}`
          );

          console.warn("Firebase authentication error details:", errorData);

          // Set a more specific error state
          setProcessingState("auth-error");

          // Update job status in Firestore
          await saveProcessingJob(user.uid, {
            ...jobData,
            status: "error",
            errorMessage: `Authentication Error: ${errorData.error}`,
            updatedAt: new Date().toISOString(),
          });
        } else {
          // Handle generic errors
          const errorMessage = errorData.error || "Failed to process document";
          setError(errorMessage);
          setProcessingState("error");

          // Update job status in Firestore
          await saveProcessingJob(user.uid, {
            ...jobData,
            status: "error",
            errorMessage,
            updatedAt: new Date().toISOString(),
          });
        }

        setLoading(false);
        return;
      }

      // Process successful response
      if (response.ok) {
        const responseData = await response.json();

        // Set processing state to processing
        setProcessingState("processing");

        // Update job status in Firestore
        await saveProcessingJob(user.uid, {
          ...jobData,
          status: "processing",
          progress: 5, // Initial progress
          documentId: responseData.documentId,
          updatedAt: new Date().toISOString(),
        });

        // Start polling for status
        startPollingStatus(newJobId);
      }
    } catch (error) {
      console.error("Error processing document:", error);
      setError(error.message || "Failed to process document");
      setProcessingState("error");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!processResult || !processResult.filePath) return;

    try {
      const response = await fetch(
        `/api/process-document?file=${processResult.filePath}`
      );
      if (!response.ok) throw new Error("Failed to download file");

      // Convert response to blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = processResult.fileName;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading file:", error);
      setError("Failed to download file");
    }
  };

  // Render processing state
  const renderProcessingState = () => {
    switch (processingState) {
      case "uploading":
        return (
          <div className="text-center py-6" data-testid="processing-state-uploading">
            <div className="animate-pulse text-indigo-600 mb-4">
              <Upload className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Ingesting Document</h3>
            <p className="text-sm text-gray-500 mb-4">
              Please wait while we ingest your document
            </p>
            <Progress value={30} className="h-2 w-full max-w-md mx-auto" />
          </div>
        );

        case "processing":
          return (
            <div className="mt-6 space-y-6">
              <DocumentProcessingStatus 
                jobId={jobId}
                onComplete={(result) => {
                  // Update state when processing completes
                  setProcessingState("complete");
                  setProcessResult(result);
                  // Calculate and set stats from the result if available
                  if (result && result.stats) {
                    setClassStats({
                      Critical: result.stats.criticalClauses || 0,
                      Important: result.stats.importantClauses || 0,
                      Standard: result.stats.standardClauses || 0,
                    });
                    setCreditsUsed(result.stats.creditsUsed || 0);
                  }
                }} 
              />
              
              {partialResults && Object.keys(partialResults).length > 0 && (
                <div className="bg-white p-4 rounded-md border mt-4">
                  <Tabs defaultValue="stats" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="stats">Partial Stats</TabsTrigger>
                      <TabsTrigger value="classes">Classifications</TabsTrigger>
                    </TabsList>
                    <TabsContent value="stats">
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <Card>
                            <CardContent className="p-4 text-center">
                              <p className="text-xs text-gray-500">Total Chunks</p>
                              <p className="text-xl font-bold">
                                {processingStats.totalChunks || 0}
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-4 text-center">
                              <p className="text-xs text-gray-500">Extracted</p>
                              <p className="text-xl font-bold">
                                {processingStats.extractedClauses || 0}
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-4 text-center">
                              <p className="text-xs text-gray-500">Classified</p>
                              <p className="text-xl font-bold">
                                {processingStats.classifiedClauses || 0}
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-4 text-center">
                              <p className="text-xs text-gray-500">Variants</p>
                              <p className="text-xl font-bold">
                                {processingStats.generatedVariants || 0}
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                        
                        {currentStage && (
                          <div className="mt-4 text-sm text-center text-gray-500">
                            {currentStage}
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="classes">
                      <div className="grid grid-cols-3 gap-4">
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-xs text-gray-500">Critical</p>
                            <p className="text-xl font-bold text-red-600">
                              {classStats.Critical || 0}
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-xs text-gray-500">Important</p>
                            <p className="text-xl font-bold text-amber-600">
                              {classStats.Important || 0}
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-xs text-gray-500">Standard</p>
                            <p className="text-xl font-bold text-blue-600">
                              {classStats.Standard || 0}
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
              
              {/* Credits display */}
              <div className="mt-4 flex items-center space-x-1 text-sm text-gray-600">
                <CreditCard className="h-4 w-4 mr-1" />
                <span>
                  Credits used: <b>{creditsUsed}</b>
                </span>
              </div>
            </div>
          );

      case "complete":
        return (
          <div className="text-center py-6">
            <div className="text-green-500 mb-4">
              <CheckCircle className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {batchProcessing ? "Batch Processing Complete" : "Processing Complete"}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              {batchProcessing
                ? `Successfully processed ${Object.values(batchProgress).filter(p => p.success).length}/${batchDocuments.length} documents`
                : `Successfully generated ${processResult?.resultCount || 0} synthetic variants`}
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
            
            {batchProcessing && (
              <div className="max-w-md mx-auto mb-4 text-left bg-gray-50 p-3 rounded-md border text-sm">
                <h4 className="font-medium text-sm mb-2 text-gray-700">
                  Batch Processing Results:
                </h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Total Documents:</span>
                    <span>{batchDocuments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Successfully Processed:</span>
                    <span>{Object.values(batchProgress).filter(p => p.success).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed:</span>
                    <span>{Object.values(batchProgress).filter(p => p.completed && !p.success).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Variants Generated:</span>
                    <span>{processResult?.stats?.totalVariants || 0}</span>
                  </div>
                </div>
                
                <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                  {batchDocuments.map((doc) => {
                    const status = batchProgress[doc.id] || {};
                    return (
                      <div key={doc.id} className={`flex items-center justify-between text-xs p-1 ${status.completed && !status.success ? 'bg-red-50' : ''}`}>
                        <div className="flex items-center">
                          {status.completed ? (
                            status.success ? (
                              <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                            ) : (
                              <AlertCircle className="h-3 w-3 mr-2 text-red-500" />
                            )
                          ) : (
                            <div className="h-3 w-3 mr-2" />
                          )}
                          <span className="truncate max-w-[200px]">{doc.name}</span>
                        </div>
                        {status.success && status.result && (
                          <span>{status.result.stats?.generatedVariants || 0} variants</span>
                        )}
                        {status.completed && !status.success && (
                          <span className="text-red-600">{status.error || "Failed"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <Button onClick={handleDownload} className="flex items-center">
              <Download className="h-4 w-4 mr-2" />
              Download {outputFormat === "csv" ? "CSV" : "JSONL"}
              {batchProcessing ? " (Combined)" : ""}
            </Button>
          </div>
        );

      case "auth-error":
        return (
          <div className="text-center py-6">
            <div className="text-amber-500 mb-4">
              <AlertCircle className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Authentication Failed</h3>
            <p className="text-sm text-amber-600 mb-4">{error}</p>
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => setProcessingState("idle")}
              >
                Try Again
              </Button>
              {process.env.NODE_ENV === "development" && (
                <div className="text-xs text-gray-500 p-4 bg-gray-50 rounded-md">
                  <p className="font-semibold mb-2">Developer Note:</p>
                  <p>
                    This error occurs when the server-side API route can't
                    authenticate with Firebase. To fix this:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>
                      Configure Firebase Admin SDK in your environment variables
                    </li>
                    <li>
                      Or update your Firestore security rules to allow
                      authenticated server access
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        );

      case "error":
        return (
          <div className="text-center py-6">
            <div className="text-red-500 mb-4">
              <AlertCircle className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">Processing Failed</h3>
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button
              variant="outline"
              onClick={() => setProcessingState("idle")}
            >
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
      <div className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {file.type === "application/pdf" || (initialDocument?.fileType || "").includes("pdf") ? (
              <FileText className="h-8 w-8 text-red-500 mr-3" />
            ) : file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                 (initialDocument?.fileType || "").includes("docx") ? (
              <FileText className="h-8 w-8 text-blue-500 mr-3" />
            ) : (
              <File className="h-8 w-8 text-gray-500 mr-3" />
            )}
            <div>
              <p className="font-medium truncate max-w-[200px] sm:max-w-sm">
                {file.name || initialDocument?.fileName || "Document"}
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                <p className="text-xs text-gray-500">
                  {file?.size
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                    : initialDocument?.fileSize 
                      ? `${(initialDocument.fileSize / 1024 / 1024).toFixed(2)} MB` 
                      : "Size unknown"}
                </p>
                {initialDocument?.id && (
                  <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded-full">
                    Existing Document
                  </span>
                )}
                {useOcr && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                    OCR Enabled
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFile}
            disabled={
              loading || processingState !== "idle" || !!initialDocument
            }
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
    if (outputFormat === "openai" || outputFormat === "jsonl") {
      return (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Preview (First 5 Entries)</h3>

          {previewData.map((item, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Entry {index + 1}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">
                      Original:
                    </h4>
                    <p className="text-sm bg-gray-50 p-2 rounded">
                      {item.input}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">
                      Classification:
                    </h4>
                    <div
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold 
                      ${
                        item.classification === "Critical"
                          ? "bg-red-100 text-red-700"
                          : item.classification === "Important"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {item.classification}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-indigo-500 mb-1">
                      Synthetic Variant:
                    </h4>
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
              Download Full {outputFormat === "csv" ? "CSV" : "JSONL"} (
              {processResult?.resultCount || 0} entries)
            </Button>
          </div>
        </div>
      );
    } else {
      // Show preview for other formats
      return (
        <div className="space-y-6">
          <h3 className="text-lg font-medium">
            Preview ({outputFormat.toUpperCase()} Format)
          </h3>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Format Sample
              </CardTitle>
              <CardDescription>
                This is how your data will look in {outputFormat.toUpperCase()}{" "}
                format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-md text-xs overflow-auto">
                {outputFormat === "mistral" &&
                  `Write a clause similar to this: ${
                    previewData[0]?.input || "Example input clause"
                  } 
                  ${
                    previewData[0]?.output || "Example output clause"
                  } `}
                {outputFormat === "falcon" &&
                  `Human: Rewrite this clause: ${
                    previewData[0]?.input || "Example input clause"
                  }\n\nAssistant: ${
                    previewData[0]?.output || "Example output clause"
                  }`}
                {outputFormat === "claude" &&
                  `Human: ${
                    previewData[0]?.input || "Example input clause"
                  }\n\nAssistant: ${
                    previewData[0]?.output || "Example output clause"
                  }`}
                {outputFormat === "csv" &&
                  `"${previewData[0]?.input || "Example input clause"}","${
                    previewData[0]?.classification || "Critical"
                  }","${previewData[0]?.output || "Example output clause"}"`}
              </pre>
            </CardContent>
          </Card>

          <div className="flex justify-center mt-6">
            <Button onClick={handleDownload} className="flex items-center">
              <Download className="h-4 w-4 mr-2" />
              Download Full {outputFormat.toUpperCase()} File (
              {processResult?.resultCount || 0} entries)
            </Button>
          </div>
        </div>
      );
    }
  };

  // Add these handlers for the document splitting workflow
  const handleSplitDocument = () => {
    setShowSizeWarning(false);
    setShowSplitter(true);
  };

  const handleSplitComplete = (splitDocs) => {
    setShowSplitter(false);
    
    if (splitDocs && splitDocs.length > 0) {
      console.log("Split complete, generated documents:", splitDocs);
      
      // Set batch documents
      setBatchDocuments(splitDocs);
      
      // Show batch processing UI
      setBatchProcessing(true);
      
      // Option 1: Auto-start batch processing
      processBatch();
      
      // Option 2: Ask user to confirm batch processing
      // setShowBatchConfirmation(true);
    }
  };

  // Document size warning dialog
  const renderSizeWarningDialog = () => (
    <AlertDialog open={showSizeWarning} onOpenChange={setShowSizeWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Large Document Detected</AlertDialogTitle>
          <AlertDialogDescription>
            {documentAnalysis?.reason === 'size' && 
              `This document is ${documentAnalysis.fileSizeMB.toFixed(1)} MB in size, which exceeds our recommended limit for efficient processing.`}
            {documentAnalysis?.reason === 'pages' && 
              `This document has approximately ${documentAnalysis.estimatedPages} pages, which exceeds our recommended limit for efficient processing.`}
            {documentAnalysis?.reason === 'tokens' && 
              'This document exceeds our recommended token limit for efficient processing.'}
            
            <p className="mt-2">
              We recommend splitting it into {documentAnalysis?.recommendedBatches || 2} smaller parts for better results and faster processing.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSplitDocument}>
            Split Document
          </AlertDialogAction>
          <AlertDialogAction onClick={handleProcess}>
            Process Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Document splitter dialog
  const renderDocumentSplitterDialog = () => (
    <Dialog open={showSplitter} onOpenChange={setShowSplitter}>
      <DialogContent className="sm:max-w-[600px]">
        <DocumentSplitter 
          document={{
            ...initialDocument,
            totalPages: documentAnalysis?.estimatedPages || 0,
            fileSize: documentAnalysis?.fileSize || 0,
            name: documentAnalysis?.fileName || 'Document'
          }}
          onClose={() => setShowSplitter(false)}
          onSplitComplete={handleSplitComplete}
        />
      </DialogContent>
    </Dialog>
  );

  // Add batch processing function
  const processBatch = async () => {
    if (!batchDocuments || batchDocuments.length === 0) {
      return;
    }
    
    setBatchProcessing(true);
    setProcessingState("processing");
    
    try {
      // Start parallel processing with a concurrency limit of 3
      const concurrencyLimit = 3;
      let activeJobs = 0;
      let completedJobs = 0;
      let allResults = [];
      
      // Create a copy of batch documents to process
      const documents = [...batchDocuments];
      
      // Create a helper function that processes one document
      const processOneDocument = async (doc) => {
        try {
          console.log(`Processing batch document: ${doc.name}`);
          
          // Get auth token
          let authToken = null;
          try {
            if (user) {
              authToken = await user.getIdToken(true);
            }
          } catch (tokenError) {
            console.error("Failed to get auth token:", tokenError);
          }
          
          // Create form data for this document
          const formData = new FormData();
          formData.append('documentId', doc.id);
          formData.append('chunkSize', chunkSize);
          formData.append('overlap', overlap);
          formData.append('outputFormat', outputFormat);
          formData.append('classFilter', classFilter);
          formData.append('prioritizeImportant', prioritizeImportant);
          
          if (authToken) {
            formData.append('authToken', authToken);
          }
          
          // Generate a unique job ID for this batch item
          const batchItemJobId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          formData.append('jobId', batchItemJobId);
          
          // Process the document
          const response = await fetch("/api/process-document", {
            method: "POST",
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
            body: formData,
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process batch document');
          }
          
          // Get the result
          const result = await response.json();
          
          // Update batch progress
          setBatchProgress(prev => ({
            ...prev,
            [doc.id]: {
              completed: true,
              success: true,
              result
            }
          }));
          
          // Add to results
          allResults.push(result);
          
          // Update the combined result data
          setBatchResults(allResults);
          
          // Update progress
          completedJobs++;
          setProgress(Math.floor((completedJobs / documents.length) * 100));
          
          console.log(`Completed batch document: ${doc.name}`);
        } catch (error) {
          console.error(`Error processing batch document ${doc.name}:`, error);
          
          // Update batch progress
          setBatchProgress(prev => ({
            ...prev,
            [doc.id]: {
              completed: true,
              success: false,
              error: error.message
            }
          }));
          
          // Update progress
          completedJobs++;
          setProgress(Math.floor((completedJobs / documents.length) * 100));
        } finally {
          // Decrease active jobs count
          activeJobs--;
        }
      };
      
      // Process documents with concurrency limit
      while (documents.length > 0 || activeJobs > 0) {
        // If we have capacity and documents to process, start a new job
        if (activeJobs < concurrencyLimit && documents.length > 0) {
          const doc = documents.shift();
          activeJobs++;
          
          // Initialize progress for this document
          setBatchProgress(prev => ({
            ...prev,
            [doc.id]: {
              completed: false,
              progress: 0
            }
          }));
          
          // Process document
          processOneDocument(doc);
        } else {
          // Wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // All documents processed, set state to complete
      setProcessingState("complete");
      setProgress(100);
      
      // Create combined result data
      const combinedResult = {
        documentId: initialDocument?.id,
        resultCount: allResults.reduce((total, result) => total + (result.stats?.generatedVariants || 0), 0),
        fileName: `combined_results.${outputFormat === "csv" ? "csv" : "jsonl"}`,
        stats: {
          totalDocuments: batchDocuments.length,
          successfulDocuments: allResults.length,
          totalClauses: allResults.reduce((total, result) => total + (result.stats?.extractedClauses || 0), 0),
          totalVariants: allResults.reduce((total, result) => total + (result.stats?.generatedVariants || 0), 0)
        }
      };
      
      setProcessResult(combinedResult);
      
    } catch (error) {
      console.error("Error in batch processing:", error);
      setError(error.message || "Batch processing failed");
      setProcessingState("error");
    } finally {
      setBatchProcessing(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="document-processor">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload">
            {processingState !== "idle" && processingState !== "complete" ? "Processing" : "Upload Document"}
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            disabled={processingState !== "complete"}
          >
            Preview Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-6" forceMount={processingState !== "idle"}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>
                  {processingState === "processing" ? "Synthesizing Data" : 
                   processingState === "uploading" ? "Uploading Document" : 
                   processingState === "complete" ? "Processing Complete" : 
                   "Document Upload"}
                </CardTitle>
                <CardDescription>
                  {processingState !== "idle" 
                    ? "Your document is being processed and converted to synthetic training data"
                    : "Upload a document to generate synthetic training data"
                  }
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

              {processingState !== "idle" ? (
                renderProcessingState()
              ) : (
                <form onSubmit={prepareDocumentForProcessing} className="space-y-6">
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
                      onClick={() =>
                        setShowAdvancedSettings(!showAdvancedSettings)
                      }
                    >
                      <Settings className="h-4 w-4" />
                      {showAdvancedSettings ? "Hide" : "Show"} Advanced Settings
                    </button>

                    {showAdvancedSettings && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="chunkSize">Chunk Size</Label>
                            <Select
                              value={chunkSize.toString()}
                              onValueChange={(value) =>
                                setChunkSize(parseInt(value, 10))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select chunk size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="500">
                                  500 characters
                                </SelectItem>
                                <SelectItem value="1000">
                                  1000 characters (Default)
                                </SelectItem>
                                <SelectItem value="1500">
                                  1500 characters
                                </SelectItem>
                                <SelectItem value="2000">
                                  2000 characters
                                </SelectItem>
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
                              onValueChange={(value) =>
                                setOverlap(parseInt(value, 10))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select overlap size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">No overlap</SelectItem>
                                <SelectItem value="50">
                                  50 characters
                                </SelectItem>
                                <SelectItem value="100">
                                  100 characters (Default)
                                </SelectItem>
                                <SelectItem value="200">
                                  200 characters
                                </SelectItem>
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
                                <SelectItem value="jsonl">
                                  JSONL (Default)
                                </SelectItem>
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
                            <Label htmlFor="classFilter">
                              Classification Filter
                            </Label>
                            <Select
                              value={classFilter}
                              onValueChange={setClassFilter}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select classification filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">
                                  All Classifications
                                </SelectItem>
                                <SelectItem value="critical">
                                  Critical Only
                                </SelectItem>
                                <SelectItem value="important">
                                  Important Only
                                </SelectItem>
                                <SelectItem value="critical_important">
                                  Critical & Important
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Filter clauses by importance classification
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="useCase">Use Case</Label>
                          <Select
                            value={useCase || "rewriter-legal"}
                            onValueChange={(value) => setUseCase(value)}
                          >
                            <SelectTrigger id="useCase">
                              <SelectValue placeholder="Select use case" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rewriter-legal">Rewriter for Legal</SelectItem>
                              <SelectItem value="qa-sops" disabled className="text-gray-400">Q&A for SOPs (Coming Soon)</SelectItem>
                              <SelectItem value="math-finance" disabled className="text-gray-400">Math for Finance (Coming Soon)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500">Optimize extraction based on document content</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="prioritizeImportant"
                              checked={prioritizeImportant}
                              onCheckedChange={setPrioritizeImportant}
                            />
                            <label
                              htmlFor="prioritizeImportant"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Prioritize Important Content
                            </label>
                          </div>
                          <p className="text-xs text-gray-500 ml-6">
                            Focuses token usage on critical and important content when token limits are reached
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="useTextract"
                              checked={useTextract}
                              onCheckedChange={setUseTextract}
                            />
                            <label
                              htmlFor="useTextract"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Use Amazon Textract
                            </label>
                          </div>
                          <p className="text-xs text-gray-500 ml-6">
                            Improves text extraction quality especially for scanned documents and complex layouts
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Upload File</Label>
                    {!file && !initialDocument ? (
                      <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => document.getElementById("file-upload").click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.classList.add('bg-gray-50', 'border-indigo-300');
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.classList.remove('bg-gray-50', 'border-indigo-300');
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.classList.remove('bg-gray-50', 'border-indigo-300');
                          
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            const droppedFile = e.dataTransfer.files[0];
                            // Validate file type
                            const fileType = droppedFile.type;
                            if (
                              fileType !== "application/pdf" &&
                              fileType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
                              fileType !== "text/plain"
                            ) {
                              setError("Invalid file type. Please upload PDF, DOCX, or TXT files.");
                              return;
                            }
                            
                            // Check file size
                            if (droppedFile.size > 10 * 1024 * 1024) {
                              setError("File too large. Maximum file size is 10MB.");
                              return;
                            }
                            
                            setFile(droppedFile);
                            setError("");
                          }
                        }}
                      >
                        <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 mb-2">
                          PDF, DOCX, or TXT (Max 10MB)
                        </p>
                        <p className="text-xs text-indigo-600">
                          Supported formats: .pdf, .docx, .txt
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
                    disabled={loading || (!file && !initialDocument)}
                  >
                    {loading ? "Processing..." : "Process Document"}
                  </Button>
                </form>
              )}
            </CardContent>
            {processingState === "idle" && (
              <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
                <div className="space-y-2 text-center max-w-md">
                  <h3 className="font-medium">Multi-Step Processing Pipeline</h3>
                  <p className="text-sm text-gray-600">
                    Our AI uses multiple modular AI models to generate synthetic variants
                    that match your organization's exact language style. The
                    output is formatted for fine-tuning various AI models.
                  </p>
                </div>
              </CardFooter>
            )}
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
            <CardContent>{renderPreviewData()}</CardContent>
            <CardFooter className="border-t bg-gray-50 flex justify-center p-6">
              <div className="space-y-2 text-center max-w-md">
                <h3 className="font-medium">Using Your Data</h3>
                <p className="text-sm text-gray-600">
                  The downloaded {outputFormat.toUpperCase()} file is ready for
                  fine-tuning with OpenAI, Anthropic, or other AI platforms.
                  Each entry contains the original content, classification, and
                  a synthetic variant.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
      {renderSizeWarningDialog()}
      {renderDocumentSplitterDialog()}
    </div>
  );
});

DocumentProcessor.displayName = "DocumentProcessor";

export default DocumentProcessor;
