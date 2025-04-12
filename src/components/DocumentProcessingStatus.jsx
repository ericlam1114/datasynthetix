import React, { useEffect, useState } from 'react';

/**
 * Component to display the status of a document processing job
 * Shows progress, memory usage, and queue position
 */
export default function DocumentProcessingStatus({ jobId, onComplete }) {
  const [status, setStatus] = useState({
    status: 'initializing',
    progress: 0,
    memoryStatus: { usagePercent: 0 },
    queuePosition: null,
    queueLength: null,
    error: null
  });
  
  const [pollingInterval, setPollingInterval] = useState(2000);
  
  useEffect(() => {
    if (!jobId) return;
    
    let timeoutId;
    let isMounted = true;
    
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/process-document?jobId=${jobId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch status: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!isMounted) return;
        
        setStatus(data);
        
        // Adjust polling frequency based on status
        if (data.status === 'completed' || data.status === 'failed') {
          if (data.status === 'completed' && onComplete) {
            onComplete(data.result);
          }
          
          // Stop polling when done
          return;
        } else if (data.status === 'queued') {
          // Poll slower if queued
          setPollingInterval(5000);
        } else if (data.status === 'processing') {
          // Poll faster during processing
          setPollingInterval(1500);
        }
        
        // Schedule next poll
        timeoutId = setTimeout(fetchStatus, pollingInterval);
      } catch (error) {
        console.error('Error fetching job status:', error);
        if (isMounted) {
          setStatus(prev => ({
            ...prev,
            error: error.message
          }));
        }
        
        // Retry on error, but with a delay
        timeoutId = setTimeout(fetchStatus, 5000);
      }
    };
    
    // Initial fetch
    fetchStatus();
    
    // Clean up on unmount
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [jobId, pollingInterval, onComplete]);
  
  // Helper to format memory usage
  const formatMemoryUsage = (percent) => {
    if (!percent && percent !== 0) return 'Unknown';
    return `${Math.round(percent)}%`;
  };
  
  // Helper to determine status indicator color
  const getStatusColor = () => {
    switch (status.status) {
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'processing': return 'bg-blue-500';
      case 'queued': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };
  
  // Format queue position message
  const getQueueMessage = () => {
    if (status.status !== 'queued' || !status.queuePosition) return null;
    return `Queue position: ${status.queuePosition} of ${status.queueLength || '?'}`;
  };
  
  return (
    <div className="rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <div className={`h-3 w-3 rounded-full mr-2 ${getStatusColor()}`}></div>
          <h3 className="text-lg font-medium capitalize">
            {status.status}
          </h3>
        </div>
        
        {status.memoryStatus && (
          <div className="text-sm text-gray-500 flex items-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 mr-1" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" 
              />
            </svg>
            Memory: {formatMemoryUsage(status.memoryStatus.usagePercent)}
          </div>
        )}
      </div>
      
      {status.progress !== undefined && (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span>Progress</span>
            <span>{Math.round(status.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${status.progress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {getQueueMessage() && (
        <div className="text-sm text-yellow-600 mb-2">
          {getQueueMessage()}
        </div>
      )}
      
      {status.currentOperation && (
        <div className="text-sm text-gray-500 mb-2">
          {status.currentOperation}
        </div>
      )}
      
      {status.estimatedTimeRemaining && (
        <div className="text-sm text-gray-500">
          Estimated time remaining: {Math.round(status.estimatedTimeRemaining / 1000)}s
        </div>
      )}
      
      {status.error && (
        <div className="mt-2 text-sm text-red-600">
          Error: {status.error}
        </div>
      )}
      
      {(status.status === 'completed' && status.processingTimeMs) && (
        <div className="mt-2 text-sm text-green-600">
          Completed in {(status.processingTimeMs / 1000).toFixed(2)} seconds
        </div>
      )}
    </div>
  );
} 