"use client";

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

export function UserInfoCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  if (loading) {
    return (
      <Card className="p-4">
        <CardContent className="p-2">
          <p className="text-center text-muted-foreground">Loading user information...</p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="p-4">
        <CardContent className="p-2">
          <p className="text-center">You are not currently signed in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <CardContent className="p-2">
        <h3 className="font-medium mb-2">Current User</h3>
        <div className="space-y-1 text-sm">
          <p><span className="font-semibold">Email:</span> {user.email}</p>
          <p><span className="font-semibold">UID:</span> {user.uid}</p>
          <p><span className="font-semibold">Email Verified:</span> {user.emailVerified ? 'Yes' : 'No'}</p>
          {user.metadata?.lastSignInTime && (
            <div className="mt-2 flex">
              <Badge variant="outline" className="text-xs">
                Last Login: {format(new Date(user.metadata.lastSignInTime), 'MMM d, yyyy h:mm a')}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 