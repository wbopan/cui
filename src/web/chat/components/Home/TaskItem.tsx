import React, { useState } from 'react';
import { StopCircle, Archive } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import type { StreamStatus } from '../../types';

interface TaskItemProps {
  id: string;
  title: string;
  timestamp: string;
  projectPath: string;
  recentDirectories: Record<string, { lastDate: string; shortname: string }>;
  status: 'ongoing' | 'completed' | 'error' | 'pending';
  messageCount?: number;
  toolMetrics?: {
    linesAdded: number;
    linesRemoved: number;
    editCount: number;
    writeCount: number;
  };
  liveStatus?: StreamStatus;
  isArchived?: boolean;
  onClick: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
}

export function TaskItem({ 
  id: _id, 
  title, 
  timestamp, 
  projectPath, 
  recentDirectories,
  status,
  messageCount,
  toolMetrics,
  liveStatus,
  isArchived = false,
  onClick,
  onCancel,
  onArchive,
  onUnarchive
}: TaskItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div 
      className="relative group hover:bg-muted/30 focus-within:border-l-2 focus-within:border-accent"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a 
        className="block no-underline text-inherit outline-offset-[-1px] focus-within:rounded-lg" 
        onClick={(e) => {
          // Allow native behavior for cmd+click (Mac) or ctrl+click (Windows/Linux)
          if (e.metaKey || e.ctrlKey) {
            return;
          }
          e.preventDefault();
          onClick();
        }}
        href={`/c/${_id}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 w-full px-4 py-3.5 border-b border-border/30 text-sm">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 w-full min-w-0 text-foreground">
              <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium group-hover:text-foreground">
                <span>{title || 'New conversation'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {formatTimestamp(timestamp)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {projectPath 
                  ? (recentDirectories[projectPath]?.shortname || projectPath.split('/').pop() || projectPath)
                  : 'No project'}
              </span>
              {messageCount !== undefined && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{messageCount}</span>
                </>
              )}
            </div>
          </div>
          
          {status === 'ongoing' && (
            <div className="flex items-center gap-2">
              <span className={`animate-pulse bg-gradient-to-r from-muted-foreground via-muted-foreground to-muted-foreground/50 bg-[length:200%_100%] bg-clip-text text-transparent ${liveStatus ? 'animate-[shimmer_2s_linear_infinite]' : ''}`}>
                {liveStatus?.currentStatus || 'Running'}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 rounded-full hover:bg-muted/50"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onCancel?.();
                      }}
                      aria-label="Stop task"
                      type="button"
                    >
                      <StopCircle size={24} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Stop task</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          
          {status === 'completed' && isHovered && (
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 rounded-full hover:bg-muted/50"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isArchived) {
                          onUnarchive?.();
                        } else {
                          onArchive?.();
                        }
                      }}
                      aria-label={isArchived ? "Unarchive task" : "Archive task"}
                      type="button"
                    >
                      <Archive size={21} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isArchived ? "Unarchive task" : "Archive task"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          
          {status !== 'ongoing' && !isHovered && toolMetrics && (toolMetrics.linesAdded > 0 || toolMetrics.linesRemoved > 0) && (
            <div className="flex items-center gap-2 text-xs">
              {toolMetrics.linesAdded > 0 && (
                <span className="text-green-500 font-medium">+{toolMetrics.linesAdded}</span>
              )}
              {toolMetrics.linesRemoved > 0 && (
                <span className="text-red-500 font-medium">-{toolMetrics.linesRemoved}</span>
              )}
            </div>
          )}
        </div>
      </a>
    </div>
  );
}