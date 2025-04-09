'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database } from 'lucide-react';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  async function handleResetPassword(e) {
    e.preventDefault();
    
    try {
      setMessage('');
      setError('');
      setLoading(true);
      await resetPassword(email);
      setMessage('Check your email for password reset instructions');
    } catch (error) {
      setError('Failed to reset password. ' + error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Database className="h-12 w-12 text-indigo-600" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">SynthData AI</h2>
          <p className="mt-2 text-gray-600">Reset your password</p>
        </div>
        
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Password Reset</CardTitle>
            <CardDescription className="text-center">
              Enter your email to receive a password reset link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {message && (
              <Alert className="mb-4 bg-green-50 text-green-800 border-green-200">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Reset Password'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-gray-600">
              Remember your password?{' '}
              <Link href="/login" className="text-indigo-600 hover:text-indigo-500">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}