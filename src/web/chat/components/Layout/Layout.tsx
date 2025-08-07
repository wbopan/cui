import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-white relative">
      <main className="flex-1 flex flex-col overflow-hidden h-full">
        {children}
      </main>
    </div>
  );
}