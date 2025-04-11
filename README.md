This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Firebase Configuration

### Client-Side Firebase

The application uses Firebase for authentication and data storage. You'll need to set up Firebase credentials in your `.env.local` file:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Firebase Admin SDK (Server-Side)

For server-side API routes to properly authenticate with Firebase, you need to set up Firebase Admin SDK credentials. Create a service account in the Firebase console and add the following to your `.env.local` file:

```
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account-email
FIREBASE_ADMIN_PRIVATE_KEY="your-private-key"
```

Note: The private key should include the full key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`, and must be enclosed in quotes.

To create a Firebase service account:
1. Go to the Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Extract the values and add them to your `.env.local` file

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# DataSynthetix

## Setting Up AWS S3 for File Storage

For production environments, the application uses S3 as a backup storage option if Firebase Storage fails. Here's how to set it up:

1. **Create an S3 bucket**:
   - Log in to your AWS Management Console
   - Navigate to S3 and click "Create bucket"
   - Choose a unique name for your bucket (this will be used in `AWS_S3_BUCKET`)
   - Select the region closest to your users (will be used in `AWS_REGION`)
   - Configure bucket settings as needed (consider enabling versioning)
   - Set appropriate permissions (usually blocking public access is recommended)
   - Complete the bucket creation

2. **Create an IAM user with S3 access**:
   - Go to IAM in the AWS console
   - Create a new user with programmatic access
   - Attach the `AmazonS3FullAccess` policy (or create a custom policy for specific S3 actions on your bucket)
   - Save the Access Key ID and Secret Access Key that are displayed

3. **Configure CORS for your bucket** (if you need to access files directly from the browser):
   - In the S3 bucket settings, find the CORS configuration
   - Add a configuration similar to:
     ```json
     [
       {
         "AllowedHeaders": ["*"],
         "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
         "AllowedOrigins": ["https://your-domain.com"],
         "ExposeHeaders": ["ETag"]
       }
     ]
     ```

4. **Add S3 credentials to your environment variables**:
   - Add the following to your `.env.local` file (in production, set these in your hosting platform):
     ```
     AWS_REGION=your-selected-region
     AWS_S3_BUCKET=your-bucket-name
     AWS_ACCESS_KEY_ID=your-access-key-id
     AWS_SECRET_ACCESS_KEY=your-secret-access-key
     ```

5. **Optional: Set up CloudFront for CDN access**:
   - Create a CloudFront distribution pointing to your S3 bucket
   - Configure origin access identity to secure your S3 bucket
   - After setup, add the CloudFront URL to `AWS_S3_PUBLIC_URL` in your environment variables
     ```
     AWS_S3_PUBLIC_URL=https://your-distribution-id.cloudfront.net
     ```

With these settings in place, the application will now:
1. Try to save files to Firebase Storage first
2. Fall back to S3 if Firebase fails
3. Only use local storage in development environments

This ensures reliable file storage in production environments across all deployment platforms.

## File Upload System

The system includes a robust file upload mechanism that supports both direct uploads and chunked uploads for large files. This ensures efficient handling of documents of various sizes.

### Upload Endpoints

1. **Standard Upload**: `/api/upload`
   - Handles regular file uploads using multipart/form-data
   - Suitable for files smaller than 10MB
   - Returns a document ID and job ID for tracking

2. **Chunked Upload**:
   - For large files (>10MB), the system uses chunked uploading
   - `/api/upload/init` - Initializes a chunked upload and returns an uploadId
   - `/api/upload/chunk` - Handles individual chunk uploads
   - Progress tracking is available through the job status

### Storage Options

Files are stored with fallback options:

1. Firebase Storage (primary)
2. AWS S3 (fallback if Firebase is unavailable)
3. Local filesystem (development environment only)

### Progress Tracking

All uploads create job entries in Firestore that track:
- Upload progress
- Current processing stage
- Error states (if any)
- Final document location

### Example Usage (Client-Side)

For regular uploads:

```javascript
const formData = new FormData();
formData.append('file', fileObject);
formData.append('name', 'My Document');

const response = await fetch('/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { documentId, jobId } = await response.json();
```

For chunked uploads:

```javascript
// Initialize upload
const initResponse = await fetch('/api/upload/init', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    fileSize: file.size
  })
});

const { uploadId, totalChunks, chunkSize } = await initResponse.json();

// Upload each chunk
for (let i = 0; i < totalChunks; i++) {
  const start = i * chunkSize;
  const end = Math.min(file.size, start + chunkSize);
  const chunk = file.slice(start, end);
  
  const chunkFormData = new FormData();
  chunkFormData.append('file', chunk, 'chunk');
  
  await fetch(`/api/upload/chunk?uploadId=${uploadId}&chunkIndex=${i}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: chunkFormData
  });
}
```
