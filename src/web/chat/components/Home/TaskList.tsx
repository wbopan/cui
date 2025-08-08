import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskItem } from './TaskItem';
import type { ConversationSummary } from '../../types';
import { useConversations } from '../../contexts/ConversationsContext';
import { api } from '../../services/api';

interface TaskListProps {
  conversations: ConversationSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  activeTab: 'tasks' | 'history' | 'archive';
  onLoadMore: (filters?: {
    hasContinuation?: boolean;
    archived?: boolean;
    pinned?: boolean;
  }) => void;
}

export function TaskList({ 
  conversations, 
  loading, 
  loadingMore, 
  hasMore, 
  error, 
  activeTab, 
  onLoadMore 
}: TaskListProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const { recentDirectories, loadConversations } = useConversations();
  const [renamingSessionId, setRenamingSessionId] = React.useState<string | null>(null);

  // Get filter parameters based on active tab
  const getFiltersForTab = (tab: 'tasks' | 'history' | 'archive') => {
    switch (tab) {
      case 'tasks':
        return { archived: false, hasContinuation: false };
      case 'history':
        return { archived: false, hasContinuation: true };
      case 'archive':
        return { archived: true };
      default:
        return {};
    }
  };

  const handleTaskClick = (sessionId: string) => {
    // Don't navigate if this session is being renamed
    if (renamingSessionId === sessionId) {
      return;
    }
    navigate(`/c/${sessionId}`);
  };

  const handleCancelTask = (sessionId: string) => {
    // Mock cancel functionality
    console.log('Cancel task:', sessionId);
  };

  const handleArchiveTask = async (sessionId: string) => {
    // Optimistically remove the item from the current view
    const element = document.querySelector(`[data-session-id="${sessionId}"]`) as HTMLElement;
    if (element) {
      element.style.display = 'none';
    }
    
    try {
      // Call the API to persist the change
      await api.updateSession(sessionId, { archived: true });
      
      // Refresh the conversations list to ensure consistency
      loadConversations(undefined, getFiltersForTab(activeTab));
    } catch (error) {
      console.error('Failed to archive task:', error);
      // Restore visibility if the API call fails
      if (element) {
        (element as HTMLElement).style.display = '';
      }
    }
  };

  const handleUnarchiveTask = async (sessionId: string) => {
    // Optimistically remove the item from the current view
    const element = document.querySelector(`[data-session-id="${sessionId}"]`) as HTMLElement;
    if (element) {
      element.style.display = 'none';
    }
    
    try {
      // Call the API to persist the change
      await api.updateSession(sessionId, { archived: false });
      
      // Refresh the conversations list to ensure consistency
      loadConversations(undefined, getFiltersForTab(activeTab));
    } catch (error) {
      console.error('Failed to unarchive task:', error);
      // Restore visibility if the API call fails
      if (element) {
        (element as HTMLElement).style.display = '';
      }
    }
  };

  const handleNameUpdate = async () => {
    // Clear renaming state and refresh the conversations list
    setRenamingSessionId(null);
    await loadConversations(undefined, getFiltersForTab(activeTab));
  };

  const handleStartRename = (sessionId: string) => {
    setRenamingSessionId(sessionId);
  };

  const handleCancelRename = () => {
    setRenamingSessionId(null);
  };

  const handlePinToggle = async () => {
    // Refresh the conversations list to ensure consistency with new pin state
    loadConversations(undefined, getFiltersForTab(activeTab));
  };

  // Sort conversations: pinned items first, then by updatedAt
  const sortedConversations = [...conversations].sort((a, b) => {
    // Pinned items come first
    if (a.sessionInfo.pinned && !b.sessionInfo.pinned) return -1;
    if (!a.sessionInfo.pinned && b.sessionInfo.pinned) return 1;
    
    // Then sort by updatedAt (most recent first)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // Intersection Observer for infinite scrolling
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
        onLoadMore(getFiltersForTab(activeTab));
      }
    },
    [hasMore, loadingMore, loading, onLoadMore, activeTab]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, {
      root: scrollRef.current,
      rootMargin: '100px',
      threshold: 0.1,
    });

    const currentLoadingRef = loadingRef.current;
    if (currentLoadingRef) {
      observer.observe(currentLoadingRef);
    }

    return () => {
      if (currentLoadingRef) {
        observer.unobserve(currentLoadingRef);
      }
    };
  }, [handleIntersection]);

  if (loading && conversations.length === 0) {
    return (
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center justify-center w-full py-12 px-4 text-muted-foreground text-sm text-center bg-background">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center justify-center w-full py-12 px-4 text-destructive text-sm text-center bg-background">{error}</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center justify-center w-full py-12 px-4 text-muted-foreground text-sm text-center bg-background">
          {activeTab === 'tasks' ? 'No active tasks.' : activeTab === 'history' ? 'No history tasks.' : 'No archived tasks.'}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
      {sortedConversations.map((conversation) => (
        <div key={conversation.sessionId} data-session-id={conversation.sessionId}>
          <TaskItem
            id={conversation.sessionId}
            title={conversation.sessionInfo.custom_name || conversation.summary}
            timestamp={conversation.updatedAt}
            projectPath={conversation.projectPath}
            recentDirectories={recentDirectories}
            status={conversation.status}
            messageCount={conversation.messageCount}
            toolMetrics={conversation.toolMetrics}
            liveStatus={conversation.liveStatus}
            isArchived={activeTab === 'archive'}
            isPinned={conversation.sessionInfo.pinned}
            onClick={() => handleTaskClick(conversation.sessionId)}
            onCancel={
              conversation.status === 'ongoing' 
                ? () => handleCancelTask(conversation.sessionId)
                : undefined
            }
            onArchive={
              conversation.status === 'completed' && activeTab !== 'archive'
                ? () => handleArchiveTask(conversation.sessionId)
                : undefined
            }
            onUnarchive={
              conversation.status === 'completed' && activeTab === 'archive'
                ? () => handleUnarchiveTask(conversation.sessionId)
                : undefined
            }
            isRenaming={renamingSessionId === conversation.sessionId}
            onStartRename={() => handleStartRename(conversation.sessionId)}
            onCancelRename={handleCancelRename}
            onNameUpdate={handleNameUpdate}
            onPinToggle={handlePinToggle}
          />
        </div>
      ))}
      
      {/* Loading indicator for infinite scroll */}
      {hasMore && (
        <div ref={loadingRef} className="flex items-center justify-center w-full p-4 min-h-[60px]">
          {loadingMore && (
            <div className="flex items-center justify-center text-muted-foreground text-sm animate-pulse">
              Loading more tasks...
            </div>
          )}
        </div>
      )}
      
      {/* End of list message */}
      {!hasMore && conversations.length > 0 && (
        <div className="flex items-center justify-center w-full p-4 text-muted-foreground/70 text-xs text-center">
          No more tasks to load
        </div>
      )}
    </div>
  );
}