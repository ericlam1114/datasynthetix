'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserProcessingJobs } from '../../lib/firestoreService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';
import Link from 'next/link';

export default function ProcessingJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [jobUpdates, setJobUpdates] = useState({});

  // Check if there are any active jobs that need polling
  const checkForActiveJobs = (jobsArray) => {
    return jobsArray.some(job => 
      job.status !== 'completed' && 
      job.status !== 'failed' && 
      job.status !== 'cancelled'
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
    if (user && (jobs.length === 0 || checkForActiveJobs(jobs))) {
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
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
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
              <div key={job.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-blue-500 mt-1" />
                    <div>
                      <h3 className="font-medium">{job.fileName || 'Unnamed Document'}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(job.status, jobUpdates[job.id])}
                        {job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled' && (
                          <span className="text-xs text-muted-foreground">
                            Last progress: {jobUpdates[job.id] 
                              ? getTimeSince(jobUpdates[job.id].lastStatusChange)
                              : 'N/A'
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {job.status === 'completed' && job.result && (
                      <Link href={`/documents/${job.id}`}>
                        <Button size="sm" variant="outline">
                          <FileText className="h-4 w-4 mr-1" /> View
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                
                {job.status === 'processing' || job.status === 'uploading' ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Progress</span>
                      <span>{Math.round(job.progress || 0)}%</span>
                    </div>
                    <Progress value={job.progress || 0} className="h-2" />
                  </div>
                ) : job.status === 'failed' ? (
                  <div className="mt-2 text-sm text-red-600">
                    {job.error || 'An error occurred during processing'}
                  </div>
                ) : null}
                
                <div className="mt-2 text-xs text-gray-500">
                  Job ID: {job.id}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 