'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserProcessingJobs, cancelProcessingJob } from '../../lib/firestoreService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  Download, 
  X,
  Ban
} from 'lucide-react';
import Link from 'next/link';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";

export default function ProcessingJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [jobUpdates, setJobUpdates] = useState({});
  const [cancellingJob, setCancellingJob] = useState(null);
  const { toast } = useToast();

  // Check if there are any active jobs that need polling
  const checkForActiveJobs = (jobsArray) => {
    return jobsArray.some(job => 
      job.status === 'processing' || 
      job.status === 'uploading'
    );
  };

  // Load jobs from Firestore
  const loadJobs = async (showLoading = true) => {
    if (!user) return;
    
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      console.log('Fetching processing jobs...');
      const jobsData = await getUserProcessingJobs(user.uid);
      console.log(`Received ${jobsData.length} processing jobs`);
      
      // Update job statuses
      const updatedJobUpdates = { ...jobUpdates };
      jobsData.forEach(job => {
        // If this is the first time we're seeing this job or the status has changed
        if (!updatedJobUpdates[job.id] || updatedJobUpdates[job.id].status !== job.status) {
          updatedJobUpdates[job.id] = {
            lastStatusChange: new Date(),
            status: job.status,
            progress: job.progress || 0
          };
        }
        // Only update the last progress change if progress has actually changed
        else if (updatedJobUpdates[job.id].progress !== (job.progress || 0)) {
          updatedJobUpdates[job.id] = {
            ...updatedJobUpdates[job.id],
            lastStatusChange: new Date(),
            progress: job.progress || 0
          };
        }
      });
      
      setJobUpdates(updatedJobUpdates);
      setJobs(jobsData);
      setError('');
    } catch (err) {
      console.error('Error loading jobs:', err);
      setError('Failed to load processing jobs.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setLastRefreshed(new Date());
    }
  };

  // Cancel a job
  const handleCancelJob = async (job) => {
    if (!user) return;
    
    setCancellingJob(job.id);
    
    try {
      console.log(`Attempting to cancel job: ${job.id} (jobId: ${job.jobId})`);
      await cancelProcessingJob(user.uid, job.jobId);
      
      toast({
        title: "Job Deleted",
        description: `Successfully removed the processing job for ${job.fileName || "document"} from the system`,
        variant: "default",
      });
      
      // Refresh jobs list
      loadJobs();
    } catch (err) {
      console.error('Error cancelling job:', err);
      
      const errorMessage = err.message || "Unknown error";
      
      toast({
        title: "Error Cancelling Job",
        description: `Failed to cancel job: ${errorMessage}. Please try again or contact support if the issue persists.`,
        variant: "destructive",
      });
      
      // Optionally, try to refresh the job list to see if the job status changed anyway
      setTimeout(() => loadJobs(), 2000);
    } finally {
      setCancellingJob(null);
    }
  };

  // Initial load of jobs
  useEffect(() => {
    if (user) {
      loadJobs();
    } else {
      setJobs([]);
      setLoading(false);
    }
  }, [user]);

  // Set up polling interval for active jobs
  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only set up interval if we have a user and active jobs
    if (user && checkForActiveJobs(jobs)) {
      console.log('Setting up refresh interval for jobs');
      intervalRef.current = setInterval(() => {
        loadJobs(false);
      }, 10000); // Refresh every 10 seconds
    }

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        console.log('Cleaning up refresh interval');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, jobs]);

  // Helper to format time since last update
  const getTimeSince = (date) => {
    if (!date) return 'N/A';
    
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    return `${Math.floor(seconds / 3600)} hours ago`;
  };

  // Function to get status badge with appropriate color
  const getStatusBadge = (status, jobUpdate) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    
    const isStalled = jobUpdate && 
      (status === 'processing' || status === 'uploading') && 
      jobUpdate.lastStatusChange && 
      (new Date() - jobUpdate.lastStatusChange > 30000); // Stalled if no updates for 30 seconds
    
    switch(status) {
      case 'uploading':
        return isStalled 
          ? <Badge variant="outline" className="bg-amber-100 text-amber-800">Uploading (Stalled)</Badge>
          : <Badge variant="outline" className="bg-blue-100 text-blue-800">Uploading</Badge>;
      case 'processing':
        return isStalled 
          ? <Badge variant="outline" className="bg-amber-100 text-amber-800">Processing (Stalled)</Badge>
          : <Badge variant="outline" className="bg-blue-100 text-blue-800">Processing</Badge>;
      case 'complete':
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
      case 'error':
        return <Badge variant="outline" className="bg-red-100 text-red-800">Failed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Processing Jobs</CardTitle>
            <CardDescription>
              Track the status of your document processing jobs
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Last updated: {getTimeSince(lastRefreshed)}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => loadJobs(true)}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-2 bg-red-50 text-red-700 rounded flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No processing jobs found
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <Link href={`/dashboard/process?documentId=${job.documentId || job.id}`} className="flex items-start gap-3 flex-grow">
                    <FileText className="h-5 w-5 text-blue-500 mt-1 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-medium">{job.fileName || 'Unnamed Document'}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {getStatusBadge(job.status, jobUpdates[job.id])}
                        {(job.status === 'processing' || job.status === 'uploading') && (
                          <span className="text-xs text-muted-foreground">
                            Last progress: {jobUpdates[job.id] 
                              ? getTimeSince(jobUpdates[job.id].lastStatusChange)
                              : 'N/A'
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  
                  <div className="flex gap-2">
                    {(job.status === 'processing' || job.status === 'uploading') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Ban className="h-4 w-4 mr-1" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Processing Job</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this processing job? This action cannot be undone, and any progress will be lost.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>No, keep this job</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleCancelJob(job)}
                              disabled={cancellingJob === job.id}
                            >
                              {cancellingJob === job.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>Yes, delete job</>
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    <Link href={`/dashboard/process?documentId=${job.documentId || job.id}`}>
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4 mr-1" /> View
                      </Button>
                    </Link>
                  </div>
                </div>
                
                {(job.status === 'processing' || job.status === 'uploading') ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Progress</span>
                      <span>{Math.round(job.progress || 0)}%</span>
                    </div>
                    <Progress value={job.progress || 0} className="h-2" />
                  </div>
                ) : (job.status === 'failed' || job.status === 'error') ? (
                  <div className="mt-2 text-sm text-red-600">
                    {job.errorMessage || job.error || 'An error occurred during processing'}
                  </div>
                ) : null}
                
                <div className="mt-2 text-xs text-gray-500">
                  Job ID: {job.jobId || job.id}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}