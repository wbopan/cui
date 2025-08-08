import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ChevronDown, Mic, Send, Loader2, Sparkles, Laptop, Square, Check, X, MicOff, Zap, Bot, Drone, Code2, Gauge, Rocket, FileText } from 'lucide-react';
import { DropdownSelector, DropdownOption } from '../DropdownSelector';
import { PermissionDialog } from '../PermissionDialog';
import { WaveformVisualizer } from '../WaveformVisualizer';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { PermissionRequest, Command } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useAudioRecording } from '../../hooks/useAudioRecording';
import { api } from '../../../chat/services/api';
import { cn } from "../../lib/utils";

export interface FileSystemEntry {
  name: string;
  type: 'file' | 'directory';
  depth: number;
}

interface AutocompleteState {
  isActive: boolean;
  triggerIndex: number;
  query: string;
  suggestions: FileSystemEntry[] | Command[];
  focusedIndex: number;
  type: 'file' | 'command';
}

export interface ComposerProps {
  // Core functionality
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (message: string, workingDirectory?: string, model?: string, permissionMode?: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;

  // Feature flags
  showDirectorySelector?: boolean;
  showModelSelector?: boolean;
  enableFileAutocomplete?: boolean;
  showPermissionUI?: boolean;
  showStopButton?: boolean;

  // Directory selection
  workingDirectory?: string;
  onDirectoryChange?: (directory: string) => void;
  recentDirectories?: Record<string, { lastDate: string; shortname: string }>;
  getMostRecentWorkingDirectory?: () => string | null;

  // Model selection
  model?: string;
  onModelChange?: (model: string) => void;
  availableModels?: string[];

  // Permission handling
  permissionRequest?: PermissionRequest | null;
  onPermissionDecision?: (requestId: string, action: 'approve' | 'deny', denyReason?: string) => void;

  // Stop functionality
  onStop?: () => void;

  // File autocomplete
  fileSystemEntries?: FileSystemEntry[];
  onFetchFileSystem?: (directory: string) => Promise<FileSystemEntry[]>;

  // Command autocomplete
  availableCommands?: Command[];
  onFetchCommands?: (workingDirectory?: string) => Promise<Command[]>;
}

export interface ComposerRef {
  focusInput: () => void;
}

interface DirectoryDropdownProps {
  selectedDirectory: string;
  recentDirectories: Record<string, { lastDate: string; shortname: string }>;
  onDirectorySelect: (directory: string) => void;
}

function DirectoryDropdown({ 
  selectedDirectory, 
  recentDirectories, 
  onDirectorySelect 
}: DirectoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Convert recentDirectories to sorted array and create options
  const options: DropdownOption<string>[] = Object.entries(recentDirectories)
    .map(([path, data]) => ({
      value: path,
      label: data.shortname,
    }))
    .sort((a, b) => {
      const dateA = recentDirectories[a.value].lastDate;
      const dateB = recentDirectories[b.value].lastDate;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

  // Get shortname for display
  const displayText = selectedDirectory === 'Select directory' 
    ? selectedDirectory
    : recentDirectories[selectedDirectory]?.shortname || selectedDirectory.split('/').pop() || selectedDirectory;

  return (
    <DropdownSelector
      options={options}
      value={selectedDirectory}
      onChange={(value) => {
        onDirectorySelect(value);
        setIsOpen(false);
      }}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placeholder="Enter a directory..."
      showFilterInput={true}
      filterPredicate={(option, searchText) => {
        // Allow filtering by path
        if (option.value.toLowerCase().includes(searchText.toLowerCase())) {
          return true;
        }
        // If the search text looks like a path and doesn't match any existing option,
        // the user can press Enter to add it as a new directory
        return false;
      }}
      renderTrigger={({ onClick }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:bg-muted/50 rounded-full"
          onClick={onClick}
          aria-label="View all code environments"
        >
          <span className="flex items-center gap-1.5">
            <Laptop size={14} />
            <span className="block max-w-[128px] overflow-hidden text-ellipsis whitespace-nowrap">{displayText}</span>
            <ChevronDown size={14} />
          </span>
        </Button>
      )}
    />
  );
}

interface ModelDropdownProps {
  selectedModel: string;
  availableModels: string[];
  onModelSelect: (model: string) => void;
}

function ModelDropdown({
  selectedModel,
  availableModels,
  onModelSelect
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get icon for model
  const getModelIcon = (model: string) => {
    switch (model) {
      case 'sonnet':
        return <Zap size={14} />;
      case 'opus':
        return <Drone size={14} />;
      case 'default':
        return <Bot size={14} />;
      default:
        return <Bot size={14} />;
    }
  };

  // Create options from available models
  const options: DropdownOption<string>[] = availableModels.map(model => ({
    value: model,
    label: model === 'default' ? 'Default' : model.charAt(0).toUpperCase() + model.slice(1),
  }));

  // Get display text for the selected model
  const displayText = selectedModel === 'default' ? 'Default' : selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1);

  return (
    <DropdownSelector
      options={options}
      value={selectedModel}
      onChange={(value) => {
        onModelSelect(value);
        setIsOpen(false);
      }}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      showFilterInput={false}
      renderOption={(option) => (
        <div className="flex items-center gap-2 w-full">
          {getModelIcon(option.value)}
          <span className="text-sm font-medium">{option.label}</span>
        </div>
      )}
      renderTrigger={({ onClick }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:bg-muted/50 rounded-full"
          onClick={onClick}
          aria-label="Select AI model"
        >
          <span className="flex items-center gap-1.5">
            {getModelIcon(selectedModel)}
            <span className="block max-w-[128px] overflow-hidden text-ellipsis whitespace-nowrap">{displayText}</span>
            <ChevronDown size={14} />
          </span>
        </Button>
      )}
    />
  );
}

interface AutocompleteDropdownProps {
  suggestions: FileSystemEntry[] | Command[];
  onSelect: (path: string) => void;
  onClose: () => void;
  isOpen: boolean;
  focusedIndex: number;
  type: 'file' | 'command';
  onFocusReturn?: () => void;
}

function AutocompleteDropdown({
  suggestions,
  onSelect,
  onClose,
  isOpen,
  focusedIndex,
  type,
  onFocusReturn,
}: AutocompleteDropdownProps) {
  if (!isOpen) return null;

  const options = suggestions.map((entry) => {
    if (type === 'command') {
      const command = entry as Command;
      return {
        value: command.name,
        label: command.name,
        description: command.description,
        disabled: false
      };
    } else {
      const fileEntry = entry as FileSystemEntry;
      return {
        value: fileEntry.name,
        label: fileEntry.name,
        disabled: false
      };
    }
  });

  return (
    <DropdownSelector
      options={options}
      value={undefined}
      onChange={onSelect}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      showFilterInput={false}
      maxVisibleItems={-1}
      initialFocusedIndex={focusedIndex}
      focusedIndexControlled={focusedIndex}
      visualFocusOnly={true}
      onFocusReturn={onFocusReturn}
      renderOption={type === 'command' ? (option) => (
        <div className="flex flex-col items-start gap-0.5 w-full">
          <span className="text-sm">{option.label}</span>
          {option.description && (
            <span className="text-xs text-muted-foreground/80">{option.description}</span>
          )}
        </div>
      ) : undefined}
      renderTrigger={() => (
        <div className="w-0 h-0 pointer-events-none opacity-0" />
      )}
    />
  );
}

interface ComposerCache {
  selectedPermissionMode: string;
  draft: string;
}

export const Composer = forwardRef<ComposerRef, ComposerProps>(function Composer({
  value: controlledValue,
  onChange: onControlledChange,
  onSubmit,
  placeholder = "Type a message...",
  isLoading = false,
  disabled = false,
  showDirectorySelector = false,
  showModelSelector = false,
  enableFileAutocomplete = false,
  showPermissionUI = false,
  showStopButton = false,
  workingDirectory = '',
  onDirectoryChange,
  recentDirectories = {},
  getMostRecentWorkingDirectory,
  model = 'default',
  onModelChange,
  availableModels = ['default', 'opus', 'sonnet'],
  permissionRequest,
  onPermissionDecision,
  onStop,
  fileSystemEntries = [],
  onFetchFileSystem,
  availableCommands = [],
  onFetchCommands,
}: ComposerProps, ref: React.Ref<ComposerRef>) {
  // Load cached state
  const [cachedState, setCachedState] = useLocalStorage<ComposerCache>('cui-composer', {
    selectedPermissionMode: 'default',
    draft: '',
  });

  // Use controlled or uncontrolled value
  const [uncontrolledValue, setUncontrolledValue] = useState(cachedState.draft);
  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const setValue = (newValue: string) => {
    if (controlledValue === undefined) {
      setUncontrolledValue(newValue);
    }
    onControlledChange?.(newValue);
  };

  const [selectedDirectory, setSelectedDirectory] = useState(workingDirectory || 'Select directory');
  const [selectedModel, setSelectedModel] = useState(model);
  const [selectedPermissionMode, setSelectedPermissionMode] = useState<string>(cachedState.selectedPermissionMode);
  const [isPermissionDropdownOpen, setIsPermissionDropdownOpen] = useState(false);
  const [localFileSystemEntries, setLocalFileSystemEntries] = useState<FileSystemEntry[]>(fileSystemEntries);
  const [localCommands, setLocalCommands] = useState<Command[]>(availableCommands);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    isActive: false,
    triggerIndex: -1,
    query: '',
    suggestions: [],
    focusedIndex: -1,
    type: 'file',
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  
  // Audio recording state
  const { 
    state: audioState, 
    startRecording, 
    stopRecording, 
    resetToIdle,
    error: audioError, 
    duration: recordingDuration,
    isSupported: isAudioSupported,
    audioData
  } = useAudioRecording();

  // Expose focusInput method via ref
  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }), []);

  // Update local state when props change
  useEffect(() => {
    if (workingDirectory) {
      setSelectedDirectory(workingDirectory);
    }
  }, [workingDirectory]);

  useEffect(() => {
    if (model) {
      setSelectedModel(model);
    }
  }, [model]);

  useEffect(() => {
    if (fileSystemEntries.length > 0) {
      setLocalFileSystemEntries(fileSystemEntries);
    }
  }, [fileSystemEntries]);

  useEffect(() => {
    if (availableCommands.length > 0) {
      setLocalCommands(availableCommands);
    }
  }, [availableCommands]);

  // Update cache when state changes
  useEffect(() => {
    setCachedState({
      selectedPermissionMode,
      draft: value,
    });
  }, [selectedPermissionMode, value, setCachedState]);

  // Auto-select most recent directory on mount (for Home usage)
  useEffect(() => {
    if (showDirectorySelector && (!workingDirectory || selectedDirectory === 'Select directory') && Object.keys(recentDirectories).length > 0 && getMostRecentWorkingDirectory) {
      const mostRecent = getMostRecentWorkingDirectory();
      if (mostRecent) {
        setSelectedDirectory(mostRecent);
        onDirectoryChange?.(mostRecent);
        
        // Fetch file system entries for the auto-selected directory
        if (enableFileAutocomplete && onFetchFileSystem) {
          onFetchFileSystem(mostRecent)
            .then(entries => setLocalFileSystemEntries(entries))
            .catch(error => console.error('Failed to fetch file system entries:', error));
        }
      }
    }
  }, [workingDirectory, selectedDirectory, recentDirectories, getMostRecentWorkingDirectory, showDirectorySelector, onDirectoryChange, enableFileAutocomplete, onFetchFileSystem]);

  // Fetch file system entries when composer is focused (for autocomplete)
  useEffect(() => {
    if (!enableFileAutocomplete || !onFetchFileSystem) return;

    const fetchFileSystem = async () => {
      if (selectedDirectory && selectedDirectory !== 'Select directory') {
        try {
          const entries = await onFetchFileSystem(selectedDirectory);
          setLocalFileSystemEntries(entries);
        } catch (error) {
          console.error('Failed to fetch file system entries:', error);
        }
      }
    };

    const textarea = textareaRef.current;
    if (textarea) {
      const handleFocus = () => fetchFileSystem();
      textarea.addEventListener('focus', handleFocus);
      return () => textarea.removeEventListener('focus', handleFocus);
    }
  }, [selectedDirectory, enableFileAutocomplete, onFetchFileSystem]);

  // Fetch commands when composer is focused (for autocomplete)
  useEffect(() => {
    if (!onFetchCommands) return;

    const fetchCommands = async () => {
      try {
        const commands = await onFetchCommands(selectedDirectory !== 'Select directory' ? selectedDirectory : undefined);
        setLocalCommands(commands);
      } catch (error) {
        console.error('Failed to fetch commands:', error);
      }
    };

    // Fetch commands immediately
    fetchCommands();

    const textarea = textareaRef.current;
    if (textarea) {
      const handleFocus = () => fetchCommands();
      textarea.addEventListener('focus', handleFocus);
      return () => textarea.removeEventListener('focus', handleFocus);
    }
  }, [selectedDirectory, onFetchCommands]);

  const detectAutocomplete = (value: string, cursorPosition: number) => {
    // Find the last @ before cursor
    const beforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) return null;
    
    // Check if there's a space or newline between @ and cursor
    const afterAt = beforeCursor.substring(lastAtIndex + 1);
    if (afterAt.includes(' ') || afterAt.includes('\n')) return null;
    
    return {
      triggerIndex: lastAtIndex,
      query: afterAt,
      type: 'file' as const,
    };
  };

  const detectSlashCommandAutocomplete = (value: string, cursorPosition: number) => {
    // Find the last / before cursor
    const beforeCursor = value.substring(0, cursorPosition);
    const lastSlashIndex = beforeCursor.lastIndexOf('/');
    
    if (lastSlashIndex === -1) return null;
    
    // Check if the slash is at the beginning of the input or after whitespace/newline
    const beforeSlash = beforeCursor.substring(0, lastSlashIndex);
    if (beforeSlash.trim() !== '' && !beforeSlash.endsWith('\n') && !beforeSlash.endsWith(' ')) return null;
    
    // Check if there's a space or newline between / and cursor
    const afterSlash = beforeCursor.substring(lastSlashIndex + 1);
    if (afterSlash.includes(' ') || afterSlash.includes('\n')) return null;
    
    return {
      triggerIndex: lastSlashIndex,
      query: afterSlash,
      type: 'command' as const,
    };
  };

  const filterSuggestions = (query: string): FileSystemEntry[] => {
    if (!localFileSystemEntries) return []; // Return empty array if entries not loaded
    if (!query) return localFileSystemEntries.slice(0, 50); // Show first 50 entries when no query
    
    const lowerQuery = query.toLowerCase();
    return localFileSystemEntries
      .filter(entry => entry.name.toLowerCase().includes(lowerQuery))
      .slice(0, 50); // Limit to 50 results
  };

  const filterCommandSuggestions = (query: string): Command[] => {
    if (!localCommands) return []; // Return empty array if commands not loaded
    if (!query) return localCommands.slice(0, 50); // Show first 50 commands when no query
    
    const lowerQuery = query.toLowerCase();
    return localCommands
      .filter(command => command.name.toLowerCase().includes(lowerQuery))
      .slice(0, 50); // Limit to 50 results
  };

  const resetAutocomplete = () => {
    setAutocomplete({
      isActive: false,
      triggerIndex: -1,
      query: '',
      suggestions: [],
      focusedIndex: -1,
      type: 'file',
    });
  };

  const getPermissionModeLabel = (mode: string): string => {
    switch (mode) {
      case 'default': return 'Ask';
      case 'acceptEdits': return 'Auto';
      case 'bypassPermissions': return 'Yolo';
      case 'plan': return 'Plan';
      default: return 'Ask';
    }
  };

  const getPermissionModeTitle = (mode: string): string => {
    switch (mode) {
      case 'default': return 'Ask - Ask for permissions as needed';
      case 'acceptEdits': return 'Auto - Allow Claude to make changes directly';
      case 'bypassPermissions': return 'Yolo - Skip all permission prompts';
      case 'plan': return 'Plan - Create a plan without executing';
      default: return 'Ask - Ask for permissions as needed';
    }
  };

  const getPermissionModeIcon = (mode: string) => {
    switch (mode) {
      case 'default':
        return <Code2 size={14} />;
      case 'acceptEdits':
        return <Gauge size={14} />;
      case 'bypassPermissions':
        return <Rocket size={14} />;
      case 'plan':
        return <FileText size={14} />;
      default:
        return <Code2 size={14} />;
    }
  };

  const handleAutocompleteSelection = (selection: string) => {
    if (!textareaRef.current) return;
    
    const cursorPos = textareaRef.current.selectionStart;
    
    if (autocomplete.type === 'command') {
      // For commands, replace the entire trigger sequence (including the /) with the selected command
      const newText = value.substring(0, autocomplete.triggerIndex) + selection + ' ' + value.substring(cursorPos);
      setValue(newText);
      
      // Reset autocomplete state immediately
      resetAutocomplete();
      
      // Set cursor position after the inserted selection and adjust height
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = autocomplete.triggerIndex + selection.length + 1;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
          adjustTextareaHeight();
        }
      }, 0);
    } else {
      // For files, keep the existing behavior (append after the @ symbol)
      const newText = value.substring(0, autocomplete.triggerIndex + 1) + selection + ' ' + value.substring(cursorPos);
      setValue(newText);
      
      // Reset autocomplete state immediately
      resetAutocomplete();
      
      // Set cursor position after the inserted selection and adjust height
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = autocomplete.triggerIndex + 1 + selection.length + 1;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
          adjustTextareaHeight();
        }
      }, 0);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    adjustTextareaHeight();
    
    // Detect autocomplete triggers
    const cursorPos = e.target.selectionStart;
    
    // Check for slash command autocomplete first (higher priority)
    const commandAutocompleteInfo = detectSlashCommandAutocomplete(newValue, cursorPos);
    if (commandAutocompleteInfo && onFetchCommands) {
      const suggestions = filterCommandSuggestions(commandAutocompleteInfo.query);
      
      setAutocomplete(prev => ({
        isActive: true,
        triggerIndex: commandAutocompleteInfo.triggerIndex,
        query: commandAutocompleteInfo.query,
        suggestions,
        type: commandAutocompleteInfo.type,
        // Keep focusedIndex if it's still valid, otherwise reset to -1 (no selection)
        focusedIndex: prev.focusedIndex >= 0 && prev.focusedIndex < suggestions.length ? prev.focusedIndex : -1,
      }));
      return;
    }
    
    // Check for file autocomplete if enabled
    if (enableFileAutocomplete) {
      const fileAutocompleteInfo = detectAutocomplete(newValue, cursorPos);
      if (fileAutocompleteInfo) {
        const suggestions = filterSuggestions(fileAutocompleteInfo.query);
        
        setAutocomplete(prev => ({
          isActive: true,
          triggerIndex: fileAutocompleteInfo.triggerIndex,
          query: fileAutocompleteInfo.query,
          suggestions,
          type: fileAutocompleteInfo.type,
          // Keep focusedIndex if it's still valid, otherwise reset to -1 (no selection)
          focusedIndex: prev.focusedIndex >= 0 && prev.focusedIndex < suggestions.length ? prev.focusedIndex : -1,
        }));
        return;
      }
    }
    
    // No autocomplete triggers found
    resetAutocomplete();
  };

  const handleSubmit = (permissionMode: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || isLoading) return;

    // For Home usage with directory/model
    if (showDirectorySelector && selectedDirectory === 'Select directory') return;

    onSubmit(
      trimmedValue,
      showDirectorySelector ? selectedDirectory : undefined,
      showModelSelector ? selectedModel : undefined,
      permissionMode
    );
    
    setValue('');
    resetAutocomplete();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (autocomplete.isActive) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (autocomplete.suggestions.length > 0) {
            setAutocomplete(prev => ({
              ...prev,
              focusedIndex: prev.focusedIndex < 0 ? 0 : (prev.focusedIndex + 1) % prev.suggestions.length
            }));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (autocomplete.suggestions.length > 0) {
            setAutocomplete(prev => ({
              ...prev,
              focusedIndex: prev.focusedIndex < 0
                ? prev.suggestions.length - 1
                : prev.focusedIndex === 0
                  ? prev.suggestions.length - 1
                  : prev.focusedIndex - 1
            }));
          }
          break;
        case 'Enter':
        case 'Tab':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (autocomplete.suggestions.length > 0) {
              // Select the currently focused suggestion, or first if none
              const targetIndex = autocomplete.focusedIndex >= 0 ? autocomplete.focusedIndex : 0;
              const suggestion = autocomplete.suggestions[targetIndex];
              const suggestionName = autocomplete.type === 'command' 
                ? (suggestion as Command).name 
                : (suggestion as FileSystemEntry).name;
              handleAutocompleteSelection(suggestionName);
            }
          }
          break;
        case ' ':
          // Don't prevent default for space - let it insert the character
          resetAutocomplete();
          break;
        case 'Escape':
          e.preventDefault();
          resetAutocomplete();
          // Ensure focus returns to textarea
          setTimeout(() => textareaRef.current?.focus(), 0);
          break;
      }
    } else if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSubmit(selectedPermissionMode);
      }
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = Math.floor(window.innerHeight * 0.8); // Up to 80% of viewport
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  };

  // Adjust height whenever text changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [value]);

  // Re-adjust height on window resize
  useEffect(() => {
    const handleResize = () => {
      adjustTextareaHeight();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDirectorySelect = (directory: string) => {
    setSelectedDirectory(directory);
    onDirectoryChange?.(directory);
  };

  const handleModelSelect = (model: string) => {
    setSelectedModel(model);
    onModelChange?.(model);
  };

  // Audio recording handlers
  const handleMicClick = async () => {
    if (audioState === 'idle') {
      await startRecording();
    }
  };

  const handleAcceptRecording = async () => {
    if (audioState === 'recording') {
      const result = await stopRecording();
      if (result) {
        try {
          const transcription = await api.transcribeAudio(result.audioBase64, result.mimeType);
          
          // Insert transcribed text at cursor position
          if (textareaRef.current && transcription.text.trim()) {
            const textarea = textareaRef.current;
            const cursorPos = textarea.selectionStart;
            const textBefore = value.substring(0, cursorPos);
            const textAfter = value.substring(cursorPos);
            const transcribedText = transcription.text.trim();
            
            // Add space before if needed
            const needsSpaceBefore = textBefore.length > 0 && !textBefore.endsWith(' ') && !textBefore.endsWith('\n');
            const finalText = (needsSpaceBefore ? ' ' : '') + transcribedText;
            
            const newText = textBefore + finalText + textAfter;
            setValue(newText);
            
            // Set cursor position after inserted text
            setTimeout(() => {
              if (textareaRef.current) {
                const newCursorPos = cursorPos + finalText.length;
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                textareaRef.current.focus();
                adjustTextareaHeight();
              }
            }, 0);
          } else if (!transcription.text.trim()) {
            console.warn('No speech detected in audio');
            // Could show a toast message here
          }
        } catch (error) {
          console.error('Transcription failed:', error);
          // Could show an error toast here
        } finally {
          // Always reset to idle after transcription attempt
          resetToIdle();
        }
      } else {
        // If no result, also reset to idle
        resetToIdle();
      }
    }
  };

  const handleRejectRecording = async () => {
    if (audioState === 'recording' || audioState === 'processing') {
      await stopRecording();
      // Just stop and discard, no transcription
      resetToIdle();
    }
  };

  return (
    <form 
      ref={composerRef}
      className="w-full relative" 
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(selectedPermissionMode);
      }}
    >
      <div className="flex flex-col items-center justify-center w-full bg-transparent border border-border rounded-3xl shadow-sm cursor-text transition-all duration-300">
        <div className="relative flex items-end w-full min-h-[73px]">
          <div className="relative flex flex-1 items-start mx-5 min-h-[73px]">
            {audioState === 'recording' || audioState === 'processing' ? (
              <div className="w-full min-h-[80px] pb-[34px] bg-transparent overflow-hidden flex items-center justify-start">
                <WaveformVisualizer
                  audioData={audioData}
                  isRecording={audioState === 'recording'}
                  isPaused={audioState === 'processing'}
                />
              </div>
            ) : (
              <Textarea
                ref={textareaRef}
                className="min-h-[80px] max-h-[80vh] pt-4 pr-[60px] pb-[50px] border-none bg-transparent text-foreground font-sans text-base leading-relaxed resize-none outline-none overflow-y-auto scrollbar-thin ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder={permissionRequest && showPermissionUI ? "Deny and tell Claude what to do" : placeholder}
                value={value}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={(isLoading || disabled) && !(permissionRequest && showPermissionUI)}
              />
            )}
            
            {/* Hidden textarea during processing for text insertion */}
            {audioState === 'processing' && (
              <textarea
                ref={textareaRef}
                className="absolute opacity-0 pointer-events-none -top-[9999px]"
                value={value}
                onChange={handleTextChange}
                rows={1}
                disabled
              />
            )}
            
          </div>

          {(showDirectorySelector || showModelSelector) && audioState === 'idle' && (
            <div className="absolute bottom-2 left-6 right-10 flex items-center justify-center overflow-visible">
              <div className="flex gap-2 w-full justify-between">
                <div className="flex gap-2">
                  {/* Working Directory Selector */}
                  {showDirectorySelector && (
                    <DirectoryDropdown
                      selectedDirectory={selectedDirectory}
                      recentDirectories={recentDirectories}
                      onDirectorySelect={handleDirectorySelect}
                    />
                  )}

                  {/* Model Selector */}
                  {showModelSelector && (
                    <ModelDropdown
                      selectedModel={selectedModel}
                      availableModels={availableModels}
                      onModelSelect={handleModelSelect}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Action Button */}
          <div className="absolute right-2.5 bottom-2 flex items-center justify-center gap-2">
            {audioState === 'recording' || audioState === 'processing' ? (
              /* Recording/Processing State: Show tick and cross */
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="w-8 h-8 hover:scale-[1.03]"
                        onClick={handleAcceptRecording}
                        disabled={audioState === 'processing'}
                      >
                        {audioState === 'processing' ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{audioState === 'processing' ? 'Processing...' : 'Accept recording'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="w-8 h-8 hover:scale-[1.03]"
                        onClick={handleRejectRecording}
                        disabled={audioState === 'processing'}
                      >
                        <X size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Discard recording</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              /* Idle State: Show mic button */
              isAudioSupported && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 px-2 text-muted-foreground hover:bg-muted/50 rounded-full",
                          audioError && "bg-red-300 text-red-900 hover:bg-red-400 hover:text-red-950"
                        )}
                        onClick={handleMicClick}
                        disabled={disabled}
                      >
                        {audioError ? <MicOff size={16} /> : <Mic size={16} />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{audioError ? `Error: ${audioError}` : 'Start voice recording'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            )}
            
            {permissionRequest && showPermissionUI ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="h-8 min-w-[60px] px-3 py-0.5 bg-blue-600 text-white hover:bg-blue-700 border-0 shadow-none rounded-full flex items-center gap-1.5"
                  onClick={() => onPermissionDecision?.(permissionRequest.id, 'approve')}
                >
                  <Check size={14} />
                  <span>Accept</span>
                </Button>
                <Button
                  type="button"
                  className="h-8 min-w-[60px] px-3 py-0.5 bg-muted text-muted-foreground hover:bg-muted/80 border-0 shadow-none rounded-full flex items-center gap-1.5"
                  onClick={() => {
                    const denyReason = value.trim();
                    onPermissionDecision?.(permissionRequest.id, 'deny', denyReason || undefined);
                    setValue('');
                  }}
                >
                  <X size={14} />
                  <span>Deny</span>
                </Button>
              </div>
            ) : isLoading && showStopButton ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      className="w-8 h-8 hover:scale-[1.03] rounded-full"
                      onClick={() => onStop?.()}
                    >
                      <Square size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Stop generation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : audioState === 'idle' && (
              <div className="flex items-center gap-2">
                {/* Combined Permission Mode Button with Dropdown */}
                <div className={`flex items-center rounded-full overflow-hidden ${
                  (!value.trim() || isLoading || disabled || (showDirectorySelector && selectedDirectory === 'Select directory'))
                    ? 'bg-foreground/5 text-foreground/50'
                    : 'bg-foreground text-background'
                }`}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          className="h-8 min-w-[48px] w-[48px] px-3 py-0.5 bg-transparent text-inherit hover:bg-white/10 border-0 shadow-none"
                          disabled={!value.trim() || isLoading || disabled || (showDirectorySelector && selectedDirectory === 'Select directory')}
                          onClick={() => handleSubmit(selectedPermissionMode)}
                        >
                          {isLoading ? <Loader2 size={14} className="animate-spin" /> : getPermissionModeLabel(selectedPermissionMode)}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{getPermissionModeTitle(selectedPermissionMode)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownSelector
                    options={[
                      { value: 'default', label: 'Ask', description: 'Ask before making changes' },
                      { value: 'acceptEdits', label: 'Auto', description: 'Apply edits automatically' },
                      { value: 'bypassPermissions', label: 'Yolo', description: 'No permission prompts' },
                      { value: 'plan', label: 'Plan', description: 'Planning mode only' },
                    ]}
                    value={selectedPermissionMode}
                    onChange={setSelectedPermissionMode}
                    isOpen={isPermissionDropdownOpen}
                    onOpenChange={setIsPermissionDropdownOpen}
                    showFilterInput={false}
                    renderOption={(option) => (
                      <div className="flex flex-col items-start gap-0.5 w-full">
                        <div className="flex items-center gap-2">
                          {getPermissionModeIcon(option.value)}
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        {option.description && (
                          <span className="text-xs text-muted-foreground/80 pl-[22px]">{option.description}</span>
                        )}
                      </div>
                    )}
                    renderTrigger={({ onClick }) => (
                      <Button
                        type="button"
                        className="w-8 h-8 bg-transparent text-inherit border-l border-white/20 opacity-80 hover:opacity-100 hover:bg-white/10 border-0 shadow-none rounded-none flex items-center justify-center p-0"
                        onClick={onClick}
                        disabled={!value.trim() || isLoading || disabled || (showDirectorySelector && selectedDirectory === 'Select directory')}
                        aria-label="Select permission mode"
                      >
                        <ChevronDown size={14} />
                      </Button>
                    )}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Autocomplete Dropdown */}
      {(enableFileAutocomplete || onFetchCommands) && (
        <AutocompleteDropdown
          suggestions={autocomplete.suggestions}
          onSelect={handleAutocompleteSelection}
          onClose={resetAutocomplete}
          isOpen={autocomplete.isActive && autocomplete.suggestions.length > 0}
          focusedIndex={autocomplete.focusedIndex}
          type={autocomplete.type}
          onFocusReturn={() => textareaRef.current?.focus()}
        />
      )}
      
      {/* Permission Dialog */}
      {permissionRequest && showPermissionUI && (
        <PermissionDialog 
          permissionRequest={permissionRequest}
          isVisible={true}
        />
      )}
    </form>
  );
});