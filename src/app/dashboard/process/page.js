'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { ArrowLeft } from 'lucide-react';
import DocumentProcessor from '../../../components/document-processor';
import { getDocument } from '../../../lib/firestoreService';
import { useAuth } from '../../../contexts/AuthContext';
import { Spinner } from "../../../components/ui/spinner";

export default function ProcessDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingStarted, setProcessingStarted] = useState(false);
  const [error, setError] = useState("");
  
  // Use a ref to store reference to the DocumentProcessor
  const processorRef = useRef(null);
  
  // Get URL parameters
  const documentId = searchParams.get('documentId');
  const jobId = searchParams.get('jobId');
  const tempJobId = searchParams.get('tempJobId');
  const startProcessing = searchParams.get('startProcessing') === 'true';
  const useCase = searchParams.get("useCase") || "rewriter-legal";
  const outputFormat = searchParams.get("outputFormat") || "openai-jsonl";
  
  // Start API processing if directed from DocumentList
  useEffect(() => {
    const initiateProcessing = async () => {
      if (!documentId || !tempJobId || !startProcessing || processingStarted || !user) return;
      
      try {
        setProcessingStarted(true);
        
        // Get the token for the API request
        const token = await user.getIdToken();
        
        // Create form data with parameters
        const formData = new FormData();
        formData.append("documentId", documentId);
        formData.append("chunkSize", "1000");
        formData.append("overlap", "100");
        formData.append("outputFormat", outputFormat);
        formData.append("tempJobId", tempJobId);
        formData.append("useCase", useCase);
        
        // Make the API request in the background
        const response = await fetch("/api/process-document", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
        
        // Process the response
        if (response.ok) {
          const data = await response.json();
          console.log("Processing started:", data);
          
          // Update URL with the real jobId if available
          if (data.jobId) {
            // Replace URL without refreshing the page
            window.history.replaceState(
              null, 
              '', 
              `/dashboard/process?jobId=${data.jobId}&documentId=${documentId}`
            );
          }
        } else {
          const errorData = await response.json();
          console.error("Error processing document:", errorData.error || "Unknown error");
          
          // Even if there's an error, stay on this page with the processing UI
        }
      } catch (error) {
        console.error("Error initiating document processing:", error);
      }
    };
    
    initiateProcessing();
  }, [user, documentId, tempJobId, startProcessing, processingStarted, router, outputFormat, useCase]);
  
  // Fetch document data
  useEffect(() => {
    async function fetchDocument() {
      console.log("Fetching document data...", { documentId, user: !!user, useCase, outputFormat });
      
      if (documentId && user) {
        try {
          setLoading(true);
          setError("");
          
          console.log("Making Firestore request for document:", documentId);
          const fetchedDoc = await getDocument(documentId);
          console.log("Document data received:", fetchedDoc ? "success" : "not found");
          
          // Verify this document belongs to the current user
          if (fetchedDoc && fetchedDoc.userId === user.uid) {
            // Add use case and output format to document data
            fetchedDoc.useCase = useCase;
            fetchedDoc.outputFormat = outputFormat;
            
            console.log("Setting document state with:", {
              name: fetchedDoc.name || fetchedDoc.fileName,
              useCase,
              outputFormat
            });
            
            setDocument(fetchedDoc);
          } else {
            // If not found or not owned by this user, go back to dashboard
            console.log("Document not found or not owned by current user, redirecting to dashboard");
            router.push('/dashboard');
          }
        } catch (error) {
          console.error('Error fetching document:', error);
          setError("Failed to load document");
        } finally {
          setLoading(false);
          console.log("Document loading complete, loading state set to false");
        }
      } else {
        console.log("Missing required parameters:", { documentId, user: !!user });
        setLoading(false);
      }
    }
    
    fetchDocument();
  }, [documentId, user, router, useCase, outputFormat]);
  
  // Automatically start processing when document is loaded
  useEffect(() => {
    // Only auto-start if we have a document and weren't triggered by the API flow
    if (document && processorRef.current && !processingStarted && !tempJobId) {
      console.log("Auto-starting document processing");
      // Small delay to ensure the component is fully mounted
      const timer = setTimeout(() => {
        if (processorRef.current && typeof processorRef.current.handleProcess === 'function') {
          processorRef.current.handleProcess();
          setProcessingStarted(true);
        } else {
          console.error("DocumentProcessor reference or handleProcess method not available");
        }
      }, 1000); // Increased delay to ensure component is ready
      
      return () => clearTimeout(timer);
    }
  }, [document, processingStarted, tempJobId]);
  
  // Handle document processing
  const handleProcess = async () => {
    if (processorRef.current && typeof processorRef.current.handleProcess === 'function') {
      processorRef.current.handleProcess();
      setProcessingStarted(true);
    } else {
      console.error("DocumentProcessor reference or handleProcess method not available");
    }
  };
  
  // Auto start processing via the processor's internal state if we have a document and were triggered via API
  useEffect(() => {
    if (document && processorRef.current && startProcessing && !processingStarted && tempJobId) {
      console.log("Setting processor to processing state via internal API");
      // Use setProcessingState instead of handleProcess to avoid duplicate API calls
      const timer = setTimeout(() => {
        if (processorRef.current && typeof processorRef.current.setProcessingState === 'function') {
          processorRef.current.setProcessingState('processing');
          setProcessingStarted(true);
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [document, processorRef.current, startProcessing, processingStarted, tempJobId]);
  
  // Add a function to load the test script
  useEffect(() => {
    // Check if we should run tests (you can pass a test=true query param to enable)
    const runTests = searchParams.get('test') === 'true';
    
    if (runTests) {
      // Create and append the test script dynamically
      const script = document.createElement('script');
      script.src = '/tests/documentProcessor.test.js';
      script.type = 'module';
      script.async = true;
      document.body.appendChild(script);
      
      console.log('Test script loaded');
      
      return () => {
        // Clean up
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    }
  }, [searchParams]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="h-8 w-8 text-blue-600" />
        <span className="ml-2">Loading document...</span>
      </div>
    );
  }

  // If document wasn't found but loading is complete, show an error
  if (!document && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <div className="text-red-600 text-xl">
          Document could not be loaded
        </div>
        <Button onClick={() => router.push('/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

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
          Back to Dashboard
        </Button>
        <h1 className="text-3xl font-bold">Process Document</h1>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Debugging info - only shown when needed */}
      {searchParams.get('debug') === 'true' && (
        <div className="bg-gray-100 p-4 rounded mb-4 text-xs font-mono">
          <h3 className="font-bold mb-2">Debug Info:</h3>
          <ul className="space-y-1">
            <li>Document ID: {documentId || 'Not set'}</li>
            <li>Use Case: {useCase}</li>
            <li>Output Format: {outputFormat}</li>
            <li>Document Loaded: {document ? 'Yes' : 'No'}</li>
            <li>Processing Started: {processingStarted ? 'Yes' : 'No'}</li>
            <li>Auto Start: {startProcessing ? 'Yes' : 'No'}</li>
            <li>Document Name: {document?.name || document?.fileName || 'N/A'}</li>
          </ul>
        </div>
      )}
      
      <DocumentProcessor 
        ref={processorRef}
        initialDocument={document} 
        useCase={useCase}
        outputFormat={outputFormat}
        autoShowProcessing={true} 
      />
      
      {document && !processingStarted && (
        <div className="mt-6">
          <button
            onClick={handleProcess}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Start Processing
          </button>
        </div>
      )}
    </div>
  );
}