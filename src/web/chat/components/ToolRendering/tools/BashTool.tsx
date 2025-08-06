import React from 'react';
import { CodeHighlight } from '../../CodeHighlight';

interface BashToolProps {
  input: any;
  result: string;
  workingDirectory?: string;
}

export function BashTool({ input, result }: BashToolProps) {
  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <CodeHighlight
        code={result || '(No content)'}
        language="text"
        showLineNumbers={false}
        className="bg-neutral-950 rounded-xl overflow-hidden"
      />
    </div>
  );
}