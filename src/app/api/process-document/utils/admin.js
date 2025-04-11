// src/app/api/process-document/utils/admin.js
import { auth } from "../../../../lib/firebase";
import {
  initializeAdminApp,
  getAdminFirestore,
  getAdminStorage,
} from "../../../../lib/firebase-admin";

// Dynamically import Firebase Admin Auth
let adminAuthModule;
try {
  adminAuthModule = require("firebase-admin/auth");
} catch (error) {
  console.warn("Firebase Admin Auth module not available:", error.message);
  adminAuthModule = { getAuth: () => null };
}

const { getAuth } = adminAuthModule;

/**
 * Checks if Firebase Admin credentials are properly configured
 * @returns {boolean} True if credentials are configured, false otherwise
 */
export function hasFirebaseAdminCredentials() {
  const hasProjectId = !!process.env.FIREBASE_ADMIN_PROJECT_ID;
  const hasClientEmail = !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const hasPrivateKey = !!process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const isConfigured = hasProjectId && hasClientEmail && hasPrivateKey;

  if (!isConfigured && process.env.NODE_ENV === "development") {
    console.warn("Firebase Admin SDK is not fully configured:");
    if (!hasProjectId) console.warn("- Missing FIREBASE_ADMIN_PROJECT_ID");
    if (!hasClientEmail) console.warn("- Missing FIREBASE_ADMIN_CLIENT_EMAIL");
    if (!hasPrivateKey) console.warn("- Missing FIREBASE_ADMIN_PRIVATE_KEY");
    console.warn("Add these to your .env.local file to enable server-side Firebase authentication");
  }

  return isConfigured;
}

/**
 * Gets an admin auth instance
 * @returns {Object|null} Admin auth instance or null
 */
export async function getAdminAuth() {
  try {
    const app = await initializeAdminApp();
    if (!app) return null;
    return getAuth(app);
  } catch (error) {
    console.error("Failed to get Admin Auth:", error);
    return null;
  }
}

/**
 * Verifies an auth token using the admin SDK
 * @param {string} token - The token to verify
 * @returns {Object} The decoded token
 */
export async function verifyAuthToken(token) {
  try {
    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      console.warn("Admin Auth not available for token verification");
      // Fall back to client auth
      return auth.verifyIdToken(token);
    }

    return adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Token verification failed:", error);
    throw error;
  }
}

/**
 * Verifies that Firebase Admin credentials are available
 * @returns {Promise<boolean>} True if credentials are available, false otherwise
 */
export async function checkFirebaseAdminCredentials() {
  try {
    const adminDb = await getAdminFirestore();
    return !!adminDb;
  } catch (error) {
    console.error("Firebase Admin credentials check failed:", error);
    return false;
  }
}