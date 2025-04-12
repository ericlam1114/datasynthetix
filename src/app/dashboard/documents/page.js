'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { DocumentApi } from '@/lib/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  X,
  Loader2,
  FileText,
  ArrowUpDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function DocumentManagementPage() {
  const { toast } = useToast();
  const router = useRouter();
  
  // State for pagination and view
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [viewMode, setViewMode] = useState('active');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    totalPages: 1,
    totalCount: 0,
  });
  
  // State for confirmation dialogs
  const [deletingDocument, setDeletingDocument] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({
    permanent: false,
    deleteDatasets: false,
  });
  
  // State for monitoring active jobs
  const [activeJobs, setActiveJobs] = useState([]);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Load documents based on current pagination and view settings
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);
    
    try {
      const response = await DocumentApi.getDocuments({
        page: pagination.page,
        pageSize: pagination.pageSize,
        viewMode,
      });
      
      setDocuments(response.documents || []);
      setPagination({
        ...pagination,
        totalPages: response.pagination?.totalPages || 1,
        totalCount: response.pagination?.totalCount || 0,
      });
      
      // Filter active jobs for polling
      const jobs = response.documents.filter(doc => 
        doc.status === 'processing' || doc.status === 'queued'
      );
      setActiveJobs(jobs);
      
      // Set up polling if we have active jobs
      if (jobs.length > 0 && !pollingInterval) {
        const interval = setInterval(() => {
          refreshActiveJobs(jobs.map(job => job.id));
        }, 5000); // Poll every 5 seconds
        setPollingInterval(interval);
      } else if (jobs.length === 0 && pollingInterval) {
        // Clear polling if no active jobs
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      setLoadingError(error.message || 'Failed to load documents');
      toast({
        variant: "destructive",
        title: "Error loading documents",
        description: error.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, viewMode, pollingInterval, toast]);

  // Refresh active jobs
  const refreshActiveJobs = async (jobIds) => {
    if (!jobIds.length) return;
    
    try {
      const response = await DocumentApi.getDocuments({
        page: 1,
        pageSize: 100, // Larger size to ensure we get all active jobs
        viewMode: 'all',
      });
      
      // Update our local documents list with refreshed job status
      const updatedDocs = [...documents];
      
      response.documents.forEach(freshDoc => {
        if (jobIds.includes(freshDoc.id)) {
          const index = updatedDocs.findIndex(doc => doc.id === freshDoc.id);
          if (index >= 0) {
            updatedDocs[index] = freshDoc;
          }
        }
      });
      
      setDocuments(updatedDocs);
      
      // Stop polling if no more active jobs
      const stillActive = updatedDocs.filter(doc => 
        doc.status === 'processing' || doc.status === 'queued'
      );
      
      if (stillActive.length === 0 && pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
        
        // Reload all documents to ensure we have the latest data
        loadDocuments();
      }
    } catch (error) {
      console.error('Error refreshing active jobs:', error);
    }
  };

  // Load documents on mount and when pagination/view changes
  useEffect(() => {
    loadDocuments();
    
    // Clean up polling interval on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [loadDocuments, pollingInterval]);

  // Handle document deletion
  const handleDeleteDocument = async () => {
    if (!deletingDocument) return;
    
    setLoading(true);
    
    try {
      await DocumentApi.deleteDocument({
        documentId: deletingDocument.id,
        permanent: deleteOptions.permanent,
        deleteDatasets: deleteOptions.deleteDatasets,
      });
      
      toast({
        title: "Document deleted",
        description: deleteOptions.permanent 
          ? "Document has been permanently deleted" 
          : "Document moved to trash",
      });
      
      // Reload documents
      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        variant: "destructive",
        title: "Error deleting document",
        description: error.message || "Failed to delete document",
      });
    } finally {
      setDeletingDocument(null);
      setDeleteOptions({ permanent: false, deleteDatasets: false });
      setLoading(false);
    }
  };

  // Handle document restoration
  const handleRestoreDocument = async (documentId) => {
    setLoading(true);
    
    try {
      await DocumentApi.restoreDocument(documentId);
      
      toast({
        title: "Document restored",
        description: "Document has been restored from trash",
      });
      
      // Reload documents
      loadDocuments();
    } catch (error) {
      console.error('Error restoring document:', error);
      toast({
        variant: "destructive",
        title: "Error restoring document",
        description: error.message || "Failed to restore document",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle job cancellation
  const handleCancelJob = async (documentId) => {
    setLoading(true);
    
    try {
      await DocumentApi.cancelJob(documentId);
      
      toast({
        title: "Job cancelled",
        description: "Document processing job has been cancelled",
      });
      
      // Reload documents
      loadDocuments();
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast({
        variant: "destructive",
        title: "Error cancelling job",
        description: error.message || "Failed to cancel job",
      });
    } finally {
      setLoading(false);
    }
  };

  // Change page
  const handlePageChange = (page) => {
    setPagination({
      ...pagination,
      page,
    });
  };

  // Change page size
  const handlePageSizeChange = (size) => {
    setPagination({
      ...pagination,
      page: 1, // Reset to first page when changing page size
      pageSize: parseInt(size),
    });
  };

  // Render pagination controls
  const renderPagination = () => {
    const { page, totalPages } = pagination;
    
    if (totalPages <= 1) return null;
    
    let pages = [];
    
    // Always show first page, last page, current page, and one page before and after current
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      // Complex pagination for many pages
      pages.push(1); // First page
      
      if (page > 3) {
        pages.push('ellipsis-start');
      }
      
      // Pages around current
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (page < totalPages - 2) {
        pages.push('ellipsis-end');
      }
      
      pages.push(totalPages); // Last page
    }
    
    return (
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Items per page:
          </span>
          <Select 
            value={pagination.pageSize.toString()} 
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue placeholder={pagination.pageSize} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => page > 1 && handlePageChange(page - 1)}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            
            {pages.map((p, i) => 
              p === 'ellipsis-start' || p === 'ellipsis-end' ? (
                <PaginationItem key={p}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={page === p}
                    onClick={() => handlePageChange(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            
            <PaginationItem>
              <PaginationNext 
                onClick={() => page < totalPages && handlePageChange(page + 1)}
                className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        
        <div className="text-sm text-muted-foreground">
          {pagination.totalCount > 0 
            ? `Showing ${(page - 1) * pagination.pageSize + 1} to ${Math.min(page * pagination.pageSize, pagination.totalCount)} of ${pagination.totalCount} items` 
            : 'No items'}
        </div>
      </div>
    );
  };

  // Render document row
  const DocumentRow = ({ document }) => {
    const isActive = document.status === 'processing' || document.status === 'queued';
    const isDeleted = document.deleted === true;
    
    return (
      <TableRow key={document.id}>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{document.name || 'Untitled Document'}</span>
            <span className="text-xs text-muted-foreground">ID: {document.id.substring(0, 8)}...</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={getStatusVariant(document.status)}>
            {document.status}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span>{formatDate(document.createdAt)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(document.createdAt)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span>{formatDate(document.lastUpdated)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(document.lastUpdated)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-2">
            {isDeleted ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestoreDocument(document.id)}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Restore
              </Button>
            ) : isActive ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleCancelJob(document.id)}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/dashboard/viewer/${document.id}`)}
                  disabled={loading}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  View
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Delete options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                      setDeletingDocument(document);
                      setDeleteOptions({ permanent: false, deleteDatasets: false });
                    }}>
                      Move to trash
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setDeletingDocument(document);
                      setDeleteOptions({ permanent: true, deleteDatasets: false });
                    }}>
                      <AlertTriangle className="h-4 w-4 mr-1 text-destructive" />
                      Delete permanently
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setDeletingDocument(document);
                      setDeleteOptions({ permanent: true, deleteDatasets: true });
                    }}>
                      <AlertTriangle className="h-4 w-4 mr-1 text-destructive" />
                      Delete with all datasets
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Helper for status badge variant
  const getStatusVariant = (status) => {
    switch (status) {
      case 'processing': return 'default';
      case 'completed': return 'success';
      case 'failed': return 'destructive';
      case 'queued': return 'secondary';
      case 'cancelled': return 'outline';
      default: return 'default';
    }
  };

  // Helper for date formatting
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'MMM d, yyyy');
  };

  // Helper for time formatting
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'h:mm a');
  };

  return (
    <div className="container py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Document Management</CardTitle>
          <CardDescription>
            View, manage, and organize your uploaded documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="active"
            value={viewMode}
            onValueChange={setViewMode}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 w-full max-w-md mb-6">
              <TabsTrigger value="active">Active Documents</TabsTrigger>
              <TabsTrigger value="trash">Trash</TabsTrigger>
              <TabsTrigger value="all">All Documents</TabsTrigger>
            </TabsList>
            
            <TabsContent value={viewMode} className="mt-0">
              {loadingError ? (
                <div className="p-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-2" />
                  <h3 className="font-semibold text-lg">Error Loading Documents</h3>
                  <p className="text-muted-foreground">{loadingError}</p>
                  <Button 
                    onClick={loadDocuments} 
                    variant="secondary" 
                    className="mt-4"
                  >
                    Try Again
                  </Button>
                </div>
              ) : loading && documents.length === 0 ? (
                <div className="p-10 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="p-6 text-center border rounded-lg">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <h3 className="font-semibold text-lg">No Documents Found</h3>
                  <p className="text-muted-foreground">
                    {viewMode === 'active' && "You haven't uploaded any documents yet."}
                    {viewMode === 'trash' && "Your trash is empty."}
                    {viewMode === 'all' && "No documents found."}
                  </p>
                  {viewMode === 'active' && (
                    <Button 
                      onClick={() => router.push('/dashboard/upload')} 
                      className="mt-4"
                    >
                      Upload Document
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map(document => (
                        <DocumentRow key={document.id} document={document} />
                      ))}
                    </TableBody>
                  </Table>
                  
                  {renderPagination()}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingDocument} onOpenChange={(open) => !open && setDeletingDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteOptions.permanent 
                ? 'Permanently Delete Document?' 
                : 'Move Document to Trash?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteOptions.permanent ? (
                <>
                  This will permanently delete{' '}
                  <span className="font-semibold">{deletingDocument?.name || 'this document'}</span>.
                  {deleteOptions.deleteDatasets && ' All associated datasets will also be deleted.'}
                  <p className="mt-2 text-destructive font-semibold">This action cannot be undone.</p>
                </>
              ) : (
                <>
                  Move <span className="font-semibold">{deletingDocument?.name || 'this document'}</span>{' '}
                  to trash? You can restore it later if needed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocument}
              className={deleteOptions.permanent ? 'bg-destructive hover:bg-destructive/90' : ''}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteOptions.permanent ? 'Delete Permanently' : 'Move to Trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 