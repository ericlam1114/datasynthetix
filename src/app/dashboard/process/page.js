'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { ArrowLeft } from 'lucide-react';
import DocumentProcessor from '../../../components/document-processor';
import { getDocument } from '../../../lib/firestoreService';
import { useAuth } from '../../../contexts/AuthContext';

export default function ProcessDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingStarted, setProcessingStarted] = useState(false);
  
  // Use a ref to store reference to the DocumentProcessor
  const processorRef = useRef(null);
  
  // Get URL parameters
  const documentId = searchParams.get('documentId');
  const jobId = searchParams.get('jobId');
  const tempJobId = searchParams.get('tempJobId');
  const startProcessing = searchParams.get('startProcessing') === 'true';
  
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
          const fetchedDoc = await getDocument(documentId);
          
          // Verify this document belongs to the current user
          if (fetchedDoc && fetchedDoc.userId === user.uid) {
            setDocument(fetchedDoc);
          } else {
            // If not found or not owned by this user, go back to dashboard
            router.push('/dashboard');
          }
        } catch (error) {
          console.error('Error fetching document:', error);
        }
      }
      
      setLoading(false);
    }
    
    fetchDocument();
  }, [documentId, user, router]);
  
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
      
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <DocumentProcessor 
          initialDocument={document} 
          ref={processorRef}
          initialJobId={jobId || tempJobId}
          autoShowProcessing={!!(jobId || tempJobId)}
        />
      )}
    </div>
  );
}