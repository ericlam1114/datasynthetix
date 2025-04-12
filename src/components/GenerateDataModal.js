import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from './ui/dialog';
import { Button } from './ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { Label } from './ui/label';

export default function GenerateDataModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  documentId,
  documentTitle
}) {
  // Initialize state with default values
  const [useCase, setUseCase] = useState('rewriter-legal'); // Default use case
  const [outputFormat, setOutputFormat] = useState('openai-jsonl'); // Default output format
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle confirm button click
  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      console.log(`GenerateDataModal: Confirming with useCase=${useCase}, outputFormat=${outputFormat}`);
      // Call the onConfirm function passed as prop with the current state values
      await onConfirm(documentId, { useCase, outputFormat });
      // Close the modal on success
      onClose();
    } catch (error) {
      console.error('Error generating data:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Generate Synthetic Data</DialogTitle>
          <DialogDescription>
            Select a use case and output format for generating synthetic data from "{documentTitle}".
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="useCase" className="text-right">
              Use Case
            </Label>
            <Select
              id="useCase"
              value={useCase}
              onValueChange={setUseCase}
              className="col-span-3"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a use case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rewriter-legal">Rewriter for Legal</SelectItem>
                <SelectItem value="qa-sops" disabled className="text-gray-400">Q&A for SOPs (Coming Soon)</SelectItem>
                <SelectItem value="math-finance" disabled className="text-gray-400">Math for Finance (Coming Soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="outputFormat" className="text-right">
              Output Format
            </Label>
            <Select
              id="outputFormat"
              value={outputFormat}
              onValueChange={setOutputFormat}
              className="col-span-3"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an output format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai-jsonl">OpenAI JSONL</SelectItem>
                <SelectItem value="llama" disabled className="text-gray-400">Llama (Coming Soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 