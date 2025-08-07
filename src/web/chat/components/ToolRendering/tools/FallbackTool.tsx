import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/web/chat/components/ui/collapsible';

interface FallbackToolProps {
  toolName: string;
  input: any;
  result: string;
}

export function FallbackTool({ toolName, input, result }: FallbackToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatContent = (content: string): string => {
    try {
      // Try to parse and format as JSON if possible
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If not JSON, return as-is
      return content;
    }
  };

  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div 
            className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground flex items-center gap-1"
            aria-label={`Toggle ${toolName} details`}
          >
            <CornerDownRight 
              size={12} 
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
            {toolName} completed
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="space-y-1">
          {result && (
            <div className="bg-neutral-950 rounded-xl overflow-hidden">
              <pre className="m-0 p-3 text-neutral-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                {formatContent(result || 'No result')}
              </pre>
            </div>
          )}
          
          {/* Always show input in expanded state for debugging */}
          {input && (
            <div className="bg-secondary rounded-xl p-3 overflow-x-auto font-mono text-xs leading-relaxed">
              <strong className="text-foreground">Input:</strong>
              <pre className="m-0 mt-1 whitespace-pre-wrap break-words">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}