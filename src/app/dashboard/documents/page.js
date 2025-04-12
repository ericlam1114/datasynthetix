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
  RefreshCw,
  Trash,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
  Users
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function DocumentManagementPage() {
  const { user, getIdToken } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteInProgress, setDeleteInProgress] = useState({});
  const [cancelInProgress, setCancelInProgress] = useState({});
  const [restoreInProgress, setRestoreInProgress] = useState({});
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    documentId: null,
    documentName: '',
    withDatasets: false,
    permanent: false
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 1
  });
  const [viewMode, setViewMode] = useState('active'); // 'active', 'trash', 'all'

  // Load documents and active jobs
  const loadDocuments = async (page = pagination.currentPage, pageSize = pagination.pageSize) => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    try {
      // Get the auth token for secured API calls
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Build query parameters
      const includeDeleted = viewMode === 'trash' || viewMode === 'all';
      const queryParams = new URLSearchParams({
        page,
        pageSize,
        includeDeleted: includeDeleted.toString()
      });
      
      const response = await fetch(`/api/document-management?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch documents');
      }
      
      const data = await response.json();
      
      // Filter documents based on view mode
      let filteredDocuments = data.documents || [];
      if (viewMode === 'active') {
        filteredDocuments = filteredDocuments.filter(doc => !doc.isDeleted);
      } else if (viewMode === 'trash') {
        filteredDocuments = filteredDocuments.filter(doc => doc.isDeleted && !doc.isPendingPermanentDeletion);
      }
      
      setDocuments(filteredDocuments);
      setActiveJobs(data.activeJobs || []);
      setPagination(data.pagination || {
        currentPage: page,
        pageSize,
        totalCount: filteredDocuments.length,
        totalPages: Math.ceil(filteredDocuments.length / pageSize)
      });
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load your documents. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load documents when user is available or view mode changes
  useEffect(() => {
    if (user?.uid) {
      loadDocuments(1, pagination.pageSize); // Reset to first page on view mode change
    }
  }, [user, viewMode]);

  // Poll for active jobs status
  useEffect(() => {
    let interval;
    
    if (activeJobs.length > 0 && user?.uid) {
      interval = setInterval(() => {
        // Only re-fetch if we're on the active view
        if (viewMode === 'active') {
          loadDocuments(pagination.currentPage, pagination.pageSize);
        }
      }, 5000); // Poll every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeJobs, user, viewMode, pagination.currentPage, pagination.pageSize]);

  // Handle document deletion
  const handleDeleteDocument = async (documentId, withDatasets = false, permanent = false) => {
    if (!user?.uid) return;
    
    setDeleteInProgress(prev => ({ ...prev, [documentId]: true }));
    
    try {
      // Get the auth token for secured API calls
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        documentId,
        includeDatasets: withDatasets.toString(),
        permanent: permanent.toString()
      });
      
      const response = await fetch(`/api/document-management?${queryParams.toString()}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }
      
      const data = await response.json();
      
      toast({
        title: 'Success',
        description: permanent
          ? 'Document permanently deleted'
          : 'Document moved to trash',
      });
      
      // Refresh documents list
      loadDocuments(pagination.currentPage, pagination.pageSize);
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
        withDatasets: false,
        permanent: false
      });
    }
  };

  // Handle job cancellation
  const handleCancelJob = async (jobId) => {
    if (!user?.uid) return;
    
    setCancelInProgress(prev => ({ ...prev, [jobId]: true }));
    
    try {
      // Get the auth token for secured API calls
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch('/api/document-management', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId,
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
      loadDocuments(pagination.currentPage, pagination.pageSize);
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
  
  // Handle document restoration
  const handleRestoreDocument = async (documentId) => {
    if (!user?.uid) return;
    
    setRestoreInProgress(prev => ({ ...prev, [documentId]: true }));
    
    try {
      // Get the auth token for secured API calls
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch('/api/document-management', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          documentId,
          action: 'restore'
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restore document');
      }
      
      toast({
        title: 'Success',
        description: 'Document restored successfully',
      });
      
      // Refresh documents list
      loadDocuments(pagination.currentPage, pagination.pageSize);
    } catch (error) {
      console.error('Error restoring document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to restore document',
        variant: 'destructive'
      });
    } finally {
      setRestoreInProgress(prev => ({ ...prev, [documentId]: false }));
    }
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    loadDocuments(newPage, pagination.pageSize);
  };
  
  // Handle page size change
  const handlePageSizeChange = (newSize) => {
    const size = parseInt(newSize, 10);
    loadDocuments(1, size); // Reset to first page when changing page size
  };

  // Status badge component
  const StatusBadge = ({ status }) => {
    const statusConfig = {
      pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3 mr-1" /> },
      processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" /> },
      completed: { label: 'Completed', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
      cancelled: { label: 'Cancelled', variant: 'secondary', icon: <XCircle className="h-3 w-3 mr-1" /> },
      failed: { label: 'Failed', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3 mr-1" /> },
      deleted: { label: 'In Trash', variant: 'destructive', icon: <Trash className="h-3 w-3 mr-1" /> },
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
  
  // Document table row component for reusability
  const DocumentRow = ({ doc }) => {
    const isInTrash = doc.isDeleted && !doc.isPendingPermanentDeletion;
    const isPendingDeletion = doc.isPendingPermanentDeletion;
    
    return (
      <TableRow key={doc.id} className={isPendingDeletion ? 'opacity-50' : ''}>
        <TableCell className="font-medium">
          {doc.fileName || 'Unnamed document'}
          {isPendingDeletion && (
            <span className="ml-2 text-xs text-destructive">(pending deletion)</span>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">{doc.fileType || 'Unknown'}</TableCell>
        <TableCell className="hidden md:table-cell">{formatFileSize(doc.fileSize)}</TableCell>
        <TableCell className="hidden md:table-cell">
          {isInTrash
            ? getTimeDisplay(doc.deletedAt)
            : getTimeDisplay(doc.createdAt)
          }
        </TableCell>
        <TableCell>
          <StatusBadge status={isInTrash ? 'deleted' : (doc.status || 'completed')} />
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
              
              {!isInTrash && doc.resultId && (
                <DropdownMenuItem asChild>
                  <Link href={`/results/${doc.resultId}`}>
                    View Results
                  </Link>
                </DropdownMenuItem>
              )}
              
              {isInTrash && (
                <DropdownMenuItem
                  onClick={() => handleRestoreDocument(doc.id)}
                  disabled={restoreInProgress[doc.id]}
                >
                  {restoreInProgress[doc.id] ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restore Document
                    </>
                  )}
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              
              {!isInTrash ? (
                // Regular document actions
                <>
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete({
                      isOpen: true,
                      documentId: doc.id,
                      documentName: doc.fileName || 'this document',
                      withDatasets: false,
                      permanent: false
                    })}
                    className="text-destructive"
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    Move to Trash
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete({
                      isOpen: true,
                      documentId: doc.id,
                      documentName: doc.fileName || 'this document',
                      withDatasets: true,
                      permanent: false
                    })}
                    className="text-destructive"
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    Move to Trash (with Datasets)
                  </DropdownMenuItem>
                </>
              ) : (
                // Trash actions
                <DropdownMenuItem
                  onClick={() => setConfirmDelete({
                    isOpen: true,
                    documentId: doc.id,
                    documentName: doc.fileName || 'this document',
                    withDatasets: true,
                    permanent: true
                  })}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  // Pagination renderer
  const renderPagination = () => {
    const { currentPage, totalPages } = pagination;
    
    if (totalPages <= 1) return null;
    
    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              onClick={() => handlePageChange(currentPage - 1)}
              className={currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
          
          {[...Array(totalPages)].map((_, i) => {
            const pageNumber = i + 1;
            
            // Show current page, first page, last page, and pages around current
            if (
              pageNumber === 1 ||
              pageNumber === totalPages ||
              (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
            ) {
              return (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    isActive={pageNumber === currentPage}
                    onClick={() => handlePageChange(pageNumber)}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              );
            }
            
            // Show ellipsis for page gaps
            if (
              (pageNumber === 2 && currentPage > 3) ||
              (pageNumber === totalPages - 1 && currentPage < totalPages - 2)
            ) {
              return (
                <PaginationItem key={pageNumber}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }
            
            return null;
          })}
          
          <PaginationItem>
            <PaginationNext 
              onClick={() => handlePageChange(currentPage + 1)}
              className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Your Documents</CardTitle>
                  <CardDescription>
                    Manage your uploaded documents and generated datasets
                  </CardDescription>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* View mode switcher */}
                  <Select 
                    defaultValue={viewMode} 
                    onValueChange={setViewMode}
                  >
                    <SelectTrigger className="w-[140px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active Documents</SelectItem>
                      <SelectItem value="trash">Trash</SelectItem>
                      <SelectItem value="all">All Documents</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button size="sm" variant="outline" onClick={() => loadDocuments(pagination.currentPage, pagination.pageSize)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Page size selector */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-muted-foreground">
                  {pagination.totalCount > 0 && (
                    <>
                      Showing {Math.min((pagination.currentPage - 1) * pagination.pageSize + 1, pagination.totalCount)} to {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount} documents
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Items per page:</span>
                  <Select 
                    defaultValue={pagination.pageSize.toString()} 
                    onValueChange={handlePageSizeChange}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
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
                  <h3 className="text-lg font-medium">
                    {viewMode === 'trash' 
                      ? 'Trash is empty' 
                      : viewMode === 'all'
                        ? 'No documents found'
                        : 'No active documents found'
                    }
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    {viewMode === 'trash' 
                      ? 'Documents moved to trash will appear here' 
                      : 'Upload a document to get started'
                    }
                  </p>
                  {viewMode !== 'trash' && (
                    <Link href="/upload">
                      <Button className="mt-4">Upload Document</Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableCaption>
                      {viewMode === 'trash' 
                        ? 'Documents in trash (will be permanently deleted after 30 days)'
                        : 'A list of your documents'
                      }
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Type</TableHead>
                        <TableHead className="hidden md:table-cell">Size</TableHead>
                        <TableHead className="hidden md:table-cell">
                          {viewMode === 'trash' ? 'Deleted' : 'Uploaded'}
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <DocumentRow key={doc.id} doc={doc} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Pagination controls */}
              {renderPagination()}
            </CardContent>
            
            {viewMode === 'trash' && documents.length > 0 && (
              <CardFooter className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete({
                    isOpen: true,
                    documentId: 'all',
                    documentName: 'all documents in trash',
                    withDatasets: true,
                    permanent: true
                  })}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Empty Trash
                </Button>
              </CardFooter>
            )}
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
                  onClick={() => loadDocuments(pagination.currentPage, pagination.pageSize)}
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableCaption>A list of your active jobs</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead className="hidden md:table-cell">Started</TableHead>
                        <TableHead className="hidden md:table-cell">Message</TableHead>
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
                          <TableCell className="hidden md:table-cell">{getTimeDisplay(job.createdAt)}</TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px] truncate">
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
                </div>
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
              This will {confirmDelete.permanent ? 'permanently delete' : 'move to trash'} {confirmDelete.documentName}
              {confirmDelete.withDatasets ? ' and all associated datasets' : ''}.
              {confirmDelete.permanent && ' This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteDocument(
                confirmDelete.documentId,
                confirmDelete.withDatasets,
                confirmDelete.permanent
              )}
              disabled={deleteInProgress[confirmDelete.documentId]}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteInProgress[confirmDelete.documentId] ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {confirmDelete.permanent ? 'Deleting...' : 'Moving...'}
                </>
              ) : (
                <>
                  {confirmDelete.permanent ? (
                    <Trash2 className="h-4 w-4 mr-2" />
                  ) : (
                    <Trash className="h-4 w-4 mr-2" />
                  )}
                  {confirmDelete.permanent ? 'Delete Permanently' : 'Move to Trash'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 