import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface XtermOutputProps {
  content: string;
  className?: string;
}

// Custom wheel handler that passes scroll events through to the page
function createPassthroughWheelHandler(): (event: WheelEvent) => boolean {
  return (_event: WheelEvent) => {
    // Return false to let the event propagate to the page
    // (true would mean "handled, don't propagate")
    return false;
  };
}

// Tailwind bg-neutral-950 = #0a0a0a
// Tailwind text-neutral-100 = #f5f5f5
const THEME = {
  background: '#0a0a0a',
  foreground: '#f5f5f5',
  cursor: '#0a0a0a', // Hide cursor
  selectionBackground: '#3a3a3a',
};

export function XtermOutput({ content, className = '' }: XtermOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Calculate dimensions based on content
    const lines = content.split('\n');
    const maxLineLength = Math.max(...lines.map(l => l.length), 80);
    const lineCount = lines.length;

    // Create terminal with customGlyphs for perfect box-drawing characters
    const terminal = new Terminal({
      customGlyphs: true,
      fontSize: 13,
      lineHeight: 1.4,
      fontFamily: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      fontWeight: '400',
      theme: THEME,
      cols: Math.min(maxLineLength + 2, 120),
      rows: Math.min(lineCount + 1, 50),
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 0,
      overviewRulerWidth: 0,
    });

    // Attach custom wheel handler that passes events through to the page
    // This ensures page scrolling works when mouse is over terminal output
    terminal.attachCustomWheelEventHandler(createPassthroughWheelHandler());

    terminal.open(containerRef.current);
    terminalRef.current = terminal;

    // Write content
    for (const line of lines) {
      terminal.writeln(line);
    }

    // Fit to content
    terminal.scrollToTop();

    return () => {
      terminal.dispose();
    };
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: THEME.background,
        padding: '12px',
      }}
    />
  );
}
