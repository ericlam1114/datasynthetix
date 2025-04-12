"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonView } from "@/components/ui/json-view";
import { useToast } from "@/components/ui/use-toast";
import { UserInfoCard } from '@/components/UserInfoCard';
import { X, Loader2 } from "lucide-react";

export default function ApiTestPage() {
  // State
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [activeTab, setActiveTab] = useState("auth");
  
  // Document management state
  const [viewMode, setViewMode] = useState("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [documentId, setDocumentId] = useState("");
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [deleteDatasets, setDeleteDatasets] = useState(false);
  
  // Custom API state
  const [requestBody, setRequestBody] = useState("{}");

  const { toast } = useToast();
  const { user, getIdToken, isAuthenticated } = useAuth();

  // Get auth token on component mount or when user changes
  useEffect(() => {
    const fetchToken = async () => {
      if (isAuthenticated && user) {
        try {
          const token = await getIdToken();
          setAuthToken(token);
        } catch (err) {
          console.error("Error getting auth token:", err);
          setError("Failed to get authentication token. Please sign in again.");
        }
      } else {
        setAuthToken(null);
      }
    };

    fetchToken();
  }, [getIdToken, isAuthenticated, user]);

  // Test authentication
  const testAuth = async () => {
    if (!authToken) {
      setError("You must be logged in to test authentication");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/auth-test", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Test authenticated user info
  const testUserInfo = async () => {
    if (!authToken) {
      setError("You must be logged in to test user info");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/auth-test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get documents
  const getDocuments = async () => {
    if (!authToken) {
      setError("You must be logged in to get documents");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        viewMode,
        page,
        pageSize
      });
      
      const response = await fetch(`/api/document-management?${params.toString()}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      } else if (data.documents) {
        toast({
          title: "Success",
          description: `Retrieved ${data.documents.length} documents`
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete document
  const deleteDocument = async () => {
    if (!authToken) {
      setError("You must be logged in to delete documents");
      return;
    }

    if (!documentId) {
      setError("Document ID is required");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/document-management", {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId,
          permanent: permanentDelete,
          deleteDatasets
        })
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      } else {
        toast({
          title: "Success",
          description: permanentDelete 
            ? "Document permanently deleted" 
            : "Document moved to trash",
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Restore document
  const restoreDocument = async () => {
    if (!authToken) {
      setError("You must be logged in to restore documents");
      return;
    }

    if (!documentId) {
      setError("Document ID is required");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/document-management", {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId,
          action: "restore"
        })
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      } else {
        toast({
          title: "Success",
          description: "Document restored from trash"
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Cancel job
  const cancelJob = async () => {
    if (!authToken) {
      setError("You must be logged in to cancel jobs");
      return;
    }

    if (!documentId) {
      setError("Document ID is required");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/document-management", {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId,
          action: "cancelJob"
        })
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      } else {
        toast({
          title: "Success",
          description: "Job cancelled successfully"
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Test custom API endpoint
  const testCustomApi = async () => {
    if (!authToken) {
      setError("You must be logged in to test custom APIs");
      return;
    }

    setLoading(true);
    setError(null);
    
    let parsedBody = {};
    try {
      parsedBody = JSON.parse(requestBody);
    } catch (err) {
      setError(`Invalid JSON in request body: ${err.message}`);
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch("/api/custom-endpoint", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsedBody)
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error ${response.status}: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">API Testing Tool</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="lg:col-span-1">
          <UserInfoCard />
        </div>
        
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>API Testing</CardTitle>
              <CardDescription>Test the various API endpoints with your auth token</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="auth">Authentication</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="operations">Operations</TabsTrigger>
                  <TabsTrigger value="custom">Custom API</TabsTrigger>
                </TabsList>
                
                <TabsContent value="auth" className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">Test authentication endpoints</p>
                  <div className="space-y-2">
                    <Button onClick={testAuth} disabled={loading || !authToken} className="mr-2">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Test Auth (GET)
                    </Button>
                    <Button onClick={testUserInfo} disabled={loading || !authToken}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Get User Info (POST)
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="documents" className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">Get document listings with filters</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="viewMode">View Mode</Label>
                      <Select value={viewMode} onValueChange={setViewMode}>
                        <SelectTrigger id="viewMode">
                          <SelectValue placeholder="View Mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="trash">Trash</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="page">Page</Label>
                      <Input 
                        id="page" 
                        type="number" 
                        min="1" 
                        value={page} 
                        onChange={(e) => setPage(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pageSize">Page Size</Label>
                      <Input 
                        id="pageSize" 
                        type="number" 
                        min="1" 
                        max="50" 
                        value={pageSize} 
                        onChange={(e) => setPageSize(parseInt(e.target.value) || 10)}
                      />
                    </div>
                  </div>
                  <Button onClick={getDocuments} disabled={loading || !authToken}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Get Documents
                  </Button>
                </TabsContent>
                
                <TabsContent value="operations" className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">Perform document operations</p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="documentId">Document ID</Label>
                      <Input 
                        id="documentId" 
                        value={documentId} 
                        onChange={(e) => setDocumentId(e.target.value)}
                        placeholder="Enter document ID"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Delete Options</h4>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="permanentDelete" 
                          checked={permanentDelete}
                          onCheckedChange={setPermanentDelete}
                        />
                        <Label htmlFor="permanentDelete">Permanent Delete</Label>
                      </div>
                      
                      {permanentDelete && (
                        <div className="flex items-center space-x-2 ml-6 mt-2">
                          <Checkbox 
                            id="deleteDatasets" 
                            checked={deleteDatasets}
                            onCheckedChange={setDeleteDatasets}
                          />
                          <Label htmlFor="deleteDatasets">Delete Associated Datasets</Label>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-x-2">
                      <Button 
                        onClick={deleteDocument} 
                        disabled={loading || !authToken || !documentId}
                        variant={permanentDelete ? "destructive" : "default"}
                      >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {permanentDelete ? "Permanently Delete" : "Move to Trash"}
                      </Button>
                      
                      <Button 
                        onClick={restoreDocument} 
                        disabled={loading || !authToken || !documentId}
                        variant="outline"
                      >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Restore
                      </Button>
                      
                      <Button 
                        onClick={cancelJob} 
                        disabled={loading || !authToken || !documentId}
                        variant="outline"
                      >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Cancel Job
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="custom" className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">Test custom API endpoints</p>
                  <div className="space-y-2">
                    <Label htmlFor="requestBody">Request Body (JSON)</Label>
                    <Textarea 
                      id="requestBody" 
                      value={requestBody} 
                      onChange={(e) => setRequestBody(e.target.value)}
                      rows={8}
                    />
                  </div>
                  <Button onClick={testCustomApi} disabled={loading || !authToken}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send Request
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setError(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>API Response</CardTitle>
          <CardDescription>Results from the API call</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : results ? (
            <JsonView data={results} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No results to display. Make an API call to see the response.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 