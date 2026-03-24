import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface UploadFileButtonProps {
  sessionId: string;
  onUploadComplete?: (uploadedPaths: string[]) => void;
  multiple?: boolean;
  acceptedFileTypes?: string;
  variant?: 'default' | 'icon';
}

export function UploadFileButton({
  sessionId,
  onUploadComplete,
  multiple = true,
  acceptedFileTypes = '*',
  variant = 'default'
}: UploadFileButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setSuccessMessage(null);

      const fileArray = Array.from(files);
      const response = await api.uploadFiles(fileArray, sessionId);

      if (response.success) {
        const uploadedPaths = response.files.map(f => f.uploadedPath);
        setSuccessMessage(
          `Successfully uploaded ${response.files.length} file${response.files.length > 1 ? 's' : ''}`
        );

        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);

        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete(uploadedPaths);
        }

        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }

      // Show errors if any files failed
      if (response.errors && response.errors.length > 0) {
        const errorMessages = response.errors
          .map(e => `${e.filename}: ${e.error}`)
          .join(', ');
        setError(errorMessages);

        // Clear error message after 5 seconds
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');

      // Clear error message after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleButtonClick}
              disabled={isUploading}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Upload files"
            >
              <Upload className="w-4 h-4" />
              <input
                ref={fileInputRef}
                type="file"
                multiple={multiple}
                accept={acceptedFileTypes}
                onChange={handleFileSelect}
                className="hidden"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {successMessage ? (
              <p className="text-green-600 dark:text-green-400">{successMessage}</p>
            ) : error ? (
              <p className="text-red-500 text-xs">{error}</p>
            ) : (
              <p>{isUploading ? 'Uploading...' : 'Upload files'}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleButtonClick}
        disabled={isUploading}
        className="gap-2"
      >
        <Upload className="w-4 h-4" />
        {isUploading ? 'Uploading...' : 'Upload Files'}
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={acceptedFileTypes}
          onChange={handleFileSelect}
          className="hidden"
        />
      </Button>

      {successMessage && (
        <p className="text-xs text-green-600 dark:text-green-400">{successMessage}</p>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
