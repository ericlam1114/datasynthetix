import { NextResponse } from "next/server";
import {
  verifyAuthToken,
  getUserIdFromAuthHeader,
  hasPermission,
} from "@/lib/auth/authUtils";
import { getFirebaseAdmin } from "@/lib/firebase/firebaseAdmin";

/**
 * API endpoint to check if a user has a specific permission
 * @param {Request} request - The HTTP request
 * @returns {Promise<NextResponse>} The HTTP response
 *
 */

console.log("[Permission API] Environment check:", {
  disableFirebaseAdmin: process.env.DISABLE_FIREBASE_ADMIN_SDK,
  bypassDocumentPermissions: process.env.BYPASS_DOCUMENT_PERMISSIONS,
  nodeEnv: process.env.NODE_ENV,
});
export async function GET(request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const permissionToCheck = searchParams.get("permission");
    const bypassPermissionSystem = searchParams.get("bypass") === "true";

    if (!permissionToCheck) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing 'permission' parameter",
          hasPermission: false,
        },
        { status: 400 }
      );
    }

    // Get user ID from auth header
    const userId = await getUserIdFromAuthHeader(request.headers);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication failed or invalid token",
          hasPermission: false,
        },
        { status: 401 }
      );
    }

    // First try normal permission check system
    let userHasPermission = false;
    let permissionMethod = "standard";
    let directCheckData = null;

    if (!bypassPermissionSystem) {
      // Check if user has the requested permission using our hasPermission utility
      userHasPermission = await hasPermission(userId, permissionToCheck);
    }

    // If permission check failed or bypass is requested, try direct Firestore check as fallback
    // If permission check failed or bypass is requested, try direct Firestore check as fallback
    // If permission check failed or bypass is requested, try direct Firestore check as fallback
    // If permission check failed or bypass is requested, try direct Firestore check as fallback
if (bypassPermissionSystem || !userHasPermission) {
    try {
      console.log(`[Permission API] Performing direct Firestore check for user ${userId}`);
      console.log(`[Direct Check] Starting direct check with bypass = ${bypassPermissionSystem}`);
      
      // Try with mock data if in development and bypass is requested
      if (process.env.NODE_ENV !== 'production' && bypassPermissionSystem) {
        console.log('[Direct Check] Using development bypass mode');
        
        // Hardcoded admin check for development
        userHasPermission = true;
        permissionMethod = "development-bypass";
        directCheckData = {
          isAdmin: true,
          hasPermissionArray: true,
          permissionsLength: 1,
          permissionsContent: ["admin"]
        };
      } else {
        // Regular Firebase check
        const { db } = getFirebaseAdmin();
        console.log('[Direct Check] Firestore instance obtained:', !!db);
        
        // Simple get without options
        const userDoc = await db.collection("users").doc(userId).get();
        console.log('[Direct Check] User doc exists:', userDoc?.exists);
        
        if (userDoc?.exists) {
          const userData = userDoc.data();
          console.log('[Direct Check] User data:', JSON.stringify({
            uid: userId,
            isAdmin: userData?.isAdmin,
            permissions: userData?.permissions
          }));
          
          directCheckData = {
            isAdmin: userData.isAdmin === true,
            hasPermissionArray: Array.isArray(userData.permissions),
            permissionsLength: Array.isArray(userData.permissions) ? userData.permissions.length : 0,
            permissionsContent: Array.isArray(userData.permissions) ? userData.permissions : []
          };
          
          // Direct check: if isAdmin is true or permission is in array
          if (userData.isAdmin === true) {
            userHasPermission = true;
            permissionMethod = "direct-admin-field";
          } else if (userData.permissions && 
                    Array.isArray(userData.permissions) && 
                    userData.permissions.includes(permissionToCheck)) {
            userHasPermission = true;
            permissionMethod = "direct-permissions-array";
          }
        }
      }
    } catch (directCheckError) {
      console.error("Error during direct permission check:", directCheckError);
      
      // If all else fails and we're in dev with bypass, just grant permission
      if (process.env.NODE_ENV !== 'production' && bypassPermissionSystem) {
        console.log('[Direct Check] Error occurred but using development bypass');
        userHasPermission = true;
        permissionMethod = "error-bypass-dev";
      }
    }
  }

    return NextResponse.json({
      success: true,
      hasPermission: userHasPermission,
      userId,
      permission: permissionToCheck,
      method: permissionMethod,
      bypassRequested: bypassPermissionSystem,
      directCheckData,
      message: userHasPermission
        ? `User has '${permissionToCheck}' permission (via ${permissionMethod})`
        : `User does not have '${permissionToCheck}' permission`,
    });
  } catch (error) {
    console.error("Error checking permission:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
        hasPermission: false,
      },
      { status: 500 }
    );
  }
}
