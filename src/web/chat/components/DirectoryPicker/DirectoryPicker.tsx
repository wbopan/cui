import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, Home, FolderOpen, ArrowLeft } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { api } from '../../services/api';
import type { FileSystemEntry } from '@/types';

interface DirectoryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

interface BreadcrumbSegment {
  name: string;
  path: string;
}

// Pure utility functions - moved outside component for performance
const getParentPath = (path: string): string | null => {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return '/' + segments.slice(0, -1).join('/');
};

const joinPath = (basePath: string, segment: string): string => {
  return basePath === '/' ? `/${segment}` : `${basePath}/${segment}`;
};

const parseBreadcrumbs = (path: string): BreadcrumbSegment[] => {
  if (!path || path === '/') {
    return [{ name: 'Root', path: '/' }];
  }
  
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbSegment[] = [{ name: 'Root', path: '/' }];
  
  segments.forEach((segment, index) => {
    breadcrumbs.push({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/')
    });
  });
  
  return breadcrumbs;
};

// Directory item component for cleaner render
interface DirectoryItemProps {
  directory: FileSystemEntry;
  currentPath: string;
  onNavigate: (directory: FileSystemEntry) => void;
  onSelect: (path: string) => void;
}

const DirectoryItem = React.memo(({ directory, currentPath, onNavigate, onSelect }: DirectoryItemProps) => {
  const handleDoubleClick = useCallback(() => {
    const newPath = joinPath(currentPath, directory.name);
    onSelect(newPath);
  }, [currentPath, directory.name, onSelect]);

  return (
    <button
      className={cn(
        "flex items-center gap-3 p-3 px-4 border-none rounded-lg bg-transparent text-foreground cursor-pointer transition-all text-left w-full",
        "hover:bg-muted active:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      )}
      onClick={() => onNavigate(directory)}
      onDoubleClick={handleDoubleClick}
      role="listitem"
      aria-label={`Navigate to ${directory.name} directory. Double-click to select this directory.`}
    >
      <FolderOpen size={20} className="text-primary flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm overflow-hidden text-ellipsis whitespace-nowrap">{directory.name}</span>
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0 opacity-50 transition-opacity group-hover:opacity-100" aria-hidden="true" />
    </button>
  );
});

DirectoryItem.displayName = 'DirectoryItem';

export function DirectoryPicker({ isOpen, onClose, onSelect, initialPath }: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '');
  const [directories, setDirectories] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load directories for the current path
  const loadDirectories = useCallback(async (path: string) => {
    if (!path) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.listDirectory({ path });
      // Filter to directories only and sort alphabetically
      const dirs = response.entries
        .filter(entry => entry.type === 'directory')
        .sort((a, b) => a.name.localeCompare(b.name));
      setDirectories(dirs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load directory';
      setError(errorMessage);
      setDirectories([]);
      
      // If path not found, try to navigate to parent
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        const parentPath = getParentPath(path);
        if (parentPath && parentPath !== path) {
          setCurrentPath(parentPath);
          return; // loadDirectories will be called again via useEffect
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const breadcrumbs = useMemo(() => parseBreadcrumbs(currentPath), [currentPath]);
  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);
  const canGoUp = parentPath !== null;

  // Navigate up to parent directory
  const navigateUp = useCallback(() => {
    if (parentPath) {
      setCurrentPath(parentPath);
    }
  }, [parentPath]);

  // Handle directory selection
  const handleDirectorySelect = useCallback((directory: FileSystemEntry) => {
    const newPath = joinPath(currentPath, directory.name);
    setCurrentPath(newPath);
  }, [currentPath]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      navigateUp();
    }
  }, [onClose, navigateUp]);

  // Handle initialization and directory loading
  useEffect(() => {
    if (!isOpen) return;
    
    // If no current path, initialize with home directory
    if (!currentPath) {
      api.getHomeDirectory()
        .then(({ homeDirectory }) => {
          setCurrentPath(homeDirectory);
        })
        .catch((error) => {
          console.warn('Failed to get home directory:', error);
          setCurrentPath('/'); // Fallback to root
        });
      return;
    }
    
    // Load directories for current path
    loadDirectories(currentPath);
  }, [isOpen, currentPath, loadDirectories]);

  // Render directory list content based on state
  const renderDirectoryContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-5 text-muted-foreground gap-3">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
          Loading directories...
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-5 text-center gap-4">
          <p className="text-destructive m-0">Error: {error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDirectories(currentPath)}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      );
    }

    if (directories.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-5 text-center text-muted-foreground gap-4">
          <FolderOpen size={48} className="opacity-50" />
          <p className="m-0 text-sm">No subdirectories found</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0.5" role="list" aria-label="Directories">
        {directories.map((directory) => (
          <DirectoryItem
            key={directory.name}
            directory={directory}
            currentPath={currentPath}
            onNavigate={handleDirectorySelect}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content 
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg",
            "flex flex-col h-[70vh] max-h-[600px] min-h-[400px] outline-none p-6"
          )}
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title className="text-xl font-semibold text-foreground">
            Select Directory
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Browse and select a directory. Use the breadcrumb navigation to navigate between folders, or use the Up button to go to parent directories.
          </Dialog.Description>
        
          {/* Close Button */}
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-4 top-4 text-2xl leading-none p-1 px-2"
              aria-label="Close directory picker"
            >
              ×
            </Button>
          </Dialog.Close>

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1 py-3 overflow-x-auto scrollbar-thin" aria-label="Directory breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" aria-hidden="true" />}
              <button
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md border-none bg-transparent text-muted-foreground text-sm cursor-pointer transition-all whitespace-nowrap flex-shrink-0",
                  "hover:bg-muted hover:text-foreground disabled:cursor-default",
                  index === breadcrumbs.length - 1 && "text-foreground font-medium"
                )}
                onClick={() => setCurrentPath(crumb.path)}
                disabled={index === breadcrumbs.length - 1}
                aria-label={index === 0 ? "Navigate to root directory" : `Navigate to ${crumb.name}`}
                aria-current={index === breadcrumbs.length - 1 ? "location" : undefined}
              >
                {index === 0 ? <Home size={16} aria-hidden="true" /> : crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Toolbar */}
        <div className="flex justify-start items-center py-3 border-b border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={navigateUp}
            disabled={!canGoUp}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft size={16} />
            Up
          </Button>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
          {renderDirectoryContent()}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-border mt-auto gap-3 sm:gap-0">
          <div className="text-xs text-muted-foreground max-w-full sm:max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap text-center sm:text-left">
            <strong>Current:</strong> {currentPath || '/'}
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={() => onSelect(currentPath)}
              disabled={!currentPath}
            >
              Select
            </Button>
          </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}