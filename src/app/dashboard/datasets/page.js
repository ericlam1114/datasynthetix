// Create this file at: src/app/dashboard/datasets/page.js

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDataSetsSafe } from '../../../lib/firestoreService';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../../../components/ui/table';
import { ArrowLeft, Database, Download, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

export default function DatasetsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (user) {
      loadDatasets();
    }
  }, [user]);

  async function loadDatasets() {
    try {
      setLoading(true);
      setError(null);

      const db = getFirestore();
      const q = query(
        collection(db, "datasets"),
        where("userId", "==", user.uid)
      );

      const querySnapshot = await getDocs(q);
      const datasetsData = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        datasetsData.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        });
      });

      // Sort by creation date, newest first
      datasetsData.sort((a, b) => b.createdAt - a.createdAt);
      
      setDatasets(datasetsData);
    } catch (err) {
      console.error("Error loading datasets:", err);
      setError("Failed to load datasets. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleRetry = () => {
    setIsRetrying(true);
  };

  const handleDownload = (url) => {
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleRefresh = () => {
    loadDatasets();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mr-2"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">My Datasets</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mr-2"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">My Datasets</h1>
        </div>
        <div className="p-6 bg-red-50 rounded-lg border border-red-200 text-red-800">
          <div className="flex items-center mb-4">
            <AlertCircle className="h-6 w-6 mr-2" />
            <div>{error}</div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No datasets available
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Generate data from your documents to create datasets
        </p>
        <Button onClick={() => router.push("/dashboard")}>
          View Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mr-2"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">My Datasets</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRetry} size="icon" title="Refresh data">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => router.push('/dashboard/upload')}>
            <FileText className="h-4 w-4 mr-2" />
            Create Dataset
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Processed Datasets</CardTitle>
          <CardDescription>
            Download and manage your generated training data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source Document</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell className="font-medium">{dataset.name}</TableCell>
                  <TableCell>{dataset.sourceDocument || "Unknown"}</TableCell>
                  <TableCell>{dataset.entryCount || 0}</TableCell>
                  <TableCell>{dataset.outputFormat?.toUpperCase() || "JSONL"}</TableCell>
                  <TableCell>
                    {dataset.createdAt ? 
                      new Date(dataset.createdAt.seconds * 1000).toLocaleDateString() : 
                      "Date unavailable"}
                  </TableCell>
                  <TableCell>
                    {dataset.jsonlUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(dataset.jsonlUrl)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.href = `/api/datasets/download?id=${dataset.id}`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="bg-gray-50 border-t">
          <p className="text-sm text-gray-500">
            Processed datasets are ready for fine-tuning with various AI models
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}