import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from "../../lib/utils";
import { Button } from '../ui/button';

interface JsonViewerProps {
  data: any;
  collapsed?: boolean;
  depth?: number;
}

export function JsonViewer({ data, collapsed = false, depth = 0 }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderValue = (value: any, key?: string): React.ReactNode => {
    if (value === null) {
      return <span className="text-neutral-500 dark:text-neutral-400">null</span>;
    }

    if (value === undefined) {
      return <span className="text-neutral-500 dark:text-neutral-400">undefined</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-blue-600 dark:text-blue-400">{value.toString()}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-green-600 dark:text-green-400">{value}</span>;
    }

    if (typeof value === 'string') {
      return <span className="text-emerald-700 dark:text-orange-300">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-foreground">[]</span>;
      }

      return (
        <span className="inline-block">
          <button
            className="inline-flex items-center justify-center w-4 h-4 mr-0.5 text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand array' : 'Collapse array'}
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <span className="text-foreground">[</span>
          {isCollapsed ? (
            <span className="text-neutral-500 dark:text-neutral-400 italic mx-1">...{value.length} items</span>
          ) : (
            <div className="ml-[18px]">
              {value.map((item, index) => (
                <div key={index} className="my-0.5">
                  <span className="text-muted-foreground mr-1">{index}:</span>
                  {renderValue(item)}
                  {index < value.length - 1 && <span className="text-foreground">,</span>}
                </div>
              ))}
            </div>
          )}
          <span className="text-foreground">]</span>
        </span>
      );
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <span className="text-foreground">{'{}'}</span>;
      }

      return (
        <span className="inline-block">
          <button
            className="inline-flex items-center justify-center w-4 h-4 mr-0.5 text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand object' : 'Collapse object'}
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <span className="text-foreground">{'{'}</span>
          {isCollapsed ? (
            <span className="text-neutral-500 dark:text-neutral-400 italic mx-1">...{entries.length} properties</span>
          ) : (
            <div className="ml-[18px]">
              {entries.map(([k, v], index) => (
                <div key={k} className="my-0.5">
                  <span className="text-blue-700 dark:text-blue-300">"{k}"</span>
                   <span className="text-foreground mx-1">:</span>
                  {renderValue(v, k)}
                  {index < entries.length - 1 && <span className="text-foreground">,</span>}
                </div>
              ))}
            </div>
          )}
          <span className="text-black dark:text-neutral-300">{'}'}</span>
        </span>
      );
    }

    return <span className="text-neutral-500 dark:text-neutral-400">{String(value)}</span>;
  };

  return (
    <div className="relative font-mono text-xs leading-relaxed p-2 bg-neutral-50 dark:bg-neutral-900 rounded overflow-auto">
      {depth === 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={handleCopy}
          aria-label="Copy JSON to clipboard"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      )}
      {renderValue(data)}
    </div>
  );
}