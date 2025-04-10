// In src/app/dashboard/process/page.js
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  
  // Get document ID from URL params
  const documentId = searchParams.get('documentId');
  
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
        <DocumentProcessor initialDocument={document} />
      )}
    </div>
  );
}