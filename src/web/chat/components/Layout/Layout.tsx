import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background relative">
      <main className="flex-1 flex flex-col overflow-hidden h-full">
        {children}
      </main>
    </div>
  );
}