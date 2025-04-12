import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { firestore } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { checkFirebaseAdminCredentials } from '@/lib/fix-firebase-key';

/**
 * API endpoint to debug Firebase Admin SDK issues
 */
export async function GET(request) {
  const credentialStatus = checkFirebaseAdminCredentials();
  
  const debugInfo = {
    clientSdk: {
      available: !!firestore,
      status: 'unknown'
    },
    adminSdk: {
      available: false,
      status: 'unknown',
      error: null,
      keyFormatterDiagnostics: credentialStatus,
      envVars: {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ? 'set' : 'missing',
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ? 'set' : 'missing',
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY ? 'set' : 'missing',
        privateKeyFirstChars: process.env.FIREBASE_ADMIN_PRIVATE_KEY 
          ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.substring(0, 30) + '...' 
          : 'none',
        privateKeyFormat: process.env.FIREBASE_ADMIN_PRIVATE_KEY && 
                         process.env.FIREBASE_ADMIN_PRIVATE_KEY.includes('\\n') 
          ? 'contains \\n (needs conversion)' 
          : 'no \\n detected'
      },
      userDocument: null,
      userDocPath: 'users/YlCzr5g4Xjc45c7z8fLtnO9LR1F3'
    }
  };

  // Check client SDK
  try {
    const userDocRef = doc(firestore, "users", "YlCzr5g4Xjc45c7z8fLtnO9LR1F3");
    const userSnapshot = await getDoc(userDocRef);
    
    if (userSnapshot.exists()) {
      debugInfo.clientSdk.status = 'success';
      debugInfo.clientSdk.data = userSnapshot.data();
    } else {
      debugInfo.clientSdk.status = 'document not found';
    }
  } catch (clientError) {
    debugInfo.clientSdk.status = 'error';
    debugInfo.clientSdk.error = clientError.message;
  }

  // Check Admin SDK
  try {
    const admin = initFirebaseAdmin();
    if (admin) {
      debugInfo.adminSdk.available = true;
      
      try {
        const db = admin.firestore();
        if (db) {
          debugInfo.adminSdk.status = 'firestore initialized';
          
          try {
            const userDoc = await db.collection('users').doc('YlCzr5g4Xjc45c7z8fLtnO9LR1F3').get();
            
            if (userDoc.exists) {
              debugInfo.adminSdk.status = 'document found';
              debugInfo.adminSdk.userDocument = userDoc.data();
            } else {
              debugInfo.adminSdk.status = 'document not found';
            }
          } catch (docError) {
            debugInfo.adminSdk.status = 'firestore read error';
            debugInfo.adminSdk.error = docError.message;
          }
        } else {
          debugInfo.adminSdk.status = 'firestore not initialized';
        }
      } catch (firestoreError) {
        debugInfo.adminSdk.status = 'firestore error';
        debugInfo.adminSdk.error = firestoreError.message;
      }
    } else {
      debugInfo.adminSdk.status = 'not initialized';
    }
  } catch (adminError) {
    debugInfo.adminSdk.status = 'error initializing';
    debugInfo.adminSdk.error = adminError.message;
  }

  return NextResponse.json(debugInfo);
} 