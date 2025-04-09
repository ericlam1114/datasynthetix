'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import DocumentProcessor from '@/components/document-processor';

export default function ProcessDocumentPage() {
  const router = useRouter();
  
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
      
      <DocumentProcessor />
    </div>
  );
}