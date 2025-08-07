import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/web/chat/components/ui/tabs';

interface TaskTabsProps {
  activeTab: 'tasks' | 'history' | 'archive';
  onTabChange: (tab: 'tasks' | 'history' | 'archive') => void;
}

export function TaskTabs({ activeTab, onTabChange }: TaskTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'tasks' | 'history' | 'archive')} className="w-full mt-4">
      <div className="w-full border-b border-border/30">
        <TabsList className="w-64 flex justify-start gap-4 bg-transparent rounded-none h-auto p-0">
          <TabsTrigger 
            value="tasks" 
            className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground border-0 rounded-none pb-3 pt-2 px-2 text-muted-foreground hover:text-muted-foreground/80 transition-colors"
            aria-label="Tab selector to view all tasks"
          >
            Tasks
          </TabsTrigger>
          <TabsTrigger 
            value="history"
            className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground border-0 rounded-none pb-3 pt-2 px-2 text-muted-foreground hover:text-muted-foreground/80 transition-colors"
            aria-label="Tab selector to view history"
          >
            History
          </TabsTrigger>
          <TabsTrigger 
            value="archive"
            className="data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground border-0 rounded-none pb-3 pt-2 px-2 text-muted-foreground hover:text-muted-foreground/80 transition-colors"
            aria-label="Tab selector to view archived tasks"
          >
            Archive
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  );
}