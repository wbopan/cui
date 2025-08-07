import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import { countLines } from '../../../utils/tool-utils';
import { detectLanguageFromPath } from '../../../utils/language-detection';
import { CodeHighlight } from '../../CodeHighlight';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/web/chat/components/ui/collapsible';

interface ReadToolProps {
  input: any;
  result: string;
  workingDirectory?: string;
}

function cleanFileContent(content: string): string {
  // Remove system-reminder tags and their content
  let cleaned = content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  
  // Remove line numbers with arrow format (e.g., "     1→" or "    10→")
  cleaned = cleaned.replace(/^\s*\d+→/gm, '');
  
  // Trim any extra whitespace at the end
  return cleaned.trimEnd();
}

export function ReadTool({ input, result, workingDirectory }: ReadToolProps) {
  if (!result) {
    return <div />;
  }

  const [isExpanded, setIsExpanded] = useState(false);

  const cleanedContent = cleanFileContent(result);
  const lineCount = countLines(cleanedContent);
  const filePath = input?.file_path || '';
  const language = detectLanguageFromPath(filePath);

  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground" aria-label="Toggle file content">
          <CornerDownRight 
            size={12} 
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
          Read {lineCount} line{lineCount !== 1 ? 's' : ''}
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          {cleanedContent && (
            <CodeHighlight
              code={cleanedContent}
              language={language}
              showLineNumbers={true}
              className="bg-neutral-950 rounded-xl overflow-hidden mt-1"
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}