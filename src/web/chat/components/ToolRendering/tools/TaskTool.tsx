import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2, CornerDownRight } from 'lucide-react';
import type { ChatMessage } from '../../../types';
import { MessageItem } from '../../MessageList/MessageItem';
import { Button } from '@/web/chat/components/ui/button';

interface TaskToolProps {
  input: any;
  result: string;
  toolUseId?: string;
  childrenMessages?: Record<string, ChatMessage[]>;
  toolResults?: Record<string, any>;
}

export function TaskTool({ 
  input, 
  result, 
  toolUseId, 
  childrenMessages = {}, 
  toolResults = {}
}: TaskToolProps) {
  const hasChildren = toolUseId && childrenMessages[toolUseId] && childrenMessages[toolUseId].length > 0;
  const children = toolUseId ? childrenMessages[toolUseId] || [] : [];
  const [isFullHeight, setIsFullHeight] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive (only when not in full height)
  useEffect(() => {
    if (!isFullHeight && contentRef.current && children.length > 0) {
      contentRef.current.scrollTo({
        top: contentRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [children.length, isFullHeight]);

  return (
    <>
      {hasChildren && (
        <div className="flex flex-col gap-1 -mt-0.5">
          <div className="bg-secondary rounded-xl mt-1 relative overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:bg-background hover:text-foreground z-10"
              onClick={() => setIsFullHeight(!isFullHeight)}
              aria-label={isFullHeight ? "Collapse height" : "Expand height"}
            >
              {isFullHeight ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
            <div 
              ref={contentRef}
              className={`${isFullHeight 
                ? 'max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border' 
                : 'max-h-24 overflow-hidden [mask-image:linear-gradient(180deg,transparent_0,black_40%,black_45%,transparent_90%)]'
              } p-4 pt-8 pb-2 relative`}
            >
              {children.map((childMessage) => (
                <MessageItem
                  key={childMessage.messageId}
                  message={childMessage}
                  toolResults={toolResults}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 -mt-0.5">
        <div className="text-sm text-muted-foreground flex items-center gap-1">
          <CornerDownRight size={16} /> Task completed
        </div>
      </div>
    </>
  );
}