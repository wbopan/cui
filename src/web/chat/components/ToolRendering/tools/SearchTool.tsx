import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import { countLines, extractFileCount } from '../../../utils/tool-utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/web/chat/components/ui/collapsible';

interface SearchToolProps {
  input: any;
  result: string;
  toolType: 'Grep' | 'Glob' | 'LS';
}

export function SearchTool({ input, result, toolType }: SearchToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSummaryText = (): string => {
    switch (toolType) {
      case 'Grep':
        const lineCount = countLines(result);
        return `Found ${lineCount} line${lineCount !== 1 ? 's' : ''}`;
      
      case 'Glob':
        const fileCount = countLines(result);
        return `Found ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
      
      case 'LS':
        const pathCount = extractFileCount(result);
        return `Listed ${pathCount} path${pathCount !== 1 ? 's' : ''}`;
      
      default:
        return 'Search completed';
    }
  };

  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div 
            className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground flex items-center gap-1"
            aria-label={`Toggle ${getSummaryText().toLowerCase()} details`}
          >
            <CornerDownRight 
              size={12} 
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
            {getSummaryText()}
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          {result && (
            <div className="bg-neutral-950 rounded-xl overflow-hidden">
              <pre className="m-0 p-3 text-neutral-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{result}</pre>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}