import React, { useState } from 'react';
import { StopCircle, Archive, Check, X } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { MoreOptionsMenu } from '../MoreOptionsMenu';
import { api } from '../../services/api';
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
  isPinned?: boolean;
  onClick: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onNameUpdate?: () => void;
  onPinToggle?: (isPinned: boolean) => void;
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
  isPinned = false,
  isRenaming = false,
  onClick,
  onCancel,
  onArchive,
  onUnarchive,
  onStartRename,
  onCancelRename,
  onNameUpdate,
  onPinToggle
}: TaskItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [newName, setNewName] = useState(title);
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

  const handleRenameSubmit = async () => {
    if (newName.trim() && newName !== title) {
      try {
        await api.updateSession(_id, { customName: newName.trim() });
        onNameUpdate?.();
      } catch (error) {
        console.error('Failed to rename session:', error);
        onCancelRename?.();
      }
    } else {
      onCancelRename?.();
    }
  };

  const handleRenameCancel = () => {
    onCancelRename?.();
    setNewName(title);
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
          if (isRenaming) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
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
              {isRenaming ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameSubmit();
                      } else if (e.key === 'Escape') {
                        handleRenameCancel();
                      }
                    }}
                    className="h-8 px-3 text-sm flex-1 font-medium max-w-md focus:outline-none focus:ring-0 focus:border-border"
                    autoFocus
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRenameSubmit();
                    }}
                    className="h-7 w-7 rounded-full hover:bg-muted/50"
                  >
                    <Check size={16} strokeWidth={2.5} className="text-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRenameCancel();
                    }}
                    className="h-7 w-7 rounded-full hover:bg-muted/50"
                  >
                    <X size={16} strokeWidth={2.5} className="text-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium group-hover:text-foreground">
                  <span>{title || 'New conversation'}</span>
                </div>
              )}
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
              <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <MoreOptionsMenu
                  sessionId={_id}
                  currentName={title}
                  isPinned={isPinned}
                  onRename={() => {
                    onStartRename?.();
                    setNewName(title);
                  }}
                  onPinToggle={onPinToggle}
                />
              </div>
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