import React from 'react';
import { AlertCircle, XCircle, RefreshCw, Terminal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

/**
 * Component to display Firebase-related errors with potential solutions
 */
export function FirebaseError({ error, onRetry, withSolutions = true }) {
  const errorMessage = error?.message || 'An unknown error occurred';
  const isCorsError = errorMessage.includes('CORS');
  
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4 mt-1" />
      <div className="w-full">
        <AlertTitle className="mb-2 font-medium">
          {isCorsError ? 'Cross-Origin (CORS) Error' : 'Error'}
        </AlertTitle>
        <AlertDescription>
          <p className="mb-4">{errorMessage}</p>
          
          {withSolutions && isCorsError && (
            <Accordion type="single" collapsible className="bg-white bg-opacity-20 rounded p-2">
              <AccordionItem value="solution">
                <AccordionTrigger className="text-sm font-medium">
                  How to fix this
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm">
                    <p>This is a CORS configuration issue with Firebase Storage.</p>
                    <p className="font-medium">For developers:</p>
                    <div className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-auto">
                      <p># Install Firebase CLI tools</p>
                      <p>npm install -g firebase-tools</p>
                      <p><br/># Log in to Firebase</p>
                      <p>firebase login</p>
                      <p><br/># Create cors.json file:</p>
                      <p>{`[{
  "origin": ["http://localhost:3000", "https://yourdomain.com"],
  "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
  "maxAgeSeconds": 3600
}]`}</p>
                      <p><br/># Set CORS configuration:</p>
                      <p>gsutil cors set cors.json gs://YOUR-BUCKET-NAME</p>
                    </div>
                    <p>For a temporary workaround, try using the app without file uploads.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
          
          {onRetry && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRetry} 
              className="mt-3"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Try Again
            </Button>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}

/**
 * Component to display offline status message
 */
export function OfflineWarning({ onRetry }) {
  return (
    <Alert className="mb-4 bg-amber-50 border-amber-200 text-amber-800">
      <AlertCircle className="h-4 w-4 text-amber-700" />
      <div className="w-full">
        <AlertTitle className="font-medium">
          You're Offline
        </AlertTitle>
        <AlertDescription>
          <p className="mb-3">Some features may not work properly while you're offline.</p>
          {onRetry && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRetry} 
              className="text-amber-900 border-amber-300 hover:bg-amber-100"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Check Connection
            </Button>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}

export default FirebaseError; 