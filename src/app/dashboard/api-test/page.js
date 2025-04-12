"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { JsonView } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { UserInfoCard } from '@/components/UserInfoCard';
import { useAuth } from '@/contexts/AuthContext';

export default function APITestPage() {
  const { toast } = useToast();
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  // State for auth test
  const [authToken, setAuthToken] = useState(null);
  const [checkAdmin, setCheckAdmin] = useState(false);
  const [specificPermission, setSpecificPermission] = useState("");
  
  // State for document test
  const [documentPage, setDocumentPage] = useState(1);
  const [documentPageSize, setDocumentPageSize] = useState(10);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // State for document operation test
  const [documentId, setDocumentId] = useState('');
  const [jobId, setJobId] = useState('');
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [operationType, setOperationType] = useState('delete');

  // State for custom API test
  const [endpoint, setEndpoint] = useState('/api/auth-test');
  const [method, setMethod] = useState('GET');
  const [body, setBody] = useState('');

  useEffect(() => {
    async function fetchToken() {
      try {
        const token = await getIdToken();
        if (token) {
          setAuthToken(`Bearer ${token}`);
        }
      } catch (error) {
        console.error("Error getting token:", error);
      }
    }
    
    fetchToken();
  }, [getIdToken]);

  const testAuthUtils = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = new URL('/api/auth-test', window.location.origin);
      
      if (checkAdmin) {
        url.searchParams.append('checkAdmin', 'true');
      }
      
      if (specificPermission) {
        url.searchParams.append('permission', specificPermission);
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': authToken
        }
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error: ${data.error || "Unknown error occurred"}`);
        toast({
          title: "Authentication Test Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Authentication Test Complete",
          description: "Authentication successful",
        });
      }
    } catch (error) {
      setError(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDocuments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = new URL('/api/document-management', window.location.origin);
      url.searchParams.append('page', documentPage);
      url.searchParams.append('pageSize', documentPageSize);
      if (includeDeleted) {
        url.searchParams.append('includeDeleted', 'true');
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': authToken
        }
      });
      
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        setError(`Error: ${data.error || "Unknown error occurred"}`);
        toast({
          title: "Error",
          description: data.error || "Failed to retrieve documents",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Documents Retrieved",
          description: `Found ${data.documents?.length || 0} documents`,
        });
      }
    } catch (error) {
      setError(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const performDocumentOperation = async () => {
    if (!documentId && operationType !== 'getJobs') {
      toast({
        title: "Error",
        description: "Document ID is required",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      let url, fetchOptions;
      
      switch(operationType) {
        case 'delete':
          url = `/api/document-management?documentId=${documentId}${permanentDelete ? '&permanent=true' : ''}`;
          fetchOptions = {
            method: 'DELETE',
            headers: {
              'Authorization': authToken
            }
          };
          break;
        case 'restore':
          url = `/api/document-management`;
          fetchOptions = {
            method: 'PATCH',
            headers: {
              'Authorization': authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              documentId,
              action: 'restore'
            })
          };
          break;
        case 'cancelJob':
          if (!jobId) {
            toast({
              title: "Error",
              description: "Job ID is required for cancel operation",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          url = `/api/document-management`;
          fetchOptions = {
            method: 'PATCH',
            headers: {
              'Authorization': authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              documentId,
              jobId,
              action: 'cancel'
            })
          };
          break;
        case 'getJobs':
          url = `/api/document-management?activeJobsOnly=true`;
          fetchOptions = {
            headers: {
              'Authorization': authToken
            }
          };
          break;
        default:
          throw new Error('Invalid operation type');
      }
      
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${operationType} document`);
      }
      
      toast({
        title: "Operation Successful",
        description: `${operationType.charAt(0).toUpperCase() + operationType.slice(1)} operation completed successfully`,
      });
    } catch (error) {
      setError(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testCustomApi = async () => {
    if (!endpoint) {
      toast({
        title: "Error",
        description: "Endpoint is required",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const options = {
        method: method,
        headers: {
          'Authorization': authToken
        }
      };
      
      if (method !== 'GET' && method !== 'HEAD' && body) {
        try {
          // Try to parse as JSON
          JSON.parse(body);
          options.headers['Content-Type'] = 'application/json';
          options.body = body;
        } catch (e) {
          // If not valid JSON, send as plain text
          options.headers['Content-Type'] = 'text/plain';
          options.body = body;
        }
      }
      
      const response = await fetch(endpoint, options);
      let data;
      
      try {
        data = await response.json();
      } catch (e) {
        data = { rawText: await response.text() };
      }
      
      setResults(data);
      
      if (!response.ok) {
        throw new Error(data.error || `API request failed with status ${response.status}`);
      }
      
      toast({
        title: "API Request Complete",
        description: `${method} request to ${endpoint} completed with status ${response.status}`,
      });
    } catch (error) {
      setError(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">API Testing Tool</h1>
        <p className="text-muted-foreground">Test and debug API endpoints with authentication</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <UserInfoCard />
          </div>
          
          <div className="lg:col-span-2">
            <Tabs defaultValue="auth">
              <TabsList className="grid grid-cols-4 mb-4">
                <TabsTrigger value="auth">Auth Test</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="operations">Document Ops</TabsTrigger>
                <TabsTrigger value="custom">Custom API</TabsTrigger>
              </TabsList>
            
              <TabsContent value="auth">
                <Card>
                  <CardHeader>
                    <CardTitle>Authentication Test</CardTitle>
                    <CardDescription>Test authentication and permission checking</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="check-admin" 
                        checked={checkAdmin}
                        onCheckedChange={setCheckAdmin}
                      />
                      <Label htmlFor="check-admin">Check Admin Permission</Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="specificPermission">Check Specific Permission (optional)</Label>
                      <Input 
                        id="specificPermission" 
                        value={specificPermission} 
                        onChange={(e) => setSpecificPermission(e.target.value)}
                        placeholder="Enter permission name (e.g., 'delete:documents')" 
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={testAuthUtils} disabled={loading || !authToken}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</> : "Test Authentication"}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="documents">
                <Card>
                  <CardHeader>
                    <CardTitle>Retrieve Documents</CardTitle>
                    <CardDescription>Test fetching document list with pagination</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="page">Page</Label>
                        <Input 
                          id="page" 
                          type="number" 
                          value={documentPage} 
                          onChange={(e) => setDocumentPage(Number(e.target.value))}
                          min={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pageSize">Page Size</Label>
                        <Input 
                          id="pageSize" 
                          type="number" 
                          value={documentPageSize} 
                          onChange={(e) => setDocumentPageSize(Number(e.target.value))}
                          min={1}
                          max={100}
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="include-deleted" 
                        checked={includeDeleted}
                        onCheckedChange={setIncludeDeleted}
                      />
                      <Label htmlFor="include-deleted">Include Deleted Documents</Label>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={getDocuments} disabled={loading || !authToken}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching...</> : "Get Documents"}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="operations">
                <Card>
                  <CardHeader>
                    <CardTitle>Document Operations</CardTitle>
                    <CardDescription>Test document management operations</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="operation-type">Operation Type</Label>
                      <Select value={operationType} onValueChange={setOperationType}>
                        <SelectTrigger id="operation-type">
                          <SelectValue placeholder="Select operation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delete">Delete Document</SelectItem>
                          <SelectItem value="restore">Restore Document</SelectItem>
                          <SelectItem value="cancelJob">Cancel Job</SelectItem>
                          <SelectItem value="getJobs">Get Active Jobs</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {operationType !== 'getJobs' && (
                      <div className="space-y-2">
                        <Label htmlFor="document-id">Document ID</Label>
                        <Input 
                          id="document-id" 
                          value={documentId} 
                          onChange={(e) => setDocumentId(e.target.value)}
                          placeholder="Enter document ID"
                        />
                      </div>
                    )}
                    
                    {operationType === 'cancelJob' && (
                      <div className="space-y-2">
                        <Label htmlFor="job-id">Job ID</Label>
                        <Input 
                          id="job-id" 
                          value={jobId} 
                          onChange={(e) => setJobId(e.target.value)}
                          placeholder="Enter job ID"
                        />
                      </div>
                    )}
                    
                    {operationType === 'delete' && (
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="permanent-delete" 
                          checked={permanentDelete}
                          onCheckedChange={setPermanentDelete}
                        />
                        <Label htmlFor="permanent-delete">Permanent Delete</Label>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button onClick={performDocumentOperation} disabled={loading || !authToken}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : "Execute Operation"}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="custom">
                <Card>
                  <CardHeader>
                    <CardTitle>Custom API Request</CardTitle>
                    <CardDescription>Test any API endpoint with custom parameters</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="endpoint">API Endpoint</Label>
                      <Input 
                        id="endpoint" 
                        value={endpoint} 
                        onChange={(e) => setEndpoint(e.target.value)}
                        placeholder="/api/endpoint"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="method">HTTP Method</Label>
                      <Select value={method} onValueChange={setMethod}>
                        <SelectTrigger id="method">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="PATCH">PATCH</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {method !== 'GET' && method !== 'HEAD' && (
                      <div className="space-y-2">
                        <Label htmlFor="body">Request Body (JSON)</Label>
                        <Textarea 
                          id="body" 
                          value={body} 
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Enter request body as JSON"
                          rows={5}
                        />
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button onClick={testCustomApi} disabled={loading || !endpoint || !authToken}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Request...</> : "Send Request"}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {results && (
          <Card>
            <CardHeader>
              <CardTitle>API Response</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-md overflow-auto max-h-[500px]">
                <JsonView data={results} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 