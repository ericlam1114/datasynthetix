import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { getUserDocumentsSafe, deleteDocument } from "../lib/firestoreService";
import DocumentCard from "./DocumentCard"; // Using the enhanced component we created
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { RefreshCw, FileText, AlertCircle } from "lucide-react";

export default function DocumentList() {
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState({ message: "", type: "" });

  useEffect(() => {
    fetchDocuments();
  }, [user, isRetrying]);

  async function fetchDocuments() {
    try {
      setLoading(true);
      setError(null);

      if (user) {
        const fetchedDocuments = await getUserDocumentsSafe(user.uid);
        setDocuments(fetchedDocuments);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      setError("Failed to load documents. Please try again later.");
    } finally {
      setLoading(false);
      setIsRetrying(false);
    }
  }

  const handleRetry = () => {
    setIsRetrying(true);
  };

  const handleGenerateData = async (documentId) => {
    try {
      // Show loading state
      setIsGenerating(documentId);

      // Generate a temporary job ID client-side
      const tempJobId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Immediately route to the processing page with the temporary job ID
      router.push(
        `/dashboard/process?tempJobId=${tempJobId}&documentId=${documentId}&startProcessing=true`
      );
      
      // No need to wait here for the API call, as it will be handled on the process page
    } catch (error) {
      console.error("Error redirecting to processing page:", error);
      setProcessingError("An unexpected error occurred");

      // Clear error after 5 seconds
      setTimeout(() => {
        setProcessingError(null);
      }, 5000);
      
      // Reset loading state
      setIsGenerating(null);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    try {
      setDeleteStatus({ message: "Deleting document...", type: "info" });

      await deleteDocument(documentId);

      // Update the local state to remove the deleted document
      setDocuments(documents.filter((doc) => doc.id !== documentId));

      setDeleteStatus({
        message: "Document deleted successfully",
        type: "success",
      });

      // Clear the status message after 3 seconds
      setTimeout(() => {
        setDeleteStatus({ message: "", type: "" });
      }, 3000);
    } catch (error) {
      console.error("Error deleting document:", error);
      setDeleteStatus({
        message: "Failed to delete document. Please try again.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-lg border border-red-200 text-red-800">
        <div className="flex items-center mb-4">
          <AlertCircle className="h-6 w-6 mr-2" />
          <div>{error}</div>
        </div>
        <Button onClick={handleRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      {deleteStatus.message && (
        <Alert
          className={`mb-6 ${
            deleteStatus.type === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : deleteStatus.type === "error"
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          <AlertDescription>{deleteStatus.message}</AlertDescription>
        </Alert>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No data sets yet
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload your first document to get started with synthetic data
            generation
          </p>
          <Button onClick={() => router.push("/dashboard/upload")}>
            Upload Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              title={doc.name || doc.fileName || "Untitled Document"}
              date={
                doc.createdAt?.seconds
                  ? new Date(doc.createdAt.seconds * 1000).toISOString()
                  : null
              }
              description={doc.description}
              onDelete={handleDeleteDocument}
              onGenerateData={handleGenerateData}
              isGenerating={isGenerating === doc.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
