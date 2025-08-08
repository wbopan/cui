import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { Check, ArrowUp } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/web/chat/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/web/chat/components/ui/command';
import { Button } from '@/web/chat/components/ui/button';
import { cn } from "@/web/chat/lib/utils";

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

interface DropdownSelectorProps<T = string> {
  options: DropdownOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  showFilterInput?: boolean;
  filterTextRef?: React.RefObject<HTMLInputElement>;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderOption?: (option: DropdownOption<T>) => React.ReactNode;
  className?: string;
  dropdownClassName?: string;
  maxHeight?: number;
  position?: 'absolute' | 'fixed';
  filterPredicate?: (option: DropdownOption<T>, searchText: string) => boolean;
  renderTrigger: (props: { isOpen: boolean; value?: T; onClick: () => void }) => React.ReactNode;
  customFilterInput?: React.ReactNode;
  maxVisibleItems?: number;
  initialFocusedIndex?: number;
  onFocusReturn?: () => void;
  visualFocusOnly?: boolean;
  focusedIndexControlled?: number;
}

export const DropdownSelector = forwardRef<HTMLDivElement, DropdownSelectorProps<any>>(
  function DropdownSelector<T = string>(
    {
      options,
      value,
      onChange,
      placeholder = 'Select an option',
      showFilterInput = true,
      filterTextRef,
      isOpen: controlledIsOpen,
      onOpenChange,
      renderOption,
      className,
      dropdownClassName,
      maxHeight = 360,
      position = 'absolute',
      filterPredicate,
      renderTrigger,
      customFilterInput,
      maxVisibleItems = -1,
      initialFocusedIndex,
      onFocusReturn,
      visualFocusOnly = false,
      focusedIndexControlled,
    }: DropdownSelectorProps<T>,
    ref: React.ForwardedRef<HTMLDivElement>
  ) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const [filterText, setFilterText] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const commandRef = useRef<HTMLDivElement>(null);

    // Use controlled open state if provided
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const setIsOpen = useCallback((open: boolean) => {
      if (controlledIsOpen === undefined) {
        setInternalIsOpen(open);
      }
      onOpenChange?.(open);
    }, [controlledIsOpen, onOpenChange]);

    // Refs for component management
    const triggerRef = useRef<HTMLElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Combine refs
    const combinedContainerRef = useCallback((node: HTMLDivElement | null) => {
      containerRef.current = node;
      triggerRef.current = node;
      if (ref) {
        if (typeof ref === 'function') {
          ref(node);
        } else {
          ref.current = node;
        }
      }
    }, [ref, triggerRef]);

    // Get filter text from external ref or internal state
    const getFilterText = useCallback(() => {
      if (filterTextRef?.current) {
        return filterTextRef.current.value;
      }
      return filterText;
    }, [filterText, filterTextRef]);

    // Fuzzy match function (fzf-style)
    const fuzzyMatch = (text: string, pattern: string): boolean => {
      const textLower = text.toLowerCase();
      const patternLower = pattern.toLowerCase();
      let patternIndex = 0;
      
      for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
        if (textLower[i] === patternLower[patternIndex]) {
          patternIndex++;
        }
      }
      
      return patternIndex === patternLower.length;
    };

    // Default filter predicate with fuzzy matching
    const defaultFilterPredicate = useCallback((option: DropdownOption<T>, searchText: string) => {
      // If search text is empty, show all options
      if (!searchText.trim()) return true;
      
      // First try exact substring match (case-insensitive)
      if (option.label.toLowerCase().includes(searchText.toLowerCase())) {
        return true;
      }
      
      // Then try fuzzy match
      return fuzzyMatch(option.label, searchText);
    }, []);

    // Calculate match score for ranking (lower is better)
    const calculateMatchScore = (text: string, pattern: string): number => {
      const textLower = text.toLowerCase();
      const patternLower = pattern.toLowerCase();
      
      // Exact match gets highest priority
      if (textLower === patternLower) return -1000;
      
      // Substring match gets second priority
      const substringIndex = textLower.indexOf(patternLower);
      if (substringIndex !== -1) {
        // Earlier matches are better
        return substringIndex;
      }
      
      // Fuzzy match - calculate based on character distances
      let score = 1000;
      let patternIndex = 0;
      let lastMatchIndex = -1;
      
      for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
        if (textLower[i] === patternLower[patternIndex]) {
          // Add distance from last match (closer consecutive matches are better)
          if (lastMatchIndex !== -1) {
            score += (i - lastMatchIndex - 1) * 10;
          }
          lastMatchIndex = i;
          patternIndex++;
        }
      }
      
      // If not all pattern characters were found, return worst score
      if (patternIndex !== patternLower.length) {
        return Infinity;
      }
      
      return score;
    };

    // Filter and sort options
    const filteredOptions = (() => {
      const searchText = getFilterText();
      if (!searchText.trim()) return options;
      
      const predicate = filterPredicate || defaultFilterPredicate;
      
      // Filter options
      const filtered = options.filter(option => predicate(option, searchText));
      
      // Sort by match score if using default predicate
      if (!filterPredicate) {
        return filtered.sort((a, b) => {
          const scoreA = calculateMatchScore(a.label, searchText);
          const scoreB = calculateMatchScore(b.label, searchText);
          return scoreA - scoreB;
        });
      }
      
      return filtered;
    })();

    // Limit visible options based on maxVisibleItems
    const visibleOptions = (() => {
      // If maxVisibleItems is -1, show all options
      if (maxVisibleItems === -1) {
        return filteredOptions;
      }
      // Otherwise, limit to maxVisibleItems
      return filteredOptions.slice(0, maxVisibleItems);
    })();

    // Focus management
    useEffect(() => {
      if (isOpen && showFilterInput && filterInputRef.current && !visualFocusOnly) {
        filterInputRef.current.focus();
      }
    }, [isOpen, showFilterInput, visualFocusOnly]);

    useEffect(() => {
      // Only take actual DOM focus if visualFocusOnly is false
      if (!visualFocusOnly) {
        if (focusedIndex >= 0 && focusedIndex < optionRefs.current.length) {
          optionRefs.current[focusedIndex]?.focus();
        } else if (focusedIndex === -1 && showFilterInput && filterInputRef.current) {
          filterInputRef.current.focus();
        }
      }
    }, [focusedIndex, showFilterInput, visualFocusOnly]);

    // Sync focused index from external control when provided
    useEffect(() => {
      if (focusedIndexControlled !== undefined) {
        setFocusedIndex(focusedIndexControlled);
      }
    }, [focusedIndexControlled]);

    // Reset focused index when dropdown closes or filter changes
    useEffect(() => {
      if (!isOpen) {
        setFocusedIndex(-1);
        setFilterText('');
      } else if (isOpen && initialFocusedIndex !== undefined) {
        // Set initial focused index when dropdown opens
        setFocusedIndex(initialFocusedIndex);
      }
    }, [isOpen, initialFocusedIndex]);

    useEffect(() => {
      setFocusedIndex(-1);
    }, [filterText, filterTextRef]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (focusedIndex < visibleOptions.length - 1) {
            setFocusedIndex(focusedIndex + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (focusedIndex > 0) {
            setFocusedIndex(focusedIndex - 1);
          } else if (focusedIndex === 0 && !showFilterInput && onFocusReturn) {
            // Return focus to parent when at first item with no filter input
            onFocusReturn();
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < visibleOptions.length) {
            const option = visibleOptions[focusedIndex];
            if (!option.disabled) {
              onChange(option.value);
              setIsOpen(false);
            }
          } else if (focusedIndex === -1 && filterText.trim()) {
            // If no option is focused but there's text in the input, use the input text as value
            onChange(filterText.trim() as T);
            setIsOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
        case 'p':
          if (e.ctrlKey) {
            e.preventDefault();
            if (focusedIndex > -1) {
              setFocusedIndex(focusedIndex - 1);
            }
          }
          break;
        case 'n':
          if (e.ctrlKey) {
            e.preventDefault();
            if (focusedIndex < visibleOptions.length - 1) {
              setFocusedIndex(focusedIndex + 1);
            }
          }
          break;
      }
    };

    const handleOptionClick = (option: DropdownOption<T>) => {
      if (!option.disabled) {
        onChange(option.value);
        setIsOpen(false);
      }
    };

    // DropdownSelector uses Popover for smart positioning
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div ref={combinedContainerRef} className={className}>
            {renderTrigger({
              isOpen,
              value,
              onClick: () => setIsOpen(!isOpen)
            })}
          </div>
        </PopoverTrigger>
          <PopoverContent
            className={cn(
              "w-80 p-0 rounded-[18px] border border-black/15 bg-white shadow-lg",
              "dark:border-white/10 dark:bg-neutral-900 dark:shadow-2xl",
              dropdownClassName
            )}
            align="start"
            sideOffset={5}
            avoidCollisions={true}
            onKeyDown={handleKeyDown}
            ref={dropdownRef}
            onOpenAutoFocus={(e) => {
              if (visualFocusOnly) {
                e.preventDefault();
              }
            }}
            onCloseAutoFocus={(e) => {
              if (visualFocusOnly) {
                e.preventDefault();
                onFocusReturn?.();
              }
            }}
            style={{
              maxHeight: `${maxHeight}px`,
            }}
          >
            <Command className="bg-transparent" ref={commandRef}>
              {customFilterInput ? (
                <>
                  {customFilterInput}
                  <div className="h-px bg-black/15 dark:bg-white/10 w-full" />
                </>
              ) : (
                showFilterInput && !filterTextRef && (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-transparent">
                      <CommandInput
                        ref={filterInputRef}
                        placeholder={placeholder}
                        value={filterText}
                        onValueChange={setFilterText}
                        className="flex-1 bg-transparent border-none rounded-lg px-2 py-1 text-sm text-neutral-900 dark:text-neutral-100 outline-none transition-all placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                        aria-label="Filter options"
                        aria-autocomplete="list"
                        aria-controls="dropdown-options"
                      />
                      {filterText.trim() && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="p-1 h-auto rounded-full hover:bg-transparent"
                          onClick={() => {
                            onChange(filterText.trim() as T);
                            setIsOpen(false);
                          }}
                          aria-label="Select input text"
                        >
                          <ArrowUp size={18} />
                        </Button>
                      )}
                    </div>
                    <div className="h-px bg-black/15 dark:bg-white/10 w-full" />
                  </>
                )
              )}
              
              <CommandList 
                id="dropdown-options"
                className="overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent"
                role="listbox"
                aria-label="Available options"
              >
                <CommandEmpty className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400" role="status">
                  No options found
                </CommandEmpty>
                <CommandGroup>
                  {visibleOptions.map((option, index) => (
                    <CommandItem
                      key={String(option.value)}
                      ref={(el) => { optionRefs.current[index] = el; }}
                      value={option.label}
                      onSelect={() => handleOptionClick(option)}
                      disabled={option.disabled}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2.5 rounded-[10px] cursor-pointer transition-all gap-4 text-left text-sm text-neutral-900 dark:text-neutral-100 mb-px",
                        "hover:bg-black/5 dark:hover:bg-white/5",
                        "focus:bg-black/5 dark:focus:bg-white/5 focus:outline-none",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        value === option.value && "bg-transparent dark:bg-transparent",
                        focusedIndex === index && "bg-black/5 dark:bg-white/5"
                      )}
                      role="option"
                      aria-selected={value === option.value}
                      aria-disabled={option.disabled}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {renderOption ? renderOption(option) : (
                          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap direction-rtl text-left">
                            {option.label}
                          </span>
                        )}
                      </div>
                      {value === option.value && (
                        <div className="flex items-center justify-center min-w-[20px] text-neutral-900 dark:text-neutral-100">
                          <Check size={16} />
                        </div>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      );
  }
);