import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/web/chat/components/ui/collapsible';

interface ToolCollapseProps {
  summaryText: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
}

export function ToolCollapse({ 
  summaryText, 
  defaultExpanded = false, 
  children, 
  ariaLabel 
}: ToolCollapseProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div 
            className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground flex items-center gap-1"
            aria-label={ariaLabel || `Toggle ${summaryText.toLowerCase()} details`}
          >
            <CornerDownRight 
              size={12} 
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
            {summaryText}
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          {children}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}