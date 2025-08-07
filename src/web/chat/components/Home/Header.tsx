import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { PreferencesModal } from '../PreferencesModal/PreferencesModal';
import { Button } from '@/web/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';

export function Header() {
  const theme = useTheme();
  const [showPrefs, setShowPrefs] = useState(false);
  
  console.log('Header rendering, showPrefs:', showPrefs);
  
  const handleOpenSettings = () => {
    console.log('Header handleOpenSettings called');
    setShowPrefs(true);
  };
  
  const handleCloseSettings = () => {
    console.log('Header handleCloseSettings called');
    setShowPrefs(false);
  };
  
  useEffect(() => {
    console.log('Header useEffect - showPrefs changed to:', showPrefs);
  }, [showPrefs]);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between p-3 h-[60px] bg-background font-semibold">
        <div className="relative flex items-center justify-between w-full px-1 py-3">
          {/* Navigation */}
          <nav className="flex items-center gap-2 ml-auto">
            {/* Settings Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative w-[30px] h-[30px] rounded-full hover:bg-muted/50"
                    aria-label="Open Settings"
                    onClick={handleOpenSettings}
                  >
                    <Settings size={18} className="text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </nav>
        </div>
      </header>
      {showPrefs && <PreferencesModal onClose={handleCloseSettings} />}
    </>
  );
}