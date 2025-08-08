import React from 'react';
import { ToolLabel } from '../../../chat/components/ToolRendering/ToolLabel';
import { ToolContent } from '../../../chat/components/ToolRendering/ToolContent';
import type { PermissionRequest } from '../../types';

interface PermissionDialogProps {
  permissionRequest: PermissionRequest;
  isVisible: boolean;
}

export function PermissionDialog({ permissionRequest, isVisible }: PermissionDialogProps) {
  if (!isVisible || !permissionRequest) {
    return null;
  }

  return (
    <div 
      className="absolute bottom-full left-1/2 -translate-x-1/2 z-[1000] mb-3 w-full"
      role="dialog"
      aria-label="Permission request dialog"
    >
      <div className="bg-black border border-border rounded-xl shadow-[0_0_10px_rgba(0,0,0,0.15)] w-full max-h-[70vh] flex flex-col overflow-hidden animate-slide-up">
        <div className="px-4 pt-3">
          <div 
            className="text-sm font-semibold mb-2.5 text-white"
            role="heading"
            aria-level={2}
          >
            PERMISSION REQUEST:
          </div>
        </div>
        <div className="px-4 pb-4 pt-[15px] m-0.5 rounded-[7px] overflow-y-auto bg-background flex-1">
          <ToolLabel 
            toolName={permissionRequest.toolName}
            toolInput={permissionRequest.toolInput}
          />
          <ToolContent
            toolName={permissionRequest.toolName}
            toolInput={permissionRequest.toolInput}
          />
        </div>
      </div>
    </div>
  );
}