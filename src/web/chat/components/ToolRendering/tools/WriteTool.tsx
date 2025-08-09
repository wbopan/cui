import React from 'react';
import { detectLanguageFromPath } from '../../../utils/language-detection';
import { DiffViewer } from './DiffViewer';
import { ToolCollapse } from '../ToolCollapse';

interface WriteToolProps {
  input: any;
  result: string;
  workingDirectory?: string;
}

export function WriteTool({ input, result, workingDirectory }: WriteToolProps) {
  const filePath = input?.file_path || '';
  const content = input?.content || '';
  const language = detectLanguageFromPath(filePath);

  return (
    <ToolCollapse 
      summaryText="New file created"
      defaultExpanded={true}
      ariaLabel="Toggle new file content"
    >
      <DiffViewer
        oldValue=""
        newValue={content}
        language={language}
      />
    </ToolCollapse>
  );
}