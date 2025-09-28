import React from 'react';
import { formatFilePath, formatToolInput, extractDomain } from '../../utils/tool-utils';

interface ToolLabelProps {
  toolName: string;
  toolInput: any;
  workingDirectory?: string;
  onClick?: () => void;
}

export function ToolLabel({ toolName, toolInput, workingDirectory, onClick }: ToolLabelProps) {
  
  const generateLabel = (): React.ReactNode => {
    switch (toolName) {
      case 'Read': {
        const filePath = formatFilePath(toolInput.file_path, workingDirectory);
        const offset = toolInput.offset;
        const limit = toolInput.limit;
        
        let pathWithRange = filePath;
        
        if (offset !== undefined && limit !== undefined) {
          pathWithRange = `${filePath}:${offset},${offset + limit}`;
        } else if (offset !== undefined) {
          pathWithRange = `${filePath}:${offset}`;
        } else if (limit !== undefined) {
          pathWithRange = `${filePath}:0,${limit}`;
        }
        
        return (
          <>
            <span className="font-semibold">Read</span>
            <span className="font-normal">({pathWithRange})</span>
          </>
        );
      }
      
      case 'Edit':
        return (
          <>
            <span className="font-semibold">Update</span>
            <span className="font-normal">({formatFilePath(toolInput.file_path, workingDirectory)})</span>
          </>
        );
      
      case 'MultiEdit':
        return (
          <>
            <span className="font-semibold">MultiEdit</span>
            <span className="font-normal">({formatFilePath(toolInput.file_path, workingDirectory)})</span>
          </>
        );
      
      case 'Bash':
        return (
          <>
            <span className="font-semibold">Bash</span>
            <span className="font-normal">({toolInput.command || ''})</span>
          </>
        );
      
      case 'Grep':
        return (
          <>
            <span className="font-semibold">Search</span>
            <span className="font-normal">(pattern: "{toolInput.pattern || ''}", path: "{toolInput.path || ''}")</span>
          </>
        );
      
      case 'Glob':
        return (
          <>
            <span className="font-semibold">Search</span>
            <span className="font-normal">(pattern: "{toolInput.pattern || ''}", path: "{toolInput.path || ''}")</span>
          </>
        );
      
      case 'LS':
        return (
          <>
            <span className="font-semibold">List</span>
            <span className="font-normal">({formatFilePath(toolInput.path, workingDirectory)})</span>
          </>
        );
      
      case 'TodoRead':
        return <span className="font-semibold">Read Todos</span>;
      
      case 'TodoWrite':
        return <span className="font-semibold">Update Todos</span>;
      
      case 'WebSearch':
        return (
          <>
            <span className="font-semibold">Web Search</span>
            <span className="font-normal">("{toolInput.query || ''}")</span>
          </>
        );
      
      case 'WebFetch':
        return (
          <>
            <span className="font-semibold">Fetch</span>
            <span className="font-normal">({toolInput.url || ''})</span>
          </>
        );
      
      case 'Task':
        return (
          <>
            <span className="font-semibold">Task</span>
            <span className="font-normal">({toolInput.description || ''})</span>
          </>
        );
      
      case 'exit_plan_mode':
      case 'ExitPlanMode':
        return <span className="font-semibold">Plan</span>;
      
      default:
        // Fallback for any unspecified tool
        return (
          <>
            <span className="font-semibold">{toolName}</span>
            <span className="font-normal">({formatToolInput(toolInput)})</span>
          </>
        );
    }
  };

  return (
    <div 
      className={`text-sm font-mono text-foreground mb-1 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      aria-label={`Tool: ${toolName}`}
    >
      {generateLabel()}
    </div>
  );
}