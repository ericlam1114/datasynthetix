// src/app/api/cancel-job/route.js
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAdminFirestore } from "../../../lib/firebase-admin";

// Accept POST requests to cancel a job
export async function POST(request) {
  try {
    const data = await request.json();
    const { jobId, userId } = data;

    console.log(`Attempting to cancel job: ${jobId} for user: ${userId}`);

    if (!jobId || !userId) {
      return NextResponse.json(
        { error: "Job ID and User ID are required" },
        { status: 400 }
      );
    }

    try {
      // Use the admin Firestore SDK for server-side operations
      const adminFirestore = await getAdminFirestore();
      
      if (!adminFirestore) {
        console.error("Admin Firestore SDK is not available");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
      }
      
      // Query for the job using admin SDK
      const jobsRef = adminFirestore.collection("processingJobs");
      const jobQuery = await jobsRef
        .where("jobId", "==", jobId)
        .where("userId", "==", userId)
        .limit(1)
        .get();
      
      if (jobQuery.empty) {
        console.log(`Job not found for jobId: ${jobId}, userId: ${userId}`);
        return NextResponse.json(
          { error: "Job not found or you don't have permission to cancel it" },
          { status: 404 }
        );
      }

      const jobDoc = jobQuery.docs[0];
      const job = jobDoc.data();
      console.log(`Found job, status: ${job.status}, id: ${jobDoc.id}`);

      // Delete the job completely from Firestore instead of just updating status
      await adminFirestore.collection("processingJobs").doc(jobDoc.id).delete();
      console.log(`Successfully deleted job from Firestore`);

      // Try to clean up any associated output files in the uploads directory
      let cleanupSuccess = false;
      
      if (job.outputFilePath) {
        try {
          // Check if this is a server-side file (in uploads directory)
          const uploadsDir = path.join(process.cwd(), "uploads");
          console.log(`Checking for file in uploads directory: ${uploadsDir}`);
          
          const fileParts = job.outputFilePath.split("/");
          // Handle cases where the path might not have exactly 2 parts
          const fileName = fileParts.pop();
          const userPath = fileParts.join("/");
          
          const filePath = path.join(uploadsDir, userPath, fileName);
          console.log(`Attempting to access file at: ${filePath}`);
          
          try {
            await fs.access(filePath);
            // File exists, delete it
            await fs.unlink(filePath);
            cleanupSuccess = true;
            console.log(`Successfully deleted file: ${filePath}`);
          } catch (fileError) {
            console.log(`Output file not found in uploads directory: ${fileError.message}`);
          }
        } catch (cleanupError) {
          console.error(`Error cleaning up output file: ${cleanupError.message}`);
          // Continue execution even if cleanup fails
        }
      }

      // For Firebase Storage file deletion, we'd need to use the Admin Storage SDK
      // This part is simplified as we focus on fixing the immediate issue
      if (job.filePath) {
        try {
          console.log(`Would delete file from Firebase Storage: ${job.filePath}`);
          // The proper implementation would use the Admin Storage SDK, 
          // but we'll skip this for now as the main issue is with Firestore
        } catch (storageError) {
          console.error(`Error with storage file: ${storageError.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Job successfully deleted",
        cleanupStatus: cleanupSuccess ? "File cleanup successful" : "No files deleted",
      });
    } catch (firebaseError) {
      console.error(`Firebase operation error: ${firebaseError.message}`);
      console.error(firebaseError.stack);
      return NextResponse.json(
        { error: "Firebase operation failed", message: firebaseError.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`Error cancelling job: ${error.message}`);
    console.error(error.stack);
    return NextResponse.json(
      {
        error: "Failed to cancel job",
        message: error.message,
      },
      { status: 500 }
    );
  }
}