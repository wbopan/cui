import { useCallback, useEffect, useRef, useState } from 'react';

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight?: number;
}

interface UseDropdownPositionProps {
  isOpen: boolean;
  preferredPosition?: 'top' | 'bottom' | 'auto';
  offset?: number;
  maxHeight?: number;
}

export function useDropdownPosition({
  isOpen,
  preferredPosition = 'auto',
  offset = 8,
  maxHeight = 360,
}: UseDropdownPositionProps) {
  const triggerRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<DropdownPosition>({});

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - triggerRect.bottom - offset;
    const spaceAbove = triggerRect.top - offset;

    let newPosition: DropdownPosition = {};

    // Determine vertical position
    const shouldShowAbove =
      preferredPosition === 'top' ||
      (preferredPosition === 'auto' && spaceBelow < dropdownRect.height && spaceAbove > spaceBelow);

    if (shouldShowAbove) {
      // Position above
      const availableHeight = Math.min(maxHeight, spaceAbove);
      newPosition.bottom = viewportHeight - triggerRect.top + offset;
      newPosition.maxHeight = availableHeight;
    } else {
      // Position below
      const availableHeight = Math.min(maxHeight, spaceBelow);
      newPosition.top = triggerRect.bottom + offset;
      newPosition.maxHeight = availableHeight;
    }

    // Determine horizontal position
    const triggerLeft = triggerRect.left;
    const triggerRight = triggerRect.right;
    const dropdownWidth = dropdownRect.width;

    // Try to align with the left edge of the trigger
    if (triggerLeft + dropdownWidth <= viewportWidth) {
      newPosition.left = triggerLeft;
    } else if (triggerRight - dropdownWidth >= 0) {
      // If it doesn't fit, try aligning with the right edge
      newPosition.right = viewportWidth - triggerRight;
    } else {
      // If neither works, center it in the viewport
      newPosition.left = Math.max(8, (viewportWidth - dropdownWidth) / 2);
    }

    setPosition(newPosition);
  }, [offset, preferredPosition, maxHeight]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();

      // Recalculate on scroll or resize
      const handleRecalculate = () => calculatePosition();
      window.addEventListener('scroll', handleRecalculate, true);
      window.addEventListener('resize', handleRecalculate);

      return () => {
        window.removeEventListener('scroll', handleRecalculate, true);
        window.removeEventListener('resize', handleRecalculate);
      };
    }
  }, [isOpen, calculatePosition]);

  return {
    triggerRef,
    dropdownRef,
    position,
  };
}