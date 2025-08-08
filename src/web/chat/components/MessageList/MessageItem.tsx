import React, { useState } from 'react';
import { Copy, Check, Code, Globe, Settings, FileText, Edit, Terminal, Search, List, CheckSquare, ExternalLink, Play, FileEdit, ClipboardList, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { JsonViewer } from '../JsonViewer/JsonViewer';
import { ToolUseRenderer } from '../ToolRendering/ToolUseRenderer';
import { CodeHighlight } from '../CodeHighlight';
import type { ChatMessage, ToolResult } from '../../types';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';

interface MessageItemProps {
  message: ChatMessage;
  toolResults?: Record<string, ToolResult>;
  childrenMessages?: Record<string, ChatMessage[]>;
  expandedTasks?: Set<string>;
  onToggleTaskExpanded?: (toolUseId: string) => void;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isStreaming?: boolean;
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'Read':
      return <FileText size={15} />;
    case 'Edit':
    case 'MultiEdit':
      return <Edit size={15} />;
    case 'Bash':
      return <Terminal size={15} />;
    case 'Grep':
    case 'Glob':
      return <Search size={15} />;
    case 'LS':
      return <List size={15} />;
    case 'TodoRead':
    case 'TodoWrite':
      return <CheckSquare size={15} />;
    case 'WebSearch':
      return <Globe size={15} />;
    case 'WebFetch':
      return <ExternalLink size={15} />;
    case 'Task':
      return <Play size={15} />;
    case 'exit_plan_mode':
      return <ClipboardList size={15} />;
    case 'Write':
      return <FileEdit size={15} />;
    default:
      return <Settings size={15} />;
  }
}

// Custom components for ReactMarkdown
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : 'text';
    
    if (!inline && match) {
      return (
        <CodeHighlight
          code={String(children).replace(/\n$/, '')}
          language={language}
          className="bg-neutral-900 rounded-md overflow-hidden max-w-full box-border"
        />
      );
    }
    
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

export function MessageItem({ 
  message, 
  toolResults = {}, 
  childrenMessages = {}, 
  expandedTasks = new Set(), 
  onToggleTaskExpanded,
  isFirstInGroup = true, 
  isLastInGroup = true,
  isStreaming = false
}: MessageItemProps) {
  const [copiedBlocks, setCopiedBlocks] = useState<Set<string>>(new Set());
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);

  const copyContent = async (content: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedBlocks(prev => new Set(prev).add(blockId));
      setTimeout(() => {
        setCopiedBlocks(prev => {
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle user messages
  if (message.type === 'user') {
    const content = typeof message.content === 'string' 
      ? message.content 
      : Array.isArray(message.content) 
        ? message.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('\n')
        : '';
    
    const lines = content.split('\n');
    const shouldShowExpandButton = lines.length > 8;
    const displayLines = isUserMessageExpanded ? lines : lines.slice(0, 8);
    const hiddenLinesCount = lines.length - 8;
    const displayContent = displayLines.join('\n');
    
    return (
      <div className="flex justify-end w-full my-1">
        <div className="relative bg-card text-card-foreground border border-border rounded-xl p-3 max-w-[80%] min-w-[100px]">
          {shouldShowExpandButton && (
            <button
              onClick={() => setIsUserMessageExpanded(!isUserMessageExpanded)}
              className="absolute top-2 right-2 w-6 h-6 border-none bg-transparent text-neutral-600 cursor-pointer flex items-center justify-center p-0 z-10 hover:text-neutral-900"
              aria-label={isUserMessageExpanded ? "Show fewer lines" : "Show all lines"}
            >
              {isUserMessageExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {displayContent}
            {!isUserMessageExpanded && shouldShowExpandButton && (
              <span className="text-muted-foreground italic">
                {'\n'}... +{hiddenLinesCount} lines
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle assistant messages with timeline
  if (message.type === 'assistant') {
    const renderContent = () => {
      if (typeof message.content === 'string') {
        return (
            <div className="flex gap-2 items-start">
              <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
                <div className="mt-1 w-2.5 h-2.5 bg-foreground rounded-full" />
              </div>
              <div className="flex-1 min-w-0 prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
            </div>
          </div>
        );
      }

      if (Array.isArray(message.content)) {
        return message.content.map((block: any, index: number) => {
          const blockId = `${message.messageId}-${index}`;
          const isLastBlock = index === message.content.length - 1;

          if (block.type === 'text') {
            return (
              <div key={blockId} className="flex gap-2 items-start">
                <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
                  <div className="mt-1 w-2.5 h-2.5 bg-foreground rounded-full" />
                </div>
                <div className="flex-1 min-w-0 prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown components={markdownComponents}>{block.text}</ReactMarkdown>
                </div>
              </div>
            );
          }

          if (block.type === 'thinking') {
            return (
              <div key={blockId} className="flex gap-2 items-start">
                <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
                  <div className="mt-1 w-2.5 h-2.5 bg-foreground rounded-full" />
                </div>
                <div className="flex-1 min-w-0 prose prose-sm max-w-none italic text-muted-foreground dark:prose-invert">
                  <ReactMarkdown components={markdownComponents}>{block.thinking}</ReactMarkdown>
                </div>
              </div>
            );
          }

          if (block.type === 'tool_use') {
            const toolResult = toolResults[block.id];
            const isLoading = !toolResult || toolResult.status === 'pending';
            const shouldBlink = isLoading && isStreaming;
            
            return (
              <div key={blockId} className="flex gap-2 items-start">
                <div className={`w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative ${shouldBlink ? 'animate-pulse' : ''}`}>
                  {getToolIcon(block.name)}
                </div>
                <div className="flex-1 flex flex-col gap-2 min-w-0 break-words">
                  <ToolUseRenderer
                    toolUse={block}
                    toolResult={toolResult}
                    toolResults={toolResults}
                    workingDirectory={message.workingDirectory}
                    childrenMessages={childrenMessages}
                    expandedTasks={expandedTasks}
                    onToggleTaskExpanded={onToggleTaskExpanded}
                  />
                </div>
              </div>
            );
          }

          // Default: render as JSON
          return (
            <div key={blockId} className="flex gap-2 items-start">
              <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
                <Code size={15} />
              </div>
              <div className="flex-1 text-sm leading-relaxed text-foreground min-w-0 break-words">
                <JsonViewer data={block} />
              </div>
            </div>
          );
        });
      }

      // Fallback
      return (
        <div className="flex gap-2 items-start">
          <div className="w-4 h-5 flex-shrink-0 flex items-center justify-center text-foreground relative">
            <div className="w-2.5 h-2.5 bg-foreground rounded-full" />
          </div>
          <div className="flex-1 text-sm leading-relaxed text-foreground min-w-0 break-words">
            <JsonViewer data={message.content} />
          </div>
        </div>
      );
    };

    return (
      <div className="relative w-full flex flex-col gap-3 my-1">
        {renderContent()}
      </div>
    );
  }

  // Handle error messages
  if (message.type === 'error') {
    return (
      <div className="w-full my-2">
        <div className="text-red-600 text-sm p-3 bg-red-50 rounded-md border border-red-200">
          {String(message.content)}
        </div>
      </div>
    );
  }

  // Default fallback
  return null;
}

