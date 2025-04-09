'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

export default function RouteGuard({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);

  useEffect(() => {
    // Handle the case where authentication check is taking too long
    const timeoutId = setTimeout(() => {
      setAuthTimeout(true);
    }, 5000); // 5 second timeout

    if (!loading) {
      clearTimeout(timeoutId);
      setAuthChecked(true);
      
      if (!user) {
        router.push('/login');
      }
    }

    return () => clearTimeout(timeoutId);
  }, [loading, user, router]);

  // If we've been waiting too long, but the user object exists in localStorage,
  // we'll proceed anyway and assume Firestore is having connectivity issues
  useEffect(() => {
    if (authTimeout) {
      // Check if we have any auth data in localStorage
      const hasLocalAuth = localStorage.getItem('firebase:authUser');
      if (hasLocalAuth) {
        setAuthChecked(true);
      } else {
        router.push('/login');
      }
    }
  }, [authTimeout, router]);

  // Show a loading state while checking authentication
  if (!authChecked && !authTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Show a different message if authentication is taking too long
  if (!authChecked && authTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-600">Taking longer than usual. Still trying to connect...</p>
      </div>
    );
  }

  // If we've decided auth is good enough (either user object or localStorage backup),
  // render the children
  return authChecked ? <>{children}</> : null;
}