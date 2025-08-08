import React from 'react';
import { CodeHighlight } from '../../CodeHighlight';
import { ToolCollapse } from '../ToolCollapse';

interface BashToolProps {
  input: any;
  result: string;
  workingDirectory?: string;
}

export function BashTool({ input, result }: BashToolProps) {
  return (
    <ToolCollapse 
      summaryText="Command output"
      defaultExpanded={true}
      ariaLabel="Toggle command output"
    >
      <CodeHighlight
        code={result || '(No content)'}
        language="text"
        showLineNumbers={false}
        className="bg-neutral-950 rounded-xl overflow-hidden"
      />
    </ToolCollapse>
  );
}