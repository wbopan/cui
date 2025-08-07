import React, { useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import Prism from 'prismjs';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTheme } from '../../../hooks/useTheme';
import { Button } from '@/web/chat/components/ui/button';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

interface DiffViewerProps {
  oldValue: string;
  newValue: string;
  language?: string;
}

export function DiffViewer({ oldValue, newValue, language = 'javascript' }: DiffViewerProps) {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Calculate total lines
  const oldLines = oldValue.split('\n');
  const newLines = newValue.split('\n');
  const totalLines = Math.max(oldLines.length, newLines.length);
  const shouldShowExpandButton = totalLines > 8;
  const hiddenLinesCount = totalLines - 8;
  
  // Truncate content if collapsed - don't add line count here, we'll show it separately
  const displayOldValue = !isExpanded && shouldShowExpandButton 
    ? oldLines.slice(0, 8).join('\n')
    : oldValue;
  const displayNewValue = !isExpanded && shouldShowExpandButton 
    ? newLines.slice(0, 8).join('\n')
    : newValue;

  // 渲染带语法高亮的内容
  const renderContent = (source: string): JSX.Element => {
    if (!source.trim()) {
      return <span>{source}</span>;
    }

    try {
      const grammar = Prism.languages[language] || Prism.languages.text;
      const highlighted = Prism.highlight(source, grammar, language);
      
      return (
        <span
          dangerouslySetInnerHTML={{ __html: highlighted }}
          style={{ display: 'inline' }}
        />
      );
    } catch (error) {
      // 如果高亮失败，返回原始文本
      return <span>{source}</span>;
    }
  };
  
  return (
    <div className="relative border border-border rounded-xl overflow-hidden">
      {shouldShowExpandButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute top-2 right-2 h-6 w-6 p-0 z-10 text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? "Show fewer lines" : "Show all lines"}
        >
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Button>
      )}
      <ReactDiffViewer
        oldValue={displayOldValue}
        newValue={displayNewValue}
        splitView={false}  // 统一视图
        showDiffOnly={false}  // 显示所有行，不仅仅是差异行
        useDarkTheme={isDark}
        hideLineNumbers={false}
        disableWordDiff={true}  // 禁用字符级别差异，使用行级别差异
        renderContent={renderContent}
        styles={{
        variables: {
          dark: {
            diffViewerBackground: '#292a30',
            addedBackground: 'rgba(103, 183, 164, 0.2)',
            addedColor: '#67b7a4',
            removedBackground: 'rgba(252, 106, 93, 0.2)',
            removedColor: '#fc6a5d',
            wordAddedBackground: 'rgba(103, 183, 164, 0.4)',
            wordRemovedBackground: 'rgba(252, 106, 93, 0.4)',
            addedGutterBackground: 'rgba(103, 183, 164, 0.3)',
            removedGutterBackground: 'rgba(252, 106, 93, 0.3)',
            gutterBackground: '#292a30',
            gutterBackgroundDark: '#292a30',
            highlightBackground: 'rgba(255, 255, 255, 0.1)',
            highlightGutterBackground: 'rgba(255, 255, 255, 0.2)',
            codeFoldGutterBackground: '#292a30',
            codeFoldBackground: '#292a30',
            emptyLineBackground: '#292a30',
            gutterColor: '#6c7986',
            addedGutterColor: '#67b7a4',
            removedGutterColor: '#fc6a5d',
            codeFoldContentColor: '#ffffff',
            diffViewerTitleBackground: '#1f2024',
            diffViewerTitleColor: '#ffffff',
            diffViewerTitleBorderColor: '#3a3b40',
          },
          light: {
            diffViewerBackground: '#ffffff',
            addedBackground: 'rgba(28, 176, 90, 0.15)',
            addedColor: '#1cb05a',
            removedBackground: 'rgba(220, 53, 34, 0.15)',
            removedColor: '#dc3522',
            wordAddedBackground: 'rgba(28, 176, 90, 0.3)',
            wordRemovedBackground: 'rgba(220, 53, 34, 0.3)',
            addedGutterBackground: 'rgba(28, 176, 90, 0.25)',
            removedGutterBackground: 'rgba(220, 53, 34, 0.25)',
            gutterBackground: '#f7f7f7',
            gutterBackgroundDark: '#f0f0f0',
            highlightBackground: 'rgba(0, 0, 0, 0.05)',
            highlightGutterBackground: 'rgba(0, 0, 0, 0.1)',
            codeFoldGutterBackground: '#f7f7f7',
            codeFoldBackground: '#f7f7f7',
            emptyLineBackground: '#ffffff',
            gutterColor: '#5d6c79',
            addedGutterColor: '#1cb05a',
            removedGutterColor: '#dc3522',
            codeFoldContentColor: '#262626',
            diffViewerTitleBackground: '#f7f7f7',
            diffViewerTitleColor: '#262626',
            diffViewerTitleBorderColor: '#e0e0e0',
          }
        },
        diffContainer: {
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        },
        line: {
          '& pre': {
            color: isDark ? '#ffffff' : '#262626',
          },
          // Prism 语法高亮样式
          '& .token.comment': {
            color: isDark ? '#6c7986' : '#5d6c79',
            fontStyle: 'italic',
          },
          '& .token.prolog': {
            color: isDark ? '#6c7986' : '#5d6c79',
          },
          '& .token.doctype': {
            color: isDark ? '#6c7986' : '#5d6c79',
          },
          '& .token.cdata': {
            color: isDark ? '#6c7986' : '#5d6c79',
          },
          '& .token.punctuation': {
            color: isDark ? '#ffffff' : '#262626',
          },
          '& .token.property': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.tag': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.boolean': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.number': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.constant': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.symbol': {
            color: isDark ? '#d0a8ff' : '#aa0d91',
          },
          '& .token.deleted': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.selector': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.attr-name': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.string': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.char': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.builtin': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.inserted': {
            color: isDark ? '#67b7a4' : '#1c00cf',
          },
          '& .token.operator': {
            color: isDark ? '#ffffff' : '#262626',
          },
          '& .token.entity': {
            color: isDark ? '#ffffff' : '#262626',
          },
          '& .token.url': {
            color: isDark ? '#fc6a5d' : '#c41a16',
          },
          '& .token.atrule': {
            color: isDark ? '#fc5fa3' : '#aa0d91',
          },
          '& .token.attr-value': {
            color: isDark ? '#fc5fa3' : '#aa0d91',
          },
          '& .token.keyword': {
            color: isDark ? '#fc5fa3' : '#aa0d91',
            fontWeight: 'bold',
          },
          '& .token.function': {
            color: isDark ? '#67b7a4' : '#1c00cf',
          },
          '& .token.class-name': {
            color: isDark ? '#67b7a4' : '#1c00cf',
          },
          '& .token.regex': {
            color: isDark ? '#a167e6' : '#5c2699',
          },
          '& .token.important': {
            color: isDark ? '#a167e6' : '#5c2699',
          },
          '& .token.variable': {
            color: isDark ? '#a167e6' : '#5c2699',
          },
        }
      }}
      />
    </div>
  );
}