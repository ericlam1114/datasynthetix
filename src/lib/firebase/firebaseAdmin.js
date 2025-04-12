import admin from 'firebase-admin';

// Keep track if we've initialized
let isInitialized = false;

/**
 * Get an initialized Firebase Admin SDK instance
 */
export function getFirebaseAdmin() {
  // Initialize Firebase Admin if not already done
  if (!isInitialized) {
    initializeFirebaseAdmin();
    isInitialized = true;
  }
  
  return {
    db: admin.firestore(),
    auth: admin.auth(),
    storage: admin.storage()
  };
}

/**
 * Initialize Firebase Admin SDK with service account 
 */
function initializeFirebaseAdmin() {
  // If already initialized, don't do it again
  if (admin.apps.length > 0) {
    return;
  }

  console.log("[Firebase Admin] Initializing Firebase Admin with service account");
  
  try {
    // Get private key from environment and properly format it
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    // Create service account using environment variables
    const serviceAccount = {
      "type": "service_account",
      "project_id": process.env.FIREBASE_ADMIN_PROJECT_ID,
      "private_key_id": "3b18923cae93f7931e94e0ccd4397fbe2b2dd6a2",
      "private_key": privateKey,
      "client_email": process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      "client_id": "108772651922362806679",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL
      )}`
    };
    
    // Initialize with explicit credentials
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    console.log("[Firebase Admin] Successfully initialized Firebase Admin");
  } catch (error) {
    console.error("[Firebase Admin] Failed to initialize:", error);
    throw error;
  }
}