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
  const domainType = searchParams.get("domainType") || "general";
  
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
        formData.append("outputFormat", "jsonl");
        formData.append("tempJobId", tempJobId);
        
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
  }, [user, documentId, tempJobId, startProcessing, processingStarted, router]);
  
  // Fetch document data
  useEffect(() => {
    async function fetchDocument() {
      if (documentId && user) {
        try {
          setLoading(true);
          setError("");
          
          const fetchedDoc = await getDocument(documentId);
          
          // Verify this document belongs to the current user
          if (fetchedDoc && fetchedDoc.userId === user.uid) {
            // Add domain type to document data
            fetchedDoc.domainType = domainType;
            
            setDocument(fetchedDoc);
          } else {
            // If not found or not owned by this user, go back to dashboard
            router.push('/dashboard');
          }
        } catch (error) {
          console.error('Error fetching document:', error);
          setError("Failed to load document");
        } finally {
          setLoading(false);
        }
      }
      
      fetchDocument();
    }
    
    fetchDocument();
  }, [documentId, user, router, domainType]);
  
  // Handle document processing
  const handleProcess = async () => {
    if (processorRef.current) {
      processorRef.current.handleProcess();
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="h-8 w-8 text-blue-600" />
        <span className="ml-2">Loading document...</span>
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
      
      <DocumentProcessor 
        ref={processorRef}
        initialDocument={document} 
        domainType={domainType}
        autoShowProcessing={!!document} 
      />
      
      {document && (
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