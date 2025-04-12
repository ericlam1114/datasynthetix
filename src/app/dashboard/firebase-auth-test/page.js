"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { InfoIcon, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';
import { UserInfoCard } from '@/components/UserInfoCard';
import { JsonView } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { useAuth } from '@/contexts/AuthContext';
import { auth as firebaseAuth, firestore } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function FirebaseAuthTestPage() {
  const { user, getIdToken, logout } = useAuth();
  const { toast } = useToast();
  
  // State for various tests
  const [loading, setLoading] = useState(false);
  const [idToken, setIdToken] = useState(null);
  const [decodedToken, setDecodedToken] = useState(null);
  const [serverAuthResult, setServerAuthResult] = useState(null);
  const [adminPermissionCheck, setAdminPermissionCheck] = useState(null);
  const [currentUserJson, setCurrentUserJson] = useState(null);
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [firebaseSDKInitialized, setFirebaseSDKInitialized] = useState(false);
  const [refreshTokenAutomatically, setRefreshTokenAutomatically] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [adminCreds, setAdminCreds] = useState({
    projectId: null,
    clientEmail: null,
    privateKeyConfigured: false
  });

  // Check if Firebase SDK is initialized
  useEffect(() => {
    if (firebaseAuth) {
      setFirebaseSDKInitialized(true);
    }
  }, []);

  // Check admin credentials
  useEffect(() => {
    async function checkAdminCredentials() {
      try {
        const response = await fetch('/api/check-admin-credentials');
        const data = await response.json();
        setAdminCreds({
          projectId: data.projectId || null,
          clientEmail: data.clientEmail || null,
          privateKeyConfigured: data.privateKeyConfigured || false
        });
      } catch (error) {
        console.error('Error checking admin credentials:', error);
      }
    }
    
    checkAdminCredentials();
  }, []);

  // Auto refresh token if enabled
  useEffect(() => {
    let intervalId = null;
    
    if (refreshTokenAutomatically && user) {
      intervalId = setInterval(async () => {
        await refreshIdToken();
      }, 10 * 60 * 1000); // Refresh every 10 minutes
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [refreshTokenAutomatically, user]);

  // Update current user JSON when user changes
  useEffect(() => {
    if (user) {
      // Convert user object to a plain object for display
      const userObj = {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoURL: user.photoURL,
        phoneNumber: user.phoneNumber,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime
        },
        providerData: user.providerData.map(provider => ({
          providerId: provider.providerId,
          uid: provider.uid,
          displayName: provider.displayName,
          email: provider.email,
          phoneNumber: provider.phoneNumber,
          photoURL: provider.photoURL
        }))
      };
      
      setCurrentUserJson(userObj);
    } else {
      setCurrentUserJson(null);
    }
  }, [user]);

  // Get ID token from Firebase
  const refreshIdToken = async () => {
    setLoading(true);
    try {
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "You must be signed in to get an ID token",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      
      const token = await getIdToken();
      setIdToken(token);
      
      // Decode token without verification (client-side)
      if (token) {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const decodedPayload = JSON.parse(atob(tokenParts[1]));
          setDecodedToken(decodedPayload);
          
          // Calculate token expiry
          if (decodedPayload.exp) {
            const expiryDate = new Date(decodedPayload.exp * 1000);
            setTokenExpiry({
              expiryDate,
              expiresIn: Math.floor((expiryDate - new Date()) / 1000)
            });
          }
        }
      }
      
      setLastRefreshed(new Date());
      toast({
        title: "Token refreshed",
        description: "ID token was successfully retrieved",
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      toast({
        title: "Error refreshing token",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Test server-side authentication
  const testServerAuth = async () => {
    setLoading(true);
    try {
      if (!idToken) {
        await refreshIdToken();
      }
      
      const response = await fetch('/api/auth-test', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const result = await response.json();
      setServerAuthResult(result);
      
      if (result.success) {
        toast({
          title: "Server authentication successful",
          description: `User ID: ${result.userId}`,
        });
      } else {
        toast({
          title: "Server authentication failed",
          description: result.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error testing server auth:', error);
      toast({
        title: "Error testing server auth",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check admin permissions
  const checkAdminPermission = async () => {
    setLoading(true);
    try {
      if (!idToken) {
        await refreshIdToken();
      }
      
      const response = await fetch('/api/check-permission?permission=admin', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const result = await response.json();
      setAdminPermissionCheck(result);
      
      toast({
        title: result.hasPermission 
          ? "Admin permission granted" 
          : "Admin permission denied",
        description: result.message,
        variant: result.hasPermission ? "default" : "destructive"
      });
    } catch (error) {
      console.error('Error checking admin permission:', error);
      toast({
        title: "Error checking permission",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Sign out the user
  const handleSignOut = async () => {
    try {
      await logout();
      setIdToken(null);
      setDecodedToken(null);
      setServerAuthResult(null);
      setAdminPermissionCheck(null);
      toast({
        title: "Signed out",
        description: "You have been successfully signed out"
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Grant admin permission
  const grantAdminPermission = async () => {
    setLoading(true);
    try {
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "You must be signed in to grant admin permissions",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      
      // Update the user document to grant admin access
      const userRef = doc(firestore, "users", user.uid);
      await updateDoc(userRef, {
        isAdmin: true,
        permissions: arrayUnion('admin'),
        // Add a timestamp for when admin was granted
        adminGrantedAt: new Date().toISOString()
      });
      
      toast({
        title: "Admin access granted",
        description: "Your account has been granted admin permissions. You may need to refresh your token.",
      });
      
      // Refresh the token to get updated claims
      await refreshIdToken();
      
      // Re-check permissions
      await checkAdminPermission();
      
    } catch (error) {
      console.error('Error granting admin permission:', error);
      toast({
        title: "Error granting admin permission",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Add this function before the return statement
  const checkDirectFirestore = async () => {
    setLoading(true);
    try {
      if (!idToken) {
        await refreshIdToken();
      }
      
      const response = await fetch('/api/direct-admin-check', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const result = await response.json();
      
      // Display result in an alert
      toast({
        title: result.checkResult 
          ? "Direct Check: Admin Found" 
          : "Direct Check: Not Admin",
        description: result.message,
        variant: result.checkResult ? "default" : "destructive"
      });
      
      // Log detailed result to console
      console.log('Direct Firestore check result:', result);
      
      // Show a detailed alert dialog or modal with the full data
      alert(
        `Direct Firestore Check Results:\n\n` +
        `User ID: ${result.userId}\n` +
        `Admin Access: ${result.checkResult ? 'YES' : 'NO'}\n` +
        `isAdmin field: ${result.adminData?.isAdmin}\n` +
        `Permissions: ${JSON.stringify(result.adminData?.permissions)}\n\n` +
        `If this shows you have admin access but the permission check fails, ` +
        `there's an issue with how the hasPermission function is being called.`
      );
      
    } catch (error) {
      console.error('Error with direct Firestore check:', error);
      toast({
        title: "Error with direct check",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Add this function before the return statement
  const checkAdminPermissionDirect = async () => {
    setLoading(true);
    try {
      if (!idToken) {
        await refreshIdToken();
      }
      
      const response = await fetch('/api/check-permission?permission=admin&bypass=true', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const result = await response.json();
      setAdminPermissionCheck(result);
      
      toast({
        title: result.hasPermission 
          ? "Direct Admin Check: Granted" 
          : "Direct Admin Check: Denied",
        description: result.message,
        variant: result.hasPermission ? "default" : "destructive"
      });
      
      console.log('Direct permission check result:', result);
    } catch (error) {
      console.error('Error checking admin permission directly:', error);
      toast({
        title: "Error checking permission",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Firebase Authentication Tests</h1>
        <p className="text-muted-foreground">
          Test and verify Firebase authentication functionality for both client and server-side operations
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="space-y-6">
              <UserInfoCard />
              
              <Card>
                <CardHeader>
                  <CardTitle>Authentication Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Badge variant={firebaseSDKInitialized ? "success" : "destructive"}>
                        {firebaseSDKInitialized ? "Firebase SDK Initialized" : "Firebase SDK Not Initialized"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge variant={user ? "success" : "destructive"}>
                        {user ? "User Authenticated" : "Not Authenticated"}
                      </Badge>
                    </div>
                    
                    {idToken && tokenExpiry && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Token expires in:</span>
                          <Badge variant={tokenExpiry.expiresIn > 300 ? "outline" : "destructive"}>
                            {Math.floor(tokenExpiry.expiresIn / 60)} min {tokenExpiry.expiresIn % 60} sec
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Expiry: {tokenExpiry.expiryDate.toLocaleString()}
                        </div>
                        {lastRefreshed && (
                          <div className="text-xs text-muted-foreground">
                            Last refreshed: {lastRefreshed.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="auto-refresh" 
                        checked={refreshTokenAutomatically}
                        onCheckedChange={setRefreshTokenAutomatically}
                      />
                      <Label htmlFor="auto-refresh">Auto-refresh token every 10 minutes</Label>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                  <Button 
                    className="w-full" 
                    onClick={refreshIdToken} 
                    disabled={loading || !user}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh ID Token
                      </>
                    )}
                  </Button>
                  
                  {user && (
                    <Button 
                      className="w-full" 
                      variant="outline" 
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </Button>
                  )}
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Firebase Admin SDK</CardTitle>
                  <CardDescription>Server-side authentication credentials status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Project ID:</span>
                      <Badge variant={adminCreds.projectId ? "outline" : "destructive"}>
                        {adminCreds.projectId ? "Configured" : "Not Configured"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Client Email:</span>
                      <Badge variant={adminCreds.clientEmail ? "outline" : "destructive"}>
                        {adminCreds.clientEmail ? "Configured" : "Not Configured"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Private Key:</span>
                      <Badge variant={adminCreds.privateKeyConfigured ? "outline" : "destructive"}>
                        {adminCreds.privateKeyConfigured ? "Configured" : "Not Configured"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <Tabs defaultValue="token">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="token">ID Token</TabsTrigger>
                <TabsTrigger value="server">Server Auth</TabsTrigger>
                <TabsTrigger value="user">User Details</TabsTrigger>
              </TabsList>
              
              <TabsContent value="token" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Firebase ID Token</CardTitle>
                    <CardDescription>
                      This token is used to authenticate with Firebase services and your backend
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!idToken && !loading && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>No token available</AlertTitle>
                        <AlertDescription>
                          Click "Refresh ID Token" to generate a new token
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {idToken && (
                      <>
                        <div className="space-y-2">
                          <Label>Raw JWT Token</Label>
                          <div className="bg-muted p-3 rounded-md overflow-x-auto">
                            <pre className="text-xs whitespace-pre-wrap break-all">{idToken}</pre>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-2">
                          <Label>Decoded Token Payload (Client-side only)</Label>
                          <Alert variant="warning" className="mb-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Warning</AlertTitle>
                            <AlertDescription>
                              This is decoded client-side without verification. Only server-side verification with Firebase Admin SDK is secure.
                            </AlertDescription>
                          </Alert>
                          
                          {decodedToken ? (
                            <div className="bg-muted rounded-md overflow-x-auto">
                              <JsonView data={decodedToken} />
                            </div>
                          ) : (
                            <p className="text-muted-foreground italic">Could not decode token</p>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      onClick={testServerAuth} 
                      disabled={loading || !idToken}
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Test Server Authentication
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="server" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Server-side Authentication</CardTitle>
                    <CardDescription>
                      Verify that your token works with Firebase Admin SDK on the server
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(!serverAuthResult && !loading) ? (
                      <Alert>
                        <InfoIcon className="h-4 w-4" />
                        <AlertTitle>No verification performed</AlertTitle>
                        <AlertDescription>
                          Click "Test Server Authentication" to verify your token with the server
                        </AlertDescription>
                      </Alert>
                    ) : serverAuthResult && (
                      <>
                        <div className="flex items-center space-x-2 mb-4">
                          {serverAuthResult.success ? (
                            <Alert variant="success">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <AlertTitle>Authentication Successful</AlertTitle>
                              <AlertDescription>
                                Your token was successfully verified by the server
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <Alert variant="destructive">
                              <XCircle className="h-4 w-4" />
                              <AlertTitle>Authentication Failed</AlertTitle>
                              <AlertDescription>
                                {serverAuthResult.error || "Unknown error occurred"}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Server Response</Label>
                          <div className="bg-muted rounded-md overflow-x-auto">
                            <JsonView data={serverAuthResult} />
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <Button 
                          onClick={checkAdminPermission} 
                          variant="outline" 
                          disabled={loading || !idToken}
                          className="w-full"
                        >
                          {loading ? "Checking..." : "Check Admin Permission"}
                        </Button>
                        
                        <Button 
                          onClick={grantAdminPermission} 
                          variant="secondary" 
                          disabled={loading || !user}
                          className="w-full mt-2"
                        >
                          {loading ? "Granting..." : "Grant Admin Permission"}
                        </Button>
                        
                        <Button 
                          onClick={checkDirectFirestore} 
                          variant="outline" 
                          disabled={loading || !idToken}
                          className="w-full mt-2 border-amber-500 text-amber-600 hover:bg-amber-50"
                        >
                          {loading ? "Checking..." : "Direct Firestore Admin Check"}
                        </Button>
                        
                        <Button 
                          onClick={checkAdminPermissionDirect} 
                          variant="outline" 
                          disabled={loading || !idToken}
                          className="w-full mt-2 border-green-500 text-green-600 hover:bg-green-50"
                        >
                          {loading ? "Checking..." : "Check Admin (Bypass Method)"}
                        </Button>
                        
                        {adminPermissionCheck && (
                          <div className="mt-4 space-y-2">
                            <Label>Permission Check Result</Label>
                            <Alert variant={adminPermissionCheck.hasPermission ? "success" : "destructive"}>
                              {adminPermissionCheck.hasPermission ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                              <AlertTitle>
                                {adminPermissionCheck.hasPermission ? "Permission Granted" : "Permission Denied"}
                              </AlertTitle>
                              <AlertDescription>
                                {adminPermissionCheck.message}
                              </AlertDescription>
                            </Alert>
                            
                            <div className="bg-muted rounded-md overflow-x-auto">
                              <JsonView data={adminPermissionCheck} />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      onClick={testServerAuth} 
                      disabled={loading || !idToken}
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Test Server Authentication
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="user" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Firebase User Details</CardTitle>
                    <CardDescription>
                      Complete information about the current user
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {currentUserJson ? (
                      <div className="bg-muted rounded-md overflow-x-auto">
                        <JsonView data={currentUserJson} />
                      </div>
                    ) : (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Not Authenticated</AlertTitle>
                        <AlertDescription>
                          No user information available. Please sign in.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
} 