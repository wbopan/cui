import React, { useState } from 'react';
import { Highlight, Language } from 'prism-react-renderer';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '@/web/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { cn } from "@/web/chat/lib/utils";

interface CodeHighlightProps {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  className?: string;
}

// Map our language identifiers to prism-react-renderer language names
const languageMap: Record<string, Language> = {
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
  scala: 'scala',
  r: 'r',
  matlab: 'matlab',
  sql: 'sql',
  bash: 'bash',
  powershell: 'powershell',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  yaml: 'yaml',
  json: 'json',
  xml: 'xml',
  html: 'markup',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  markdown: 'markdown',
  latex: 'latex',
  vim: 'vim',
  lua: 'lua',
  perl: 'perl',
  objectivec: 'objectivec',
  fsharp: 'fsharp',
  ocaml: 'ocaml',
  haskell: 'haskell',
  elixir: 'elixir',
  erlang: 'erlang',
  clojure: 'clojure',
  lisp: 'lisp',
  scheme: 'scheme',
  fortran: 'fortran',
  pascal: 'pascal',
  dart: 'dart',
  groovy: 'groovy',
  solidity: 'solidity',
  graphql: 'graphql',
  wasm: 'wasm',
  vhdl: 'vhdl',
  verilog: 'verilog',
  asm: 'asm6502',
  diff: 'diff',
  ini: 'ini',
  toml: 'toml',
  gitignore: 'gitignore',
  text: 'text',
};

// Xcode-like themes for light and dark modes
const darkTheme = {
  plain: {
    color: '#ffffff',
    backgroundColor: '#292a30',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: {
        color: '#6c7986',
        fontStyle: 'italic' as const,
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: '#ffffff',
      },
    },
    {
      types: ['property', 'tag', 'boolean', 'number', 'constant', 'symbol'],
      style: {
        color: '#d0a8ff',
      },
    },
    {
      types: ['deleted', 'selector', 'attr-name', 'string', 'char', 'builtin'],
      style: {
        color: '#fc6a5d',
      },
    },
    {
      types: ['inserted'],
      style: {
        color: '#67b7a4',
      },
    },
    {
      types: ['operator', 'entity', 'url'],
      style: {
        color: '#ffffff',
      },
    },
    {
      types: ['atrule', 'attr-value', 'keyword'],
      style: {
        color: '#fc5fa3',
        fontWeight: 'bold' as const,
      },
    },
    {
      types: ['function', 'class-name'],
      style: {
        color: '#67b7a4',
      },
    },
    {
      types: ['regex', 'important', 'variable'],
      style: {
        color: '#a167e6',
      },
    },
  ],
};

const lightTheme = {
  plain: {
    color: '#262626',
    backgroundColor: '#ffffff',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: {
        color: '#5d6c79',
        fontStyle: 'italic' as const,
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: '#262626',
      },
    },
    {
      types: ['property', 'tag', 'boolean', 'number', 'constant', 'symbol'],
      style: {
        color: '#aa0d91',
      },
    },
    {
      types: ['deleted', 'selector', 'attr-name', 'string', 'char', 'builtin'],
      style: {
        color: '#c41a16',
      },
    },
    {
      types: ['inserted'],
      style: {
        color: '#1c00cf',
      },
    },
    {
      types: ['operator', 'entity', 'url'],
      style: {
        color: '#262626',
      },
    },
    {
      types: ['atrule', 'attr-value', 'keyword'],
      style: {
        color: '#aa0d91',
        fontWeight: 'bold' as const,
      },
    },
    {
      types: ['function', 'class-name'],
      style: {
        color: '#1c00cf',
      },
    },
    {
      types: ['regex', 'important', 'variable'],
      style: {
        color: '#5c2699',
      },
    },
  ],
};

export const CodeHighlight: React.FC<CodeHighlightProps> = ({
  code,
  language,
  showLineNumbers = false,
  className = '',
}) => {
  const theme = useTheme();
  const currentTheme = theme.mode === 'dark' ? darkTheme : lightTheme;
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get the prism language, fallback to text if not found
  const prismLanguage = languageMap[language.toLowerCase()] || 'text';

  return (
    <Highlight
      theme={currentTheme}
      code={code.trimEnd()}
      language={prismLanguage as Language}
    >
      {({ className: highlightClassName, style, tokens, getLineProps, getTokenProps }) => {
        const totalLines = tokens.length;
        const shouldShowExpandButton = totalLines > 8;
        const linesToShow = isExpanded ? tokens : tokens.slice(0, 8);
        const hiddenLinesCount = totalLines - 8;
        
        return (
          <div className="relative">
            {shouldShowExpandButton && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="absolute top-2 right-2 h-6 w-6 z-10 text-muted-foreground hover:text-foreground"
                      aria-label={isExpanded ? "Show fewer lines" : "Show all lines"}
                    >
                      {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isExpanded ? "Show fewer lines" : "Show all lines"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <pre
              className={cn(
                "bg-card text-card-foreground p-3 rounded-md overflow-hidden whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.8] m-0 border border-border",
                highlightClassName,
                className
              )}
              style={{ ...style, margin: 0 }}
            >
              <code className="block font-mono text-[13px] leading-[1.8] whitespace-pre-wrap break-words">
                {linesToShow.map((line, i) => {
                  const { key, ...lineProps } = getLineProps({ line, key: i });
                  return (
                    <div key={i} {...lineProps} className="table-row">
                      {showLineNumbers && (
                        <span className="table-cell text-right pr-4 select-none text-neutral-500 dark:text-neutral-400 min-w-[2.5rem] bg-transparent">
                          {i + 1}
                        </span>
                      )}
                      <span className="table-cell w-full whitespace-pre-wrap break-words">
                        {line.map((token, key) => {
                          const { key: tokenKey, ...tokenProps } = getTokenProps({ token, key });
                          return (
                            <span key={key} {...tokenProps} />
                          );
                        })}
                      </span>
                    </div>
                  );
                })}
                {!isExpanded && shouldShowExpandButton && (
                  <div className="table-row">
                    {showLineNumbers && (
                      <span className="table-cell text-right pr-4 select-none text-neutral-500 dark:text-neutral-400 min-w-[2.5rem] bg-transparent"></span>
                    )}
                    <span className="table-cell w-full whitespace-pre-wrap break-words text-neutral-500 dark:text-neutral-400 italic">
                      ... +{hiddenLinesCount} lines
                    </span>
                  </div>
                )}
              </code>
            </pre>
          </div>
        );
      }}
    </Highlight>
  );
};