'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { 
  MoreHorizontal,
  FileText, 
  Trash2, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

export default function DocumentManagementPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteInProgress, setDeleteInProgress] = useState({});
  const [cancelInProgress, setCancelInProgress] = useState({});
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    documentId: null,
    documentName: '',
    withDatasets: false
  });

  // Load documents and active jobs
  const loadDocuments = async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/document-management?userId=${user.uid}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      
      const data = await response.json();
      setDocuments(data.documents || []);
      setActiveJobs(data.activeJobs || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your documents. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load documents when user is available
  useEffect(() => {
    if (user?.uid) {
      loadDocuments();
    }
  }, [user]);

  // Poll for active jobs status
  useEffect(() => {
    let interval;
    
    if (activeJobs.length > 0 && user?.uid) {
      interval = setInterval(() => {
        loadDocuments();
      }, 5000); // Poll every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeJobs, user]);

  // Handle document deletion
  const handleDeleteDocument = async (documentId, withDatasets = false) => {
    if (!user?.uid) return;
    
    setDeleteInProgress(prev => ({ ...prev, [documentId]: true }));
    
    try {
      const response = await fetch(
        `/api/document-management?documentId=${documentId}&userId=${user.uid}&includeDatasets=${withDatasets}`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }
      
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
      
      // Refresh documents list
      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive'
      });
    } finally {
      setDeleteInProgress(prev => ({ ...prev, [documentId]: false }));
      setConfirmDelete({
        isOpen: false,
        documentId: null,
        documentName: '',
        withDatasets: false
      });
    }
  };

  // Handle job cancellation
  const handleCancelJob = async (jobId) => {
    if (!user?.uid) return;
    
    setCancelInProgress(prev => ({ ...prev, [jobId]: true }));
    
    try {
      const response = await fetch('/api/document-management', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          userId: user.uid,
          action: 'cancel'
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel job');
      }
      
      toast({
        title: 'Success',
        description: 'Job cancelled successfully',
      });
      
      // Refresh jobs list
      loadDocuments();
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel job',
        variant: 'destructive'
      });
    } finally {
      setCancelInProgress(prev => ({ ...prev, [jobId]: false }));
    }
  };

  // Status badge component
  const StatusBadge = ({ status }) => {
    const statusConfig = {
      pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3 mr-1" /> },
      processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" /> },
      completed: { label: 'Completed', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
      cancelled: { label: 'Cancelled', variant: 'secondary', icon: <XCircle className="h-3 w-3 mr-1" /> },
      failed: { label: 'Failed', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3 mr-1" /> },
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    
    return (
      <Badge variant={config.variant} className="flex items-center">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Get document time display
  const getTimeDisplay = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p>Please sign in to access your documents</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Document Management</h1>
      
      <Tabs defaultValue="documents">
        <TabsList className="mb-6">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="jobs" className="relative">
            Active Jobs
            {activeJobs.length > 0 && (
              <Badge variant="destructive" className="ml-2">{activeJobs.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Your Documents</CardTitle>
                <Button size="sm" variant="outline" onClick={loadDocuments}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
              <CardDescription>
                Manage your uploaded documents and generated datasets
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-12 w-12 rounded-md" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No documents found</h3>
                  <p className="text-muted-foreground mt-2">
                    Upload a document to get started
                  </p>
                  <Link href="/upload">
                    <Button className="mt-4">Upload Document</Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of your documents</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.fileName || 'Unnamed document'}
                        </TableCell>
                        <TableCell>{doc.fileType || 'Unknown'}</TableCell>
                        <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                        <TableCell>{getTimeDisplay(doc.createdAt)}</TableCell>
                        <TableCell>
                          <StatusBadge status={doc.status || 'completed'} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              
                              {doc.resultId && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/results/${doc.resultId}`}>
                                    View Results
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem
                                onClick={() => setConfirmDelete({
                                  isOpen: true,
                                  documentId: doc.id,
                                  documentName: doc.fileName || 'this document',
                                  withDatasets: false
                                })}
                                className="text-destructive"
                              >
                                Delete Document
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem
                                onClick={() => setConfirmDelete({
                                  isOpen: true,
                                  documentId: doc.id,
                                  documentName: doc.fileName || 'this document',
                                  withDatasets: true
                                })}
                                className="text-destructive"
                              >
                                Delete Document & Datasets
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Active Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Active Jobs</CardTitle>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={loadDocuments}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <CardDescription>
                Monitor and manage your active document processing jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-12 w-12 rounded-md" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No active jobs</h3>
                  <p className="text-muted-foreground mt-2">
                    All document processing jobs are complete
                  </p>
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of your active jobs</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">
                          {job.documentName || job.documentId || 'Unknown document'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-primary h-full" 
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground mt-1 inline-block">
                            {job.progress || 0}%
                          </span>
                        </TableCell>
                        <TableCell>{getTimeDisplay(job.createdAt)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {job.statusMessage || 'Processing...'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            disabled={cancelInProgress[job.id]}
                          >
                            {cancelInProgress[job.id] ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-2" />
                            )}
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={confirmDelete.isOpen} 
        onOpenChange={(open) => !open && setConfirmDelete(prev => ({ ...prev, isOpen: false }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {confirmDelete.documentName}
              {confirmDelete.withDatasets ? ' and all associated datasets' : ''}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteDocument(confirmDelete.documentId, confirmDelete.withDatasets)}
              disabled={deleteInProgress[confirmDelete.documentId]}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteInProgress[confirmDelete.documentId] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 