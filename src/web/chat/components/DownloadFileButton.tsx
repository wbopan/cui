import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface DownloadFileButtonProps {
  filePath: string;
  sessionId: string;
  filename?: string;
  variant?: 'inline' | 'default';
}

export function DownloadFileButton({
  filePath,
  sessionId,
  filename,
  variant = 'default'
}: DownloadFileButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      await api.downloadFile(filePath, sessionId);
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const displayName = filename || filePath.split('/').pop() || filePath;

  if (variant === 'inline') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed ml-1"
              title={`Download ${displayName}`}
            >
              <Download className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isDownloading ? 'Downloading...' : `Download ${displayName}`}</p>
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Download {displayName}</p>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
