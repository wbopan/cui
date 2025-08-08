import React, { useState } from 'react';
import { Ellipsis, Edit2, Pin, Bell, BellOff, PinOff } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/web/chat/components/ui/popover';
import { api } from '../services/api';
import { cn } from '../lib/utils';

interface MoreOptionsMenuProps {
  sessionId: string;
  currentName: string;
  isPinned?: boolean;
  isNotificationsEnabled?: boolean;
  onRename?: () => void;
  onPinToggle?: (isPinned: boolean) => void;
  className?: string;
}

export function MoreOptionsMenu({
  sessionId,
  currentName,
  isPinned = false,
  isNotificationsEnabled = false,
  onRename,
  onPinToggle,
  className,
}: MoreOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localIsNotificationsEnabled, setLocalIsNotificationsEnabled] = useState(isNotificationsEnabled);

  const handleRename = () => {
    setIsOpen(false);
    onRename?.();
  };

  const handlePinToggle = async () => {
    const newPinnedState = !isPinned;
    try {
      await api.updateSession(sessionId, { pinned: newPinnedState });
      onPinToggle?.(newPinnedState);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleNotificationsToggle = async () => {
    const newNotificationState = !localIsNotificationsEnabled;
    try {
      const config = await api.getConfig();
      const updatedConfig = {
        ...config,
        notifications: {
          ...config.notifications,
          enabled: newNotificationState,
        },
      };
      await api.updateConfig(updatedConfig);
      setLocalIsNotificationsEnabled(newNotificationState);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to toggle notifications:', error);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "w-6 h-6 rounded-full hover:bg-muted/50",
            className
          )}
          aria-label="More options"
        >
          <Ellipsis size={21} />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-52 p-2 rounded-2xl"
        align="end"
        sideOffset={5}
      >
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRename}
            className="w-full justify-start gap-3 h-9 px-3 text-sm font-normal text-foreground hover:bg-muted/50 rounded-lg"
          >
            <Edit2 size={14} />
            Rename
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePinToggle}
            className="w-full justify-start gap-3 h-9 px-3 text-sm font-normal text-foreground hover:bg-muted/50 rounded-lg"
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            {isPinned ? 'Unpin' : 'Pin'}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNotificationsToggle}
            className="w-full justify-start gap-3 h-9 px-3 text-sm font-normal text-foreground hover:bg-muted/50 rounded-lg"
          >
            {localIsNotificationsEnabled ? <BellOff size={14} /> : <Bell size={14} />}
            {localIsNotificationsEnabled ? 'Mute' : 'Notify me'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}