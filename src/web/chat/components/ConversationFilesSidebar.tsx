import React, { useState, useMemo, useEffect } from 'react';
import { Download, FileText, FolderOpen, Package, Upload } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { UploadFileButton } from './UploadFileButton';
import {
  extractFilePathsFromConversation,
  getUniqueFilePaths,
  type DetectedFile
} from '../../utils/filePathDetector';

interface ConversationFilesSidebarProps {
  messages: Array<{
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
    cwd?: string;
  }>;
  sessionId: string;
}

interface UploadedFile {
  name: string;
  path: string;
  size?: number;
  lastModified: string;
}

export function ConversationFilesSidebar({ messages, sessionId }: ConversationFilesSidebarProps) {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploadTrigger, setUploadTrigger] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Extract files from conversation
  const detectedFiles = useMemo(() => {
    return extractFilePathsFromConversation(messages);
  }, [messages, uploadTrigger]);

  // Fetch uploaded files
  useEffect(() => {
    const fetchUploadedFiles = async () => {
      try {
        const result = await api.listUploadedFiles(sessionId);
        setUploadedFiles(result.files);
      } catch (err) {
        console.error('Failed to fetch uploaded files:', err);
      }
    };

    fetchUploadedFiles();
  }, [sessionId, uploadTrigger]);

  const handleUploadComplete = (uploadedPaths: string[]) => {
    console.log('Files uploaded:', uploadedPaths);
    // Trigger re-fetch of uploaded files
    setUploadTrigger(prev => prev + 1);
  };

  const handleDownloadAll = async () => {
    try {
      setIsDownloadingAll(true);
      setDownloadError(null);

      const filePaths = getUniqueFilePaths(detectedFiles);
      await api.downloadFilesAsZip(sessionId, filePaths);
    } catch (err) {
      console.error('Bulk download error:', err);
      setDownloadError(err instanceof Error ? err.message : 'Bulk download failed');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDownloadSingle = async (filePath: string) => {
    try {
      await api.downloadFile(filePath, sessionId);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  if (detectedFiles.length === 0 && uploadedFiles.length === 0) {
    return (
      <div className="w-full border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="w-5 h-5" />
          <h3 className="font-semibold">Files</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          No files detected in this conversation
        </p>
        <UploadFileButton
          sessionId={sessionId}
          onUploadComplete={handleUploadComplete}
          multiple={true}
        />
      </div>
    );
  }

  return (
    <div className="w-full border rounded-lg">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="w-5 h-5" />
          <h3 className="font-semibold">Files</h3>
          <Badge variant="secondary">{detectedFiles.length + uploadedFiles.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Files in this conversation
        </p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleDownloadAll}
            disabled={isDownloadingAll || detectedFiles.length === 0}
            className="w-full gap-2"
            variant="default"
          >
            <Package className="w-4 h-4" />
            {isDownloadingAll ? 'Downloading...' : `Download All (${detectedFiles.length})`}
          </Button>
          <UploadFileButton
            sessionId={sessionId}
            onUploadComplete={handleUploadComplete}
            multiple={true}
            variant="default"
            className="w-full"
          />
        </div>

        {downloadError && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {downloadError}
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Uploaded Files</h4>
                <Badge variant="outline" className="text-xs">{uploadedFiles.length}</Badge>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                {uploadedFiles.map((file) => (
                  <UploadedFileItem
                    key={file.path}
                    file={file}
                    onDownload={() => handleDownloadSingle(file.path)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {detectedFiles.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Referenced Files</h4>
                <Badge variant="outline" className="text-xs">{detectedFiles.length}</Badge>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                {detectedFiles.map((file: DetectedFile) => (
                  <FileItem
                    key={file.path}
                    file={file}
                    onDownload={() => handleDownloadSingle(file.path)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface FileItemProps {
  file: DetectedFile;
  onDownload: () => void;
}

function FileItem({ file, onDownload }: FileItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await onDownload();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent group">
      <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{file.filename}</span>
          {file.toolUses.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {file.toolUses.length} edit{file.toolUses.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={file.path}>
          {file.path}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface UploadedFileItemProps {
  file: UploadedFile;
  onDownload: () => void;
}

function UploadedFileItem({ file, onDownload }: UploadedFileItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    try {
      setIsDownloading(true);
      onDownload();
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent group">
      <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{file.name}</span>
          {file.size && (
            <Badge variant="outline" className="text-xs">
              {formatFileSize(file.size)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={file.path}>
          {file.path}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}
