import React, { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/web/chat/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const [isMobile, setIsMobile] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Check if mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !dialogRef.current) return;
    
    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;
    
    // Only allow dragging down
    if (deltaY > 0) {
      dialogRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || !dialogRef.current) return;
    
    const deltaY = currentY.current - startY.current;
    
    // If dragged more than 100px down, close the dialog
    if (deltaY > 100) {
      onClose();
    } else {
      // Snap back to position
      dialogRef.current.style.transform = '';
    }
    
    isDragging.current = false;
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] transition-opacity duration-250 ease-in-out",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            isMobile 
              ? "bg-black/10" 
              : "bg-black/20 backdrop-blur-lg"
          )}
          aria-label="Dialog overlay"
        />
        <DialogPrimitive.Content
          ref={dialogRef}
          className={cn(
            "fixed z-[100] bg-white dark:bg-neutral-900 outline-none overflow-hidden transition-all duration-250 ease-in-out",
            isMobile ? [
              // Mobile styles - bottom sheet
              "bottom-0 left-0 right-0",
              "rounded-t-[28px] shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]",
              "border border-b-0 border-neutral-200/50 dark:border-neutral-800",
              "h-[80vh] max-h-[90vh]",
              "flex flex-direction-column",
              // Mobile animations
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
              "data-[state=open]:duration-250 data-[state=closed]:duration-250"
            ] : [
              // Desktop styles - centered modal
              "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "rounded-[28px] border border-neutral-200/50 dark:border-neutral-800",
              "w-[calc(100vw-64px)] max-w-[calc(100vw-64px)] max-h-[calc(100vh-64px)]",
              // Desktop animations
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "data-[state=closed]:slide-out-to-bottom-[20px] data-[state=open]:slide-in-from-bottom-[-20px]",
              "data-[state=open]:duration-250 data-[state=closed]:duration-250"
            ],
            "focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          )}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-labelledby={title ? 'dialog-title' : undefined}
          aria-modal="true"
          aria-describedby="dialog-description"
        >
          {isMobile && (
            <div 
              className="w-12 h-1 bg-neutral-400/50 rounded-full mx-auto mt-3 mb-2 flex-shrink-0"
              aria-label="Drag handle"
            />
          )}
          {title && (
            <DialogPrimitive.Title id="dialog-title" className="sr-only">
              {title}
            </DialogPrimitive.Title>
          )}
          <div 
            id="dialog-description"
            className={cn(
              "overflow-hidden scroll-smooth [-webkit-overflow-scrolling:touch]",
              isMobile 
                ? "px-4 pb-[calc(32px+env(safe-area-inset-bottom))] sm:px-6" 
                : "p-6"
            )}
          >
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}