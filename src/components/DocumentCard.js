import { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '../components/ui/alert-dialog';
import { Trash2, FileText, Download } from 'lucide-react';
import GenerateDataModal from './GenerateDataModal';

// This component adds a delete button and confirmation dialog to document cards
export default function DocumentCard({ 
  id, 
  title, 
  date, 
  description = "No description provided",
  onDelete,
  onGenerateData,
  datasetId = null,
  jsonlUrl = null
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(jsonlUrl);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  // If datasetId is provided but no jsonlUrl, try to fetch the download URL
  useEffect(() => {
    if (datasetId && !jsonlUrl && !downloadUrl) {
      fetchDownloadUrl();
    }
  }, [datasetId, jsonlUrl, downloadUrl]);

  const fetchDownloadUrl = async () => {
    try {
      const response = await fetch(`/api/datasets/download?id=${datasetId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.downloadUrl) {
          setDownloadUrl(data.downloadUrl);
        }
      }
    } catch (error) {
      console.error('Error fetching download URL:', error);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(id);
    } catch (error) {
      console.error('Error deleting document:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open the generate data modal
  const handleGenerateClick = () => {
    console.log("DocumentCard: Opening generate data modal");
    setIsGenerateModalOpen(true);
  };

  // Handle Generate Data confirmation from modal
  const handleGenerateConfirm = async (documentId, options) => {
    console.log("DocumentCard: Generate data confirmed with options:", options);
    if (onGenerateData) {
      setIsGenerating(true);
      try {
        console.log(`DocumentCard: Calling onGenerateData with documentId=${documentId}, title=${title}, options:`, options);
        await onGenerateData(documentId, title, options);
      } catch (error) {
        console.error('Error generating data:', error);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  // Handle Download button click
  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-medium text-lg">{title}</h3>
            <p className="text-sm text-gray-500 flex items-center">
              {date && (
                <time dateTime={date} className="flex items-center gap-1">
                  <span>{new Date(date).toLocaleDateString()}</span>
                </time>
              )}
            </p>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-500 hover:text-red-600">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the document "{title}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">{description}</p>
      </CardContent>
      <CardFooter className="pt-0 flex gap-2">
        {!datasetId && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={handleGenerateClick}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Data'}
          </Button>
        )}
        
        {datasetId && downloadUrl && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full flex items-center gap-2"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
            Download JSONL
          </Button>
        )}
      </CardFooter>

      {/* Generate Data Modal */}
      <GenerateDataModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onConfirm={handleGenerateConfirm}
        documentId={id}
        documentTitle={title}
      />
    </Card>
  );
}