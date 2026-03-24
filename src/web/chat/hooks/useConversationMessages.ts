import { useState, useCallback } from 'react';
import type { ChatMessage, StreamEvent, ToolResult } from '../types';
import type { ContentBlock, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { PermissionRequest } from '@/types';

interface UseConversationMessagesOptions {
  onUserMessage?: (message: ChatMessage) => void;
  onAssistantMessage?: (message: ChatMessage) => void;
  onResult?: (sessionId: string) => void;
  onError?: (error: string) => void;
  onClosed?: () => void;
  onPermissionRequest?: (permission: PermissionRequest) => void;
}

/**
 * Shared hook for managing conversation messages
 * Handles message state and streaming events
 */
export function useConversationMessages(options: UseConversationMessagesOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolResults, setToolResults] = useState<Record<string, ToolResult>>({});
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState<string | undefined>();
  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<PermissionRequest | null>(null);
  const [childrenMessages, setChildrenMessages] = useState<Record<string, ChatMessage[]>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages(prev => {
      return [];
    });
    setToolResults({});
    setCurrentWorkingDirectory(undefined);
    setCurrentPermissionRequest(null);
    setChildrenMessages({});
    setExpandedTasks(new Set());
  }, []);

  // Add a message
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      return [...prev, message];
    });

    // Track tool uses in assistant messages
    if (message.type === 'assistant' && Array.isArray(message.content)) {
      const toolUseIds: string[] = [];
      message.content.forEach((block) => {
        if (block.type === 'tool_use' && block.id) {
          toolUseIds.push(block.id);
        }
      });

      if (toolUseIds.length > 0) {
        setToolResults(prev => {
          const updates: Record<string, ToolResult> = {};
          toolUseIds.forEach(id => {
            if (!prev[id]) {
              updates[id] = { status: 'pending' };
            }
          });
          return { ...prev, ...updates };
        });
      }
    }
  }, []);

  // Handle streaming messages
  const handleStreamMessage = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'connected':
        // Stream connected
        break;
      
      case 'system_init':
        // Capture working directory from system init
        setCurrentWorkingDirectory(event.cwd);
        break;

      case 'user':
        // Process tool results first - if this message contains tool results, handle them and return early
        if (event.message && Array.isArray(event.message.content)) {
          const toolResultUpdates: Record<string, ToolResult> = {};
          let hasToolResults = false;

          event.message.content.forEach((block) => {
            if (block.type === 'tool_result' && 'tool_use_id' in block) {
              hasToolResults = true;
              const toolUseId = block.tool_use_id;
              let result: string | ContentBlockParam[] = '';

              // Extract result content
              if (typeof block.content === 'string') {
                result = block.content;
              } else if (Array.isArray(block.content)) {
                result = block.content;
              }

              toolResultUpdates[toolUseId] = {
                status: 'completed',
                result,
                is_error: block.is_error
              };
            }
          });

          if (hasToolResults) {
            setToolResults(prev => ({ ...prev, ...toolResultUpdates }));
            // Tool result messages should not be added as child messages - return early
            break;
          }
        }

        // If no tool results, check if this is a child message
        const userParentToolUseId = event.parent_tool_use_id;

        // Create user message
        const userMessage: ChatMessage = {
          id: '',
          messageId: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'user',
          content: event.message.content,
          timestamp: new Date().toISOString(),
          workingDirectory: currentWorkingDirectory,
          parentToolUseId: userParentToolUseId,
        };

        if (userParentToolUseId) {
          // This is a child message - add to childrenMessages
          setChildrenMessages(prev => {
            const newChildren = { ...prev };
            if (!newChildren[userParentToolUseId]) {
              newChildren[userParentToolUseId] = [];
            }
            newChildren[userParentToolUseId] = [...newChildren[userParentToolUseId], userMessage];
            return newChildren;
          });
        } else {
          // This is a regular user message - check for duplicates before adding
          // (optimistic updates may have already added this message)
          setMessages(prev => {
            // Check if we already have a very recent user message with the same content
            // This handles the case where optimistic update already added the message
            const lastMessage = prev[prev.length - 1];
            const messageContent = typeof event.message.content === 'string'
              ? event.message.content
              : JSON.stringify(event.message.content);

            const isLikelyDuplicate = lastMessage &&
              lastMessage.type === 'user' &&
              typeof lastMessage.content === 'string' &&
              lastMessage.content === messageContent &&
              (Date.now() - new Date(lastMessage.timestamp).getTime()) < 5000; // Within 5 seconds

            if (isLikelyDuplicate) {
              // Skip this message, it's likely a duplicate of our optimistic update
              return prev;
            }

            // Not a duplicate, add it
            return [...prev, userMessage];
          });
          options.onUserMessage?.(userMessage);
        }
        break;

      case 'assistant':
        // Check if this is a child message
        const parentToolUseId = event.parent_tool_use_id;
        const assistantMessage: ChatMessage = {
          id: event.message.id,
          messageId: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'assistant',
          content: Array.isArray(event.message.content) ? event.message.content : [event.message.content],
          timestamp: new Date().toISOString(),
          workingDirectory: currentWorkingDirectory,
          parentToolUseId,
        };
        
        if (parentToolUseId) {
          // This is a child message - add to childrenMessages instead
          setChildrenMessages(prev => {
            const newChildren = { ...prev };
            if (!newChildren[parentToolUseId]) {
              newChildren[parentToolUseId] = [];
            }
            newChildren[parentToolUseId] = [...newChildren[parentToolUseId], assistantMessage];
            return newChildren;
          });
        } else {
          // Regular message - add to main list
          addMessage(assistantMessage);
          options.onAssistantMessage?.(assistantMessage);
        }
        break;

      case 'result':
        // Only update conversation status, don't update messages
        if (event.session_id) {
          options.onResult?.(event.session_id);
        }
        break;

      case 'error':
        // Add as a new error message
        const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const errorMessage: ChatMessage = {
          id: errorId,
          messageId: errorId, // For error messages, use the same ID for both
          type: 'error',
          content: event.error,
          timestamp: new Date().toISOString(),
        };
        
        addMessage(errorMessage);
        options.onError?.(event.error);
        break;

      case 'closed':
        // Stream closed
        options.onClosed?.();
        // Clear permission request when stream closes
        setCurrentPermissionRequest(null);
        break;

      case 'permission_request':
        // Handle permission request
        setCurrentPermissionRequest(event.data);
        options.onPermissionRequest?.(event.data);
        break;
    }
  }, [addMessage, options, currentWorkingDirectory]);

  // Set all messages at once (for loading from API)
  const setAllMessages = useCallback((newMessages: ChatMessage[]) => {
    // Separate parent and child messages
    const parentMessages: ChatMessage[] = [];
    const newChildrenMessages: Record<string, ChatMessage[]> = {};
    
    newMessages.forEach(message => {
      if (message.parentToolUseId) {
        // This is a child message
        if (!newChildrenMessages[message.parentToolUseId]) {
          newChildrenMessages[message.parentToolUseId] = [];
        }
        newChildrenMessages[message.parentToolUseId].push(message);
      } else {
        // This is a parent message
        parentMessages.push(message);
      }
    });
    
    setMessages(prev => {
      return parentMessages;
    });
    
    setChildrenMessages(newChildrenMessages);

    // Extract the working directory from the loaded messages (use the most recent one)
    const mostRecentWorkingDir = newMessages
      .slice()
      .reverse()
      .find(msg => msg.workingDirectory)?.workingDirectory;
    
    if (mostRecentWorkingDir) {
      setCurrentWorkingDirectory(mostRecentWorkingDir);
    }

    // Build tool results from loaded messages in chronological order
    const newToolResults: Record<string, ToolResult> = {};
    
    // Process messages in order to properly track tool use/result pairs
    newMessages.forEach(message => {
      if (message.type === 'assistant' && Array.isArray(message.content)) {
        // Track tool uses from assistant messages
        message.content.forEach(block => {
          if (block.type === 'tool_use' && block.id) {
            newToolResults[block.id] = { status: 'pending' };
          }
        });
      } else if (message.type === 'user' && Array.isArray(message.content)) {
        // Update with tool results from user messages
        message.content.forEach(block => {
          // Type guard to check if this is a tool result block (using any since tool_result is not in SDK types)
          const toolResultBlock = block as any;
          if (typeof toolResultBlock === 'object' && toolResultBlock !== null &&
              'type' in toolResultBlock && toolResultBlock.type === 'tool_result' &&
              'tool_use_id' in toolResultBlock) {
            const toolUseId = toolResultBlock.tool_use_id;

            // Only update if we've seen this tool use before
            if (newToolResults[toolUseId]) {
              let result: string | ContentBlockParam[] = '';

              if (typeof toolResultBlock.content === 'string') {
                result = toolResultBlock.content;
              } else if (Array.isArray(toolResultBlock.content)) {
                result = toolResultBlock.content;
              }

              newToolResults[toolUseId] = {
                status: 'completed',
                result,
                is_error: toolResultBlock.is_error
              };
            }
          }
        });
      }
    });

    setToolResults(newToolResults);
  }, []);

  // Toggle task expansion
  const toggleTaskExpanded = useCallback((toolUseId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(toolUseId)) {
        next.delete(toolUseId);
      } else {
        next.add(toolUseId);
      }
      return next;
    });
  }, []);

  // Clear current permission request
  const clearPermissionRequest = useCallback(() => {
    setCurrentPermissionRequest(null);
  }, []);

  // Set permission request (for loading existing permissions)
  const setPermissionRequest = useCallback((permission: PermissionRequest) => {
    setCurrentPermissionRequest(permission);
  }, []);

  return {
    messages,
    toolResults,
    currentPermissionRequest,
    childrenMessages,
    expandedTasks,
    addMessage,
    clearMessages,
    handleStreamMessage,
    setAllMessages,
    toggleTaskExpanded,
    clearPermissionRequest,
    setPermissionRequest,
  };
}