// src/app/dashboard/settings/page.js

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { firestore } from '../../../lib/firebase';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Switch } from '../../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Save, User, Bell, Shield, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, updatePassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    company: '',
    role: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notifications, setNotifications] = useState({
    email: true,
    processingComplete: true,
    creditWarning: true,
    newFeatures: false
  });
  const [appearance, setAppearance] = useState({
    theme: 'system',
    density: 'comfortable'
  });

  useEffect(() => {
    async function fetchUserData() {
      try {
        setLoading(true);
        
        if (user) {
          const userDoc = await getDoc(doc(firestore, 'users', user.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            setProfile({
              name: userData.name || '',
              email: user.email || '',
              company: userData.company || '',
              role: userData.role || ''
            });
            
            setNotifications({
              email: userData.notifications?.email !== false,
              processingComplete: userData.notifications?.processingComplete !== false,
              creditWarning: userData.notifications?.creditWarning !== false,
              newFeatures: userData.notifications?.newFeatures === true
            });
            
            setAppearance({
              theme: userData.appearance?.theme || 'system',
              density: userData.appearance?.density || 'comfortable'
            });
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to load user settings. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchUserData();
  }, [user]);

  const handleUpdateProfile = async () => {
    try {
      setSaveLoading(true);
      setError('');
      setSuccess('');
      
      if (!user) return;
      
      const userRef = doc(firestore, 'users', user.uid);
      
      await updateDoc(userRef, {
        name: profile.name,
        company: profile.company,
        updatedAt: new Date()
      });
      
      setSuccess('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    try {
      setSaveLoading(true);
      setError('');
      setSuccess('');
      
      if (!newPassword || !confirmPassword) {
        setError('Please fill in all password fields');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      
      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      
      await updatePassword(newPassword);
      
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully!');
    } catch (error) {
      console.error('Error updating password:', error);
      setError('Failed to update password. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateNotifications = async () => {
    try {
      setSaveLoading(true);
      setError('');
      setSuccess('');
      
      if (!user) return;
      
      const userRef = doc(firestore, 'users', user.uid);
      
      await updateDoc(userRef, {
        notifications: notifications,
        updatedAt: new Date()
      });
      
      setSuccess('Notification preferences updated successfully!');
    } catch (error) {
      console.error('Error updating notifications:', error);
      setError('Failed to update notifications. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateAppearance = async () => {
    try {
      setSaveLoading(true);
      setError('');
      setSuccess('');
      
      if (!user) return;
      
      const userRef = doc(firestore, 'users', user.uid);
      
      await updateDoc(userRef, {
        appearance: appearance,
        updatedAt: new Date()
      });
      
      setSuccess('Appearance settings updated successfully!');
    } catch (error) {
      console.error('Error updating appearance:', error);
      setError('Failed to update appearance. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {/* <TabsTrigger value="appearance">Appearance</TabsTrigger> */}
        </TabsList>
        
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input 
                  id="name" 
                  placeholder="Your name" 
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="Your email" 
                  value={profile.email}
                  disabled
                />
                <p className="text-xs text-gray-500">
                  Email cannot be changed directly. Please contact support.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="company">Company/Organization</Label>
                <Input 
                  id="company" 
                  placeholder="Your company" 
                  value={profile.company}
                  onChange={(e) => setProfile({...profile, company: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input 
                  id="role" 
                  placeholder="Your role" 
                  value={profile.role === 'admin' ? 'Administrator' : profile.role || ''}
                  disabled={profile.role === 'admin'}
                  onChange={(e) => setProfile({...profile, role: e.target.value})}
                />
                {profile.role === 'admin' && (
                  <p className="text-xs text-gray-500 flex items-center">
                    <Shield className="h-3 w-3 mr-1 text-red-600" />
                    Administrator role cannot be changed
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={saveLoading}>
                {saveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Update your password and security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input 
                  id="newPassword" 
                  type="password" 
                  placeholder="Enter new password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  placeholder="Confirm new password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdatePassword} disabled={saveLoading}>
                {saveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Update Password
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Control how and when you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch 
                    id="email-notifications" 
                    checked={notifications.email}
                    onCheckedChange={(checked) => 
                      setNotifications({...notifications, email: checked})
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="processing-complete">Processing Complete</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when document processing is complete
                    </p>
                  </div>
                  <Switch 
                    id="processing-complete" 
                    checked={notifications.processingComplete}
                    onCheckedChange={(checked) => 
                      setNotifications({...notifications, processingComplete: checked})
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="credit-warning">Credit Warnings</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when your credit balance is low
                    </p>
                  </div>
                  <Switch 
                    id="credit-warning" 
                    checked={notifications.creditWarning}
                    onCheckedChange={(checked) => 
                      setNotifications({...notifications, creditWarning: checked})
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="new-features">New Features</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about new platform features and updates
                    </p>
                  </div>
                  <Switch 
                    id="new-features" 
                    checked={notifications.newFeatures}
                    onCheckedChange={(checked) => 
                      setNotifications({...notifications, newFeatures: checked})
                    }
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateNotifications} disabled={saveLoading}>
                {saveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Preferences
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select 
                  value={appearance.theme} 
                  onValueChange={(value) => setAppearance({...appearance, theme: value})}
                >
                  <SelectTrigger id="theme">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="density">Density</Label>
                <Select 
                  value={appearance.density} 
                  onValueChange={(value) => setAppearance({...appearance, density: value})}
                >
                  <SelectTrigger id="density">
                    <SelectValue placeholder="Select density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateAppearance} disabled={saveLoading}>
                {saveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}