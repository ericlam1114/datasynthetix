"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import {
  getUserDocumentsSafe,
  getUserDataSetsSafe,
} from "../../lib/firestoreService";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  FileText,
  Database,
  Upload,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        if (user) {
          const [fetchedDocuments, fetchedDatasets] = await Promise.all([
            getUserDocumentsSafe(user.uid),
            getUserDataSetsSafe(user.uid),
          ]);

          setDocuments(fetchedDocuments);
          setDatasets(fetchedDatasets);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load data. Please try again later.");
      } finally {
        setLoading(false);
        setIsRetrying(false);
      }
    }

    fetchData();
  }, [user, isRetrying]);

  const handleRetry = () => {
    setIsRetrying(true);
  };

  // Simply navigate to the process page with auto-start parameter
  const handleProcessDocument = (docId) => {
    router.push(`/dashboard/process?documentId=${docId}&autoStart=true`);
  };

  const handleDownloadDataset = (filePath) => {
    // Open the download in a new tab/window
    window.open(`/api/process-document?file=${filePath}`, '_blank');
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRetry}
            size="icon"
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button asChild>
            <Link href="/dashboard/upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
            <p className="text-xs text-gray-500">Total documents uploaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Data Sets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{datasets.length}</div>
            <p className="text-xs text-gray-500">
              Generated training data sets
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.5 GB</div>
            <p className="text-xs text-gray-500">Out of 5 GB (Free Plan)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Documents and Datasets */}
      <Tabs defaultValue="documents" className="mt-6">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="datasets">Generated Data Sets</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-6">
          {documents.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No documents yet
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload your first document to get started with synthetic data
                generation
              </p>
              <Button asChild>
                <Link href="/dashboard/upload">Upload Document</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <CardTitle className="truncate">
                      {doc.name || "Untitled Document"}
                    </CardTitle>
                    <CardDescription className="flex items-center text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {doc.createdAt
                        ? new Date(
                            doc.createdAt.seconds * 1000
                          ).toLocaleDateString()
                        : "Date unavailable"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {doc.description || "No description provided"}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleProcessDocument(doc.id)}
                    >
                      Generate Data
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="datasets" className="mt-6">
          {datasets.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No data sets yet
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Process a document to generate your first synthetic data set
              </p>
              <Button asChild>
                <Link href="/dashboard/upload">Upload Document</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {datasets.map((dataset) => (
                <Card key={dataset.id}>
                  <CardHeader>
                    <CardTitle className="truncate">
                      {dataset.name || "Untitled Dataset"}
                    </CardTitle>
                    <CardDescription className="flex items-center text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {dataset.createdAt
                        ? new Date(
                            dataset.createdAt.seconds * 1000
                          ).toLocaleDateString()
                        : "Date unavailable"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-500 mb-2">
                      <span className="font-medium">Entries:</span>{" "}
                      {dataset.entryCount || 0}
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-medium">Source:</span>{" "}
                      {dataset.sourceDocument || "Unknown"}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleDownloadDataset(dataset.filePath)}
                    >
                      Download JSONL
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick Start Guide */}
      {documents.length === 0 && datasets.length === 0 && (
        <Card className="mt-6 bg-indigo-50 border-indigo-100">
          <CardHeader>
            <CardTitle>Quick Start Guide</CardTitle>
            <CardDescription>
              Follow these steps to get started with SynthData AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="font-medium mb-1">Upload a Document</h3>
                <p className="text-sm text-gray-600">
                  Start by uploading a document such as a contract, SOP, or any
                  text-based file.
                </p>
              </div>
            </div>

            <div className="flex">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="font-medium mb-1">Generate Synthetic Data</h3>
                <p className="text-sm text-gray-600">
                  Our AI will extract key statements and generate synthetic
                  variants.
                </p>
              </div>
            </div>

            <div className="flex">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4 flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="font-medium mb-1">Download Your Data</h3>
                <p className="text-sm text-gray-600">
                  Get your JSONL file ready for fine-tuning AI models.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/dashboard/upload">
                Get Started <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}