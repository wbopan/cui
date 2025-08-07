import React from 'react';
import { ArrowLeft, Archive, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Button } from '@/web/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';

interface ConversationHeaderProps {
  title: string;
  sessionId?: string;
  isArchived?: boolean;
  subtitle?: {
    date?: string;
    repo?: string;
    commitSHA?: string;
    changes?: {
      additions: number;
      deletions: number;
    };
  };
}

export function ConversationHeader({ title, sessionId, isArchived = false, subtitle }: ConversationHeaderProps) {
  const navigate = useNavigate();

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
              <span className="font-medium text-sm text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {title}
              </span>
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
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open notifications"
                className="flex items-center justify-center px-3 py-2 rounded-md text-foreground hover:bg-secondary transition-colors"
              >
                <Bell size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open notifications</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}