import React from 'react';
import { countLines, extractFileCount } from '../../../utils/tool-utils';
import { ToolCollapse } from '../ToolCollapse';

interface SearchToolProps {
  input: any;
  result: string;
  toolType: 'Grep' | 'Glob' | 'LS';
}

export function SearchTool({ input, result, toolType }: SearchToolProps) {
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
    <ToolCollapse 
      summaryText={getSummaryText()}
      defaultExpanded={false}
      ariaLabel={`Toggle ${getSummaryText().toLowerCase()} details`}
    >
      {result && (
        <div className="bg-neutral-950 rounded-xl overflow-hidden">
          <pre className="m-0 p-3 text-neutral-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{result}</pre>
        </div>
      )}
    </ToolCollapse>
  );
}