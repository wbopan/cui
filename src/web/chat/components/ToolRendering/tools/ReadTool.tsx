import React from 'react';
import { countLines } from '../../../utils/tool-utils';
import { detectLanguageFromPath } from '../../../utils/language-detection';
import { CodeHighlight } from '../../CodeHighlight';
import { ToolCollapse } from '../ToolCollapse';

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

  const cleanedContent = cleanFileContent(result);
  const lineCount = countLines(cleanedContent);
  const filePath = input?.file_path || '';
  const language = detectLanguageFromPath(filePath);

  return (
    <ToolCollapse 
      summaryText={`Read ${lineCount} line${lineCount !== 1 ? 's' : ''}`}
      defaultExpanded={false}
      ariaLabel="Toggle file content"
    >
      {cleanedContent && (
        <CodeHighlight
          code={cleanedContent}
          language={language}
          showLineNumbers={true}
          className="bg-neutral-950 rounded-xl overflow-hidden mt-1"
        />
      )}
    </ToolCollapse>
  );
}