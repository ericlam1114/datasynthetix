import { NextResponse } from 'next/server';
import { firestore } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAdmin } from '@/lib/firebase/firebaseAdmin';
import { getUserIdFromAuthHeader } from '@/lib/auth/authUtils';

/**
 * API endpoint to directly check admin status in Firestore
 * This bypasses the permission system to help diagnose issues
 * @param {Request} request - The HTTP request
 * @returns {Promise<NextResponse>} The HTTP response
 */
export async function GET(request) {
  try {
    // Get user ID from auth header
    const userId = await getUserIdFromAuthHeader(request.headers);
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: "Authentication failed or invalid token",
        isAdmin: false
      }, { status: 401 });
    }

    // Method 1: Check directly with client-side Firebase SDK
    try {
      console.log(`Checking user ${userId} with client-side Firebase SDK`);
      const userDocRef = doc(firestore, "users", userId);
      const userSnapshot = await getDoc(userDocRef);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.data();
        console.log("Client SDK User data:", JSON.stringify(userData, null, 2));
      } else {
        console.log("Client SDK: No user document found");
      }
    } catch (clientError) {
      console.error("Error with client SDK check:", clientError);
    }
    
    // Method 2: Check with Admin SDK
    let adminData = null;
    let adminCheckResult = false;
    
    try {
      console.log(`Checking user ${userId} with Admin SDK`);
      const admin = getFirebaseAdmin();
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists) {
        adminData = userDoc.data();
        console.log("Admin SDK User data:", JSON.stringify(adminData, null, 2));
        
        // Direct check of isAdmin field
        if (adminData.isAdmin === true) {
          adminCheckResult = true;
        }
        // Check permissions array
        else if (adminData.permissions && Array.isArray(adminData.permissions) && 
                 adminData.permissions.includes('admin')) {
          adminCheckResult = true;
        }
      } else {
        console.log("Admin SDK: No user document found");
      }
    } catch (adminError) {
      console.error("Error with Admin SDK check:", adminError);
    }
    
    return NextResponse.json({
      success: true,
      userId,
      adminData,
      checkResult: adminCheckResult,
      timestamp: new Date().toISOString(),
      message: adminCheckResult 
        ? "Admin access verified directly in Firestore" 
        : "No admin access found directly in Firestore"
    });
    
  } catch (error) {
    console.error('Error in direct admin check:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
} 