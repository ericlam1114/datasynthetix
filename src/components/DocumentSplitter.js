"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "./ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Scissors, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

// DocumentSplitter component to handle splitting large PDFs
export default function DocumentSplitter({ 
  document, 
  onClose, 
  onSplitComplete 
}) {
  const { user } = useAuth();
  const [numParts, setNumParts] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [splitResults, setSplitResults] = useState(null);
  
  // Calculate pages per part
  const pagesPerPart = document?.totalPages ? Math.ceil(document.totalPages / numParts) : 0;
  
  // Handle slider change
  const handleSliderChange = (value) => {
    if (Array.isArray(value)) {
      setNumParts(value[0]);
    } else {
      setNumParts(value);
    }
  };
  
  // Split the document into parts
  const handleSplit = async () => {
    setIsLoading(true);
    setError("");
    setProgress(10);
    
    try {
      // Create form data for the API call
      const formData = new FormData();
      formData.append('documentId', document.id);
      formData.append('numParts', numParts);
      formData.append('userId', user.uid);
      
      // Authentication
      const authToken = await user.getIdToken(true);
      
      setProgress(30);
      
      // Send to server for processing
      const response = await fetch('/api/split-document', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });
      
      setProgress(70);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to split document');
      }
      
      const result = await response.json();
      
      setProgress(100);
      setSplitResults(result);
      
      // Notify parent component of successful split
      if (onSplitComplete && result.parts) {
        onSplitComplete(result.parts);
      }
      
    } catch (error) {
      console.error('Error splitting document:', error);
      setError(error.message || 'An error occurred during document splitting');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">Split Document</CardTitle>
        <CardDescription>
          Split "{document?.name}" into smaller parts for better processing
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="h-10 w-10 text-indigo-600 mr-3" />
            <div>
              <h3 className="font-medium">{document?.name}</h3>
              <p className="text-sm text-gray-500">
                {document?.totalPages || "Unknown"} pages • 
                {document?.fileSize 
                  ? ` ${(document.fileSize / (1024 * 1024)).toFixed(2)} MB`
                  : " Size unknown"}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Large document detected</p>
            <p>We recommend splitting this document into multiple parts for better processing results.</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Number of parts: {numParts}
            </label>
            <Slider
              value={[numParts]}
              min={2}
              max={10}
              step={1}
              onValueChange={handleSliderChange}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>2</span>
              <span>6</span>
              <span>10</span>
            </div>
          </div>
          
          <div className="bg-gray-50 p-3 rounded-md border space-y-2">
            <h4 className="text-sm font-medium">Split Preview</h4>
            <div className="text-sm">
              <p>Each part will contain approximately {pagesPerPart} pages</p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {Array.from({ length: numParts }).map((_, i) => (
                  <div 
                    key={i} 
                    className="bg-indigo-100 h-2 rounded"
                    style={{ 
                      opacity: 0.5 + (0.5 / numParts * (numParts - i)) 
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {isLoading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Splitting document...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
        
        {error && (
          <div className="text-sm text-red-600 p-2 bg-red-50 rounded-md">
            {error}
          </div>
        )}
        
        {splitResults && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <h4 className="text-sm font-medium text-green-800">Split complete!</h4>
            <p className="text-sm text-green-700">
              Document successfully split into {splitResults.parts.length} parts
            </p>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSplit} 
          disabled={isLoading || splitResults !== null}
          className="flex items-center"
        >
          {isLoading ? (
            "Processing..."
          ) : (
            <>
              <Scissors className="h-4 w-4 mr-2" />
              Split Document
            </>
          )}
        </Button>
      </CardFooter>
    </div>
  );
} 