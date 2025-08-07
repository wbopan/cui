import React, { useState, useEffect, useRef } from 'react';
import { api } from '../chat/services/api';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { cn } from '@/web/chat/lib/utils';

interface LogEntry {
  timestamp: string;
  level: string;
  component?: string;
  msg: string;
  [key: string]: any;
}

interface LogMonitorProps {
  isVisible: boolean;
  onToggle: () => void;
}

function LogMonitor({ isVisible, onToggle }: LogMonitorProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    if (isVisible && !readerRef.current) {
      connectToLogStream();
    }

    return () => {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }
    };
  }, [isVisible]);


  const connectToLogStream = async () => {
    try {
      // First get recent logs
      try {
        const recentData = await api.getRecentLogs(100);
        if (recentData.logs) {
          setLogs(recentData.logs);
        }
      } catch (error) {
        console.error('Failed to get recent logs:', error);
      }

      // Then connect to stream
      const response = await api.fetchWithAuth(api.getLogStreamUrl());
      if (!response.ok) {
        console.error('Failed to connect to log stream');
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      readerRef.current = reader;
      setIsConnected(true);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            // Handle SSE format
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              setLogs(prev => [...prev, data]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Log stream error:', error);
    } finally {
      setIsConnected(false);
      readerRef.current = null;
    }
  };

  const parseLogLine = (line: string): { formatted: JSX.Element; matchesFilter: boolean } => {
    // Check if line matches filter
    const matchesFilter = !filter || line.toLowerCase().includes(filter.toLowerCase());

    try {
      // Try to parse as JSON
      const parsed: LogEntry = JSON.parse(line);
      
      // Extract relevant fields, hide redundant ones
      const { level, time, component, msg, pid, hostname, requestId, ...rest } = parsed;
      
      // Format timestamp
      const timestamp = time ? new Date(time).toLocaleTimeString() : '';
      
      // Determine color based on log level
      const levelColors: Record<string, string> = {
        'debug': 'text-neutral-500',
        'info': 'text-green-400',
        'warn': 'text-yellow-300',
        'error': 'text-red-400',
        'fatal': 'text-red-600'
      };
      const levelColorClass = levelColors[level] || 'text-neutral-300';

      // Build compact display
      const formatted = (
        <div className="flex items-baseline gap-2 py-0.5 border-b border-neutral-700">
          <span className="text-neutral-500 text-[11px]">{timestamp}</span>
          <span className={cn("font-bold text-[11px]", levelColorClass)}>[{level?.toUpperCase() || 'LOG'}]</span>
          {component && <span className="text-blue-400 text-[11px]">[{component}]</span>}
          <span className="flex-1 text-neutral-300">{msg}</span>
          {requestId && <span className="text-neutral-500 text-[11px]"> (req: {requestId})</span>}
          {Object.keys(rest).length > 0 && (
            <span className="text-neutral-500 text-[11px]"> {JSON.stringify(rest)}</span>
          )}
        </div>
      );

      return { formatted, matchesFilter };
    } catch {
      // Not JSON, display as plain text
      const formatted = <div className="text-neutral-300 border-0">{line}</div>;
      return { formatted, matchesFilter };
    }
  };

  const filteredLogs = logs
    .map((log, index) => {
      const { formatted, matchesFilter } = parseLogLine(log);
      return matchesFilter ? (
        <div key={index} className="my-0.5">
          {formatted}
        </div>
      ) : null;
    })
    .filter(Boolean);

  return (
    <div className={cn(
      "flex flex-col border-t-2 border-neutral-300 bg-neutral-900",
      isVisible ? "absolute top-0 left-0 right-0 bottom-0 h-full z-[100]" : "h-10"
    )}>
      <div className="flex items-center p-2.5 bg-neutral-800 border-b border-neutral-600 gap-2.5">
        <Button 
          className="bg-neutral-700 hover:bg-neutral-600 text-white border-0 py-1 px-4 text-xs rounded h-auto"
          onClick={onToggle}
          aria-label={isVisible ? "Collapse log monitor" : "Expand log monitor"}
        >
          {isVisible ? '▼' : '▲'} Logs
        </Button>
        <Input
          type="text"
          className="flex-1 bg-neutral-900 text-neutral-300 border border-neutral-600 py-1 px-2.5 text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={!isVisible}
          aria-label="Filter log entries"
        />
        <Button 
          className="bg-neutral-700 hover:bg-neutral-600 text-white border-0 py-1 px-4 text-xs rounded h-auto disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setLogs([])}
          disabled={!isVisible}
          aria-label="Clear all log entries"
        >
          Clear
        </Button>
        <span className={cn(
          "text-xs",
          isConnected ? "text-green-400" : "text-neutral-500"
        )}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
      {isVisible && (
        <div 
          className="flex-1 overflow-y-auto p-2.5 bg-neutral-900 text-neutral-300 font-mono text-xs leading-relaxed min-h-0"
          ref={logContainerRef}
        >
          {filteredLogs.length > 0 ? filteredLogs : (
            <div className="text-neutral-500 text-center py-5">No logs to display</div>
          )}
        </div>
      )}
    </div>
  );
}

export default LogMonitor;