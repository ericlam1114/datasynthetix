"use client";

import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { initializeApp } from '@/lib/firebase';

export default function AuthTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Initialize Firebase and listen for auth state changes
  useEffect(() => {
    const app = initializeApp();
    const auth = getAuth(app);
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    
    return () => unsubscribe();
  }, []);

  const testAuthentication = async () => {
    if (!currentUser) {
      setError('You must be logged in to test authentication');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      // Get the current user's ID token
      const auth = getAuth();
      const idToken = await auth.currentUser.getIdToken();
      
      // Call the auth-test API endpoint
      const response = await fetch('/api/auth-test', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Authentication test failed');
      }
      
      setResult(data);
    } catch (err) {
      console.error('Error testing authentication:', err);
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Authentication Test</CardTitle>
          <CardDescription>
            Test the authentication utilities to verify token handling and permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User status */}
          <div className="p-4 bg-muted rounded-md">
            <h3 className="font-medium mb-2">Current User Status</h3>
            {currentUser ? (
              <div>
                <p><span className="font-semibold">Email:</span> {currentUser.email}</p>
                <p><span className="font-semibold">UID:</span> {currentUser.uid}</p>
                <p><span className="font-semibold">Email Verified:</span> {currentUser.emailVerified ? 'Yes' : 'No'}</p>
              </div>
            ) : (
              <p>You are not currently logged in.</p>
            )}
          </div>
          
          {/* Test button */}
          <div className="flex justify-center">
            <Button 
              onClick={testAuthentication} 
              disabled={loading || !currentUser}
              className="w-full max-w-xs"
            >
              {loading ? 'Testing...' : 'Test Authentication'}
            </Button>
          </div>
          
          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Authentication Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Test results */}
          {result && (
            <div className="border rounded-md p-4">
              <h3 className="font-semibold text-lg mb-3">Authentication Results</h3>
              <div className="space-y-2">
                <div className="p-2 bg-muted rounded">
                  <span className="font-medium">Success:</span> {result.success ? 'Yes' : 'No'}
                </div>
                <div className="p-2 bg-muted rounded">
                  <span className="font-medium">Authenticated:</span> {result.authenticated ? 'Yes' : 'No'}
                </div>
                <div className="p-2 bg-muted rounded">
                  <span className="font-medium">User ID:</span> {result.userId || 'Not available'}
                </div>
                <div className="p-2 bg-muted rounded">
                  <span className="font-medium">Has Admin Permission:</span> {result.hasAdminPermission ? 'Yes' : 'No'}
                </div>
                
                {result.tokenInfo && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Token Information</h4>
                    <div className="bg-muted p-3 rounded overflow-auto">
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(result.tokenInfo, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 