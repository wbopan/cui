import { useEffect, useRef, useCallback, useState } from 'react';
import type { StreamEvent } from '../types';
import { getAuthToken } from '../../hooks/useAuth';

interface UseStreamingOptions {
  onMessage: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useStreaming(
  streamingId: string | null,
  options: UseStreamingOptions
) {
  const [isConnected, setIsConnected] = useState(false);
  const [shouldReconnect, setShouldReconnect] = useState(true);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const optionsRef = useRef(options);
  
  // Keep options ref up to date
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const disconnect = useCallback(() => {
    setShouldReconnect(false); // Mark as intentional disconnect
    
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsConnected((prev) => {
      if (prev) {
        optionsRef.current.onDisconnect?.();
      }
      return false;
    });
  }, []);

  const connect = useCallback(async () => {
    // Guard against connection without streamingId
    if (!streamingId) {
      return;
    }

    // If already connecting/connected, skip
    if (abortControllerRef.current) {
      return;
    }

    setShouldReconnect(true); // Reset to allow reconnection

    try {
      abortControllerRef.current = new AbortController();
      
      // Get auth token for Bearer authorization
      const authToken = getAuthToken();
      const headers: Record<string, string> = {};
      
      // Add Bearer token if available
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      
      const response = await fetch(`/api/stream/${streamingId}`, {
        signal: abortControllerRef.current.signal,
        headers,
      });

      if (!response.ok) {
        throw new Error(`Stream connection failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      setIsConnected(true);
      optionsRef.current.onConnect?.();

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decoded = decoder.decode(value, { stream: true });
        buffer += decoded;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              // Handle SSE format: remove "data: " prefix
              let jsonLine = line;
              if (line.startsWith('data: ')) {
                jsonLine = line.substring(6);
              }
              
              // Skip SSE comments (lines starting with :)
              if (line.startsWith(':')) {
                continue;
              }
              
              const event = JSON.parse(jsonLine) as StreamEvent;
              optionsRef.current.onMessage(event);
            } catch (err) {
              console.error('Failed to parse stream message:', line, err);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Stream error:', error);
        optionsRef.current.onError?.(error);
      }
    } finally {
      const wasIntentional = !shouldReconnect;
      disconnect();
      
      // Auto-reconnect if unintentional and page visible
      if (!wasIntentional && document.visibilityState === 'visible' && streamingId) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setShouldReconnect(true);
          connect();
        }, 5000);
      }
    }
  }, [streamingId, disconnect]);

  useEffect(() => {
    // Clean up previous connection before establishing new one
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsConnected(false);

    if (streamingId) {
      // Small delay to ensure cleanup is complete
      const timeoutId = setTimeout(() => {
        connect();
      }, 50);
      return () => {
        clearTimeout(timeoutId);
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [streamingId]); // Only depend on streamingId, not the callbacks

  // Handle visibility change for reconnection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 
          !isConnected && 
          shouldReconnect && 
          streamingId) {
        clearTimeout(reconnectTimeoutRef.current);
        connect();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [isConnected, shouldReconnect, streamingId, connect]);

  return {
    isConnected,
    connect,
    disconnect,
  };
}