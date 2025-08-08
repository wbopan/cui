import React, { useState, useEffect } from 'react';
import { ArrowLeft, Archive, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { MoreOptionsMenu } from '../MoreOptionsMenu';

interface ConversationHeaderProps {
  title: string;
  sessionId?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  subtitle?: {
    date?: string;
    repo?: string;
    commitSHA?: string;
    changes?: {
      additions: number;
      deletions: number;
    };
  };
  onTitleUpdate?: (newTitle: string) => void;
  onPinToggle?: (isPinned: boolean) => void;
}

export function ConversationHeader({ title, sessionId, isArchived = false, isPinned = false, subtitle, onTitleUpdate, onPinToggle }: ConversationHeaderProps) {
  const navigate = useNavigate();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [localTitle, setLocalTitle] = useState(title);

  // Update localTitle when title prop changes
  useEffect(() => {
    setLocalTitle(title);
    if (!isRenaming) {
      setNewTitle(title);
    }
  }, [title, isRenaming]);

  const handleBack = () => {
    navigate('/');
  };

  const handleArchive = async () => {
    if (!sessionId) return;
    
    try {
      await api.updateSession(sessionId, { archived: !isArchived });
      navigate('/');
    } catch (err) {
      console.error(`Failed to ${isArchived ? 'unarchive' : 'archive'} session:`, err);
    }
  };

  const handleRenameSubmit = async () => {
    if (newTitle.trim() && newTitle !== localTitle && sessionId) {
      try {
        await api.updateSession(sessionId, { customName: newTitle.trim() });
        setLocalTitle(newTitle.trim());
        onTitleUpdate?.(newTitle.trim());
      } catch (error) {
        console.error('Failed to rename session:', error);
      }
    }
    setIsRenaming(false);
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewTitle(localTitle);
  };

  const handlePinToggle = async (pinned: boolean) => {
    if (!sessionId) return;
    onPinToggle?.(pinned);
  };

  return (
    <TooltipProvider>
      <div className="flex justify-between items-center gap-3 p-3 border-b border-border/50 bg-background transition-colors">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                aria-label="Go back to tasks"
                className="flex items-center justify-center px-3 py-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Go back to tasks</p>
            </TooltipContent>
          </Tooltip>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-3">
              {isRenaming ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameSubmit();
                      } else if (e.key === 'Escape') {
                        handleRenameCancel();
                      }
                    }}
                    className="h-8 px-3 text-sm flex-1 font-medium max-w-md focus:outline-none focus:ring-0 focus:border-border"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleRenameSubmit}
                    className="h-7 w-7 rounded-full hover:bg-muted/50"
                  >
                    <Check size={16} strokeWidth={2.5} className="text-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleRenameCancel}
                    className="h-7 w-7 rounded-full hover:bg-muted/50"
                  >
                    <X size={16} strokeWidth={2.5} className="text-foreground" />
                  </Button>
                </div>
              ) : (
                <span className="font-medium text-sm text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                  {localTitle}
                </span>
              )}
            </div>
            {subtitle && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {subtitle.date && (
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{subtitle.date}</span>
                )}
                {subtitle.repo && (
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{subtitle.repo}</span>
                )}
                {subtitle.commitSHA && (
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{subtitle.commitSHA.slice(0, 7)}</span>
                )}
                {subtitle.changes && (
                  <span className="flex gap-2 font-medium">
                    <span className="text-green-600">+{subtitle.changes.additions}</span>
                    <span className="text-red-600">-{subtitle.changes.deletions}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleArchive}
                disabled={!sessionId}
                aria-label={isArchived ? "Unarchive Task" : "Archive Task"}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-normal text-foreground hover:bg-secondary transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">{isArchived ? 'Unarchive' : 'Archive'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isArchived ? 'Unarchive Task' : 'Archive Task'}</p>
            </TooltipContent>
          </Tooltip>
          
          {sessionId && (
            <MoreOptionsMenu
              sessionId={sessionId}
              currentName={localTitle}
              isPinned={isPinned}
              onRename={() => {
                setIsRenaming(true);
                setNewTitle(localTitle);
              }}
              onPinToggle={handlePinToggle}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}