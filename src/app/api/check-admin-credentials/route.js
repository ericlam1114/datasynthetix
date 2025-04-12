import { NextResponse } from 'next/server';
import { checkFirebaseAdminCredentials } from '@/lib/firebase-admin';

/**
 * API endpoint to check Firebase Admin SDK credentials
 * This returns the status of various credentials without exposing sensitive values
 */
export async function GET() {
  try {
    // Check if Firebase Admin credentials are available
    const hasCredentials = await checkFirebaseAdminCredentials();
    
    // Get credential information without exposing sensitive values
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 
                      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
    
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || null;
    
    // Check if private key is configured without exposing it
    const hasPrivateKey = !!process.env.FIREBASE_ADMIN_PRIVATE_KEY || 
                          !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 
                          !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    // Check if SDK is explicitly disabled
    const isAdminSdkDisabled = process.env.DISABLE_FIREBASE_ADMIN_SDK === 'true';
    
    return NextResponse.json({
      success: true,
      configured: hasCredentials,
      disabled: isAdminSdkDisabled,
      projectId: projectId ? projectId : null,
      clientEmail: clientEmail ? (clientEmail.includes('@') ? 
                 `${clientEmail.split('@')[0].substring(0, 3)}***@${clientEmail.split('@')[1]}` : null) : null,
      privateKeyConfigured: hasPrivateKey,
      environmentMode: process.env.NODE_ENV || 'unknown',
      sdk: {
        available: true,
        notes: isAdminSdkDisabled ? 'Admin SDK is explicitly disabled' : 
               (!hasCredentials && process.env.NODE_ENV === 'development' ? 
               'Admin SDK will use default credentials in development mode' : '')
      }
    });
  } catch (error) {
    console.error('Error checking admin credentials:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      configured: false,
      projectId: null,
      clientEmail: null,
      privateKeyConfigured: false
    }, { status: 500 });
  }
} 