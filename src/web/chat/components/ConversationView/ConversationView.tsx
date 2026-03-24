import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { MessageList } from '../MessageList/MessageList';
import { Composer, ComposerRef } from '@/web/chat/components/Composer';
import { ConversationHeader } from '../ConversationHeader/ConversationHeader';
import { ConversationFilesSidebar } from '../ConversationFilesSidebar';
import { Button } from '../ui/button';
import { api } from '../../services/api';
import { useStreaming, useConversationMessages } from '../../hooks';
import type { ChatMessage, ConversationDetailsResponse, ConversationMessage, ConversationSummary } from '../../types';

export function ConversationView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string>('Conversation');
  const [isPermissionDecisionLoading, setIsPermissionDecisionLoading] = useState(false);
  const [conversationSummary, setConversationSummary] = useState<ConversationSummary | null>(null);
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState<string>('');
  const [showFilesSidebar, setShowFilesSidebar] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const composerRef = useRef<ComposerRef>(null);

  // Use shared conversation messages hook
  const {
    messages,
    toolResults,
    currentPermissionRequest,
    childrenMessages,
    expandedTasks,
    clearMessages,
    addMessage,
    setAllMessages,
    handleStreamMessage,
    toggleTaskExpanded,
    clearPermissionRequest,
    setPermissionRequest,
  } = useConversationMessages({
    onResult: (newSessionId) => {
      // Navigate to the new session page if session changed
      if (newSessionId && newSessionId !== sessionId) {
        navigate(`/c/${newSessionId}`);
      }
    },
    onError: (err) => {
      setError(err);
      setStreamingId(null);
    },
    onClosed: () => {
      setStreamingId(null);
    },
  });

  // Clear navigation state to prevent issues on refresh
  useEffect(() => {
    const state = location.state;
    
    if (state) {
      // Clear the state to prevent issues on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Clear streaming when navigating away or sessionId changes
  useEffect(() => {
    // Clear streamingId when sessionId changes
    setStreamingId(null);
    
    return () => {
      // Clear streaming when navigating away
      setStreamingId(null);
    };
  }, [sessionId]);

  // Load conversation history
  useEffect(() => {
    const loadConversation = async () => {
      if (!sessionId) return;
      
      setIsLoading(true);
      setError(null);

      try {
        const details = await api.getConversationDetails(sessionId);
        const chatMessages = convertToChatlMessages(details);

        // Always load fresh messages from backend
        setAllMessages(chatMessages);

        // Store raw messages for file detection
        setConversationMessages(details.messages);
        
        // Set working directory from the most recent message with a working directory
        const messagesWithCwd = chatMessages.filter(msg => msg.workingDirectory);
        if (messagesWithCwd.length > 0) {
          const latestCwd = messagesWithCwd[messagesWithCwd.length - 1].workingDirectory;
          if (latestCwd) {
            setCurrentWorkingDirectory(latestCwd);
          }
        }
        
        // Check if this conversation has an active stream
        const conversationsResponse = await api.getConversations({ limit: 100 });
        const currentConversation = conversationsResponse.conversations.find(
          conv => conv.sessionId === sessionId
        );
        
        if (currentConversation) {
          setConversationSummary(currentConversation);
          
          // Set conversation title from custom name or summary
          const title = currentConversation.sessionInfo.custom_name || currentConversation.summary || 'Untitled';
          setConversationTitle(title);
          
          if (currentConversation.status === 'ongoing' && currentConversation.streamingId) {
            // Active stream, check for existing pending permissions
            setStreamingId(currentConversation.streamingId);
            
            try {
              const { permissions } = await api.getPermissions({ 
                streamingId: currentConversation.streamingId, 
                status: 'pending' 
              });
              
              if (permissions.length > 0) {
                // Take the most recent pending permission (by timestamp)
                const mostRecentPermission = permissions.reduce((latest, current) => 
                  new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
                );
                
                setPermissionRequest(mostRecentPermission);
              }
            } catch (permissionError) {
              // Don't break conversation loading if permission fetching fails
              console.warn('[ConversationView] Failed to fetch existing permissions:', permissionError);
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load conversation');
      } finally {
        setIsLoading(false);
        
        // Focus the input after loading is complete
        setTimeout(() => {
          composerRef.current?.focusInput();
        }, 100);
      }
    };

    loadConversation();
  }, [sessionId, setAllMessages]);

  const { isConnected, disconnect } = useStreaming(streamingId, {
    onMessage: handleStreamMessage,
    onError: (err) => {
      setError(err.message);
      setStreamingId(null);
    },
  });

  const handleSendMessage = async (message: string, workingDirectory?: string, model?: string, permissionMode?: string) => {
    if (!sessionId) return;

    setError(null);

    // CRITICAL: Add user message to UI immediately (optimistic update)
    // This is necessary because SSE connection may not be established yet when backend sends the message
    const optimisticUserMessage: ChatMessage = {
      id: '',  // No ID yet from backend
      messageId: `optimistic-user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      workingDirectory: workingDirectory || currentWorkingDirectory,
    };
    addMessage(optimisticUserMessage);

    try {
      const response = await api.startConversation({
        resumedSessionId: sessionId,
        initialPrompt: message,
        workingDirectory: workingDirectory || currentWorkingDirectory,
        model,
        permissionMode
      });

      // Only navigate if the session ID changed
      if (response.sessionId !== sessionId) {
        navigate(`/c/${response.sessionId}`);
      } else {
        // Same session, just update streaming ID to start receiving SSE events
        setStreamingId(response.streamingId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      // TODO: Remove the optimistic message on error
    }
  };

  const handleStop = async () => {
    if (!streamingId) return;

    try {
      // Call the API to stop the conversation
      await api.stopConversation(streamingId);
      
      // Disconnect the streaming connection
      disconnect();
      
      // Clear the streaming ID
      setStreamingId(null);
      
      // Streaming has stopped
    } catch (err: any) {
      console.error('Failed to stop conversation:', err);
      setError(err.message || 'Failed to stop conversation');
    }
  };

  const handlePermissionDecision = async (requestId: string, action: 'approve' | 'deny', denyReason?: string) => {
    if (isPermissionDecisionLoading) return;

    setIsPermissionDecisionLoading(true);
    try {
      await api.sendPermissionDecision(requestId, { action, denyReason });
      // Clear the permission request after successful decision
      clearPermissionRequest();
    } catch (err: any) {
      console.error('Failed to send permission decision:', err);
      setError(err.message || 'Failed to send permission decision');
    } finally {
      setIsPermissionDecisionLoading(false);
    }
  };


  return (
    <div className="h-full flex bg-background relative" role="main" aria-label="Conversation view">
      {/* Main conversation area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between border-b">
          <div className="flex-1 min-w-0">
            <ConversationHeader
              title={conversationSummary?.sessionInfo.custom_name || conversationTitle}
              sessionId={sessionId}
              isArchived={conversationSummary?.sessionInfo.archived || false}
              isPinned={conversationSummary?.sessionInfo.pinned || false}
              subtitle={conversationSummary ? {
                date: new Date(conversationSummary.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                repo: conversationSummary.projectPath.split('/').pop() || 'project',
                commitSHA: conversationSummary.sessionInfo.initial_commit_head,
                changes: conversationSummary.toolMetrics ? {
                  additions: conversationSummary.toolMetrics.linesAdded,
                  deletions: conversationSummary.toolMetrics.linesRemoved
                } : undefined
              } : undefined}
              onTitleUpdate={async (newTitle) => {
                // Update local state immediately for instant feedback
                setConversationTitle(newTitle);

                // Update the conversation summary with the new custom name
                if (conversationSummary) {
                  setConversationSummary({
                    ...conversationSummary,
                    sessionInfo: {
                      ...conversationSummary.sessionInfo,
                      custom_name: newTitle
                    }
                  });
                }

                // Optionally refresh from backend to ensure consistency
                try {
                  const conversationsResponse = await api.getConversations({ limit: 100 });
                  const updatedConversation = conversationsResponse.conversations.find(
                    conv => conv.sessionId === sessionId
                  );
                  if (updatedConversation) {
                    setConversationSummary(updatedConversation);
                    const title = updatedConversation.sessionInfo.custom_name || updatedConversation.summary || 'Untitled';
                    setConversationTitle(title);
                  }
                } catch (error) {
                  console.error('Failed to refresh conversation after rename:', error);
                }
              }}
              onPinToggle={async (isPinned) => {
                if (conversationSummary) {
                  setConversationSummary({
                    ...conversationSummary,
                    sessionInfo: {
                      ...conversationSummary.sessionInfo,
                      pinned: isPinned
                    }
                  });
                }
              }}
            />
          </div>

          {/* Files sidebar toggle button */}
          <div className="flex-shrink-0 px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilesSidebar(!showFilesSidebar)}
              className="gap-2"
              title={showFilesSidebar ? 'Hide files' : 'Show files'}
            >
              <FileText className="w-4 h-4" />
              {!showFilesSidebar && <span className="hidden sm:inline">Files</span>}
            </Button>
          </div>
        </div>

        {error && (
          <div
            className="bg-red-500/10 border-b border-red-500 text-red-600 dark:text-red-400 px-4 py-2 text-sm text-center animate-in slide-in-from-top duration-300"
            role="alert"
            aria-label="Error message"
          >
            {error}
          </div>
        )}

        <MessageList
          messages={messages}
          toolResults={toolResults}
          childrenMessages={childrenMessages}
          expandedTasks={expandedTasks}
          onToggleTaskExpanded={toggleTaskExpanded}
          isLoading={isLoading}
          isStreaming={!!streamingId}
        />

        <div
          className="sticky bottom-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm z-10 w-full flex justify-center px-2 pb-6"
          aria-label="Message composer section"
        >
          <div className="w-full max-w-3xl">
            <Composer
              ref={composerRef}
              onSubmit={handleSendMessage}
              onStop={handleStop}
              onPermissionDecision={handlePermissionDecision}
              isLoading={isConnected || isPermissionDecisionLoading}
              placeholder="Continue the conversation..."
              permissionRequest={currentPermissionRequest}
              showPermissionUI={true}
              showStopButton={true}
              enableFileAutocomplete={true}
              dropdownPosition="above"
              workingDirectory={conversationSummary?.projectPath}
              onFetchFileSystem={async (directory) => {
                try {
                  const response = await api.listDirectory({
                    path: directory || currentWorkingDirectory,
                    recursive: true,
                    respectGitignore: true,
                  });
                  return response.entries;
                } catch (error) {
                  console.error('Failed to fetch file system entries:', error);
                  return [];
                }
              }}
              onFetchCommands={async (workingDirectory) => {
                try {
                  const response = await api.getCommands(workingDirectory || currentWorkingDirectory);
                  return response.commands;
                } catch (error) {
                  console.error('Failed to fetch commands:', error);
                  return [];
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Files sidebar */}
      {showFilesSidebar && sessionId && conversationMessages.length > 0 && (
        <div className="w-80 border-l bg-background overflow-y-auto flex-shrink-0 hidden lg:block">
          <div className="p-4 sticky top-0">
            <ConversationFilesSidebar
              messages={conversationMessages}
              sessionId={sessionId}
            />
          </div>
        </div>
      )}

      {/* Mobile files sidebar overlay */}
      {showFilesSidebar && sessionId && conversationMessages.length > 0 && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setShowFilesSidebar(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 bg-background overflow-y-auto shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <ConversationFilesSidebar
                messages={conversationMessages}
                sessionId={sessionId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to convert API response to chat messages
function convertToChatlMessages(details: ConversationDetailsResponse): ChatMessage[] {
  // Create a map for quick parent message lookup
  const messageMap = new Map<string, ConversationMessage>();
  details.messages.forEach(msg => messageMap.set(msg.uuid, msg));

  return details.messages
    .filter(msg => !msg.isSidechain) // Filter out sidechain messages
    .map(msg => {
      // Extract content from the message structure
      let content = msg.message;
      
      // Handle Anthropic message format
      if (typeof msg.message === 'object' && 'content' in msg.message) {
        content = msg.message.content;
      }
      
      return {
        id: msg.uuid,
        messageId: msg.uuid, // For historical messages, use UUID as messageId
        type: msg.type as 'user' | 'assistant' | 'system',
        content: content,
        timestamp: msg.timestamp,
        workingDirectory: msg.cwd, // Add working directory from backend message
      };
    });
}