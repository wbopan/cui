import React, { useRef, useEffect } from 'react';
import { MessageItem } from './MessageItem';
import type { ChatMessage, ToolResult } from '../../types';

export interface MessageListProps {
  messages: ChatMessage[];
  toolResults?: Record<string, ToolResult>;
  childrenMessages?: Record<string, ChatMessage[]>;
  expandedTasks?: Set<string>;
  onToggleTaskExpanded?: (toolUseId: string) => void;
  isLoading?: boolean;
  isStreaming?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  toolResults = {}, 
  childrenMessages = {}, 
  expandedTasks = new Set(), 
  onToggleTaskExpanded,
  isLoading, 
  isStreaming
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  // Filter out user messages that only contain tool_result blocks
  const displayMessages = messages.filter(message => {
    if (message.type === 'user' && Array.isArray(message.content)) {
      const allToolResults = message.content.every((block: any) => block.type === 'tool_result');
      if (allToolResults) {
        return false; // Don't display tool result messages
      }
    }
    return true;
  });

  // Group consecutive messages by type to create message groups
  const messageGroups: Array<{type: 'user' | 'assistant' | 'error' | 'system', messages: ChatMessage[]}> = [];
  displayMessages.forEach((message) => {
    const lastGroup = messageGroups[messageGroups.length - 1];
    if (lastGroup && lastGroup.type === message.type) {
      lastGroup.messages.push(message);
    } else {
      messageGroups.push({ type: message.type, messages: [message] });
    }
  });

  if (displayMessages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="text-center p-8 text-muted-foreground">
          <p>No messages yet. Start by typing a message below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background" ref={containerRef}>
      <div className="flex flex-col py-6 max-w-3xl mx-auto w-full box-border">
        {messageGroups.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`} className="flex flex-col gap-2 px-4 box-border">
            {group.messages.map((message, messageIndex) => (
              <MessageItem 
                key={message.messageId} 
                message={message} 
                toolResults={toolResults}
                childrenMessages={childrenMessages}
                expandedTasks={expandedTasks}
                onToggleTaskExpanded={onToggleTaskExpanded}
                isFirstInGroup={messageIndex === 0}
                isLastInGroup={messageIndex === group.messages.length - 1}
                isStreaming={isStreaming}
              />
            ))}
            {((groupIndex < messageGroups.length - 1 && 
              group.type === 'user' && 
              messageGroups[groupIndex + 1].type === 'assistant') ||
             (group.type === 'user' && 
              groupIndex === messageGroups.length - 1 && 
              isStreaming)) && (
              <div className="h-px bg-border/20 my-2 w-full" />
            )}
          </div>
        ))}
        
        {isLoading && displayMessages.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.32s]" aria-label="Loading dot 1"></span>
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.16s]" aria-label="Loading dot 2"></span>
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" aria-label="Loading dot 3"></span>
            </div>
          </div>
        )}
        
        {!isLoading && isStreaming && messageGroups.length > 0 && (() => {
          // Check if any tool use blocks are currently loading
          const hasLoadingToolUse = displayMessages.some(message => {
            if (message.type === 'assistant' && Array.isArray(message.content)) {
              return message.content.some((block: any) => {
                if (block.type === 'tool_use') {
                  const toolResult = toolResults[block.id];
                  return !toolResult || toolResult.status === 'pending';
                }
                return false;
              });
            }
            return false;
          });
          
          // Only show streaming dots when no tool use icons are blinking
          return !hasLoadingToolUse ? (
            <div className="flex items-start px-4 mt-2">
              <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
                <div className="w-2.5 h-2.5 bg-foreground rounded-full mt-3.5 animate-pulse" aria-label="Streaming indicator" />
                {/* Connector from last message */}
                <div className="absolute left-1.5 -top-3 w-px h-5 bg-border hidden" />
              </div>
            </div>
          ) : null;
        })()}
        
        <div ref={bottomRef} />
      </div>

    </div>
  );
};