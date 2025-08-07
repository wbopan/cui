#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import { logger } from '@/services/logger.js';

// Type definitions
interface PermissionNotificationResponse {
  success: boolean;
  id: string;
}

interface Permission {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  modifiedInput?: Record<string, unknown>;
  denyReason?: string;
}

interface PermissionsResponse {
  permissions: Permission[];
}

// Get CUI server URL from environment
const CUI_SERVER_URL = process.env.CUI_SERVER_URL || `http://localhost:${process.env.CUI_SERVER_PORT || '3001'}`;

// Get CUI streaming ID from environment (passed by ClaudeProcessManager)
const CUI_STREAMING_ID = process.env.CUI_STREAMING_ID;

// Create MCP server
const server = new Server({
  name: 'cui-permissions',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Define the approval_prompt tool
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'approval_prompt',
    description: 'Request approval for tool usage from CUI',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'The tool requesting permission',
        },
        input: {
          type: 'object',
          description: 'The input for the tool',
        },
      },
      required: ['tool_name', 'input'],
    },
  }],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'approval_prompt') {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  const { tool_name, input } = request.params.arguments as { tool_name: string; input: Record<string, unknown> };

  try {
    
    // Log the permission request
    logger.debug('MCP Permission request received', { tool_name, input, streamingId: CUI_STREAMING_ID });

    // Send the permission request to CUI server
    const response = await fetch(`${CUI_SERVER_URL}/api/permissions/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolName: tool_name,
        toolInput: input,
        streamingId: CUI_STREAMING_ID || 'unknown', // Include the streaming ID from environment
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to notify CUI server', { status: response.status, error: errorText });
      throw new Error(`Failed to notify CUI server: ${errorText}`);
    }

    // Get the permission request ID from the notification response
    const notificationData = await response.json() as PermissionNotificationResponse;
    const permissionRequestId = notificationData.id;

    logger.debug('Permission request created', { permissionRequestId, streamingId: CUI_STREAMING_ID });

    // Poll for permission decision
    const POLL_INTERVAL = 1000; // 1 second
    const TIMEOUT = 60 * 60 * 1000; // 1 hour
    const startTime = Date.now();

     
    while (true) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT) {
        logger.warn('Permission request timed out', { tool_name, permissionRequestId });
        const timeoutResponse = {
          behavior: 'deny',
          message: 'Permission request timed out after 10 minutes after user did not respond',
        };
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(timeoutResponse),
          }],
        };
      }

      // Poll for permission status
      const pollResponse = await fetch(
        `${CUI_SERVER_URL}/api/permissions?streamingId=${CUI_STREAMING_ID}&status=pending`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!pollResponse.ok) {
        logger.error('Failed to poll permission status', { status: pollResponse.status });
        throw new Error(`Failed to poll permission status: ${pollResponse.status}`);
      }

      const { permissions } = await pollResponse.json() as PermissionsResponse;
      const permission = permissions.find((p) => p.id === permissionRequestId);

      if (!permission) {
        // Permission has been processed (no longer pending)
        // Fetch all permissions to find our specific one
        const allPermissionsResponse = await fetch(
          `${CUI_SERVER_URL}/api/permissions?streamingId=${CUI_STREAMING_ID}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!allPermissionsResponse.ok) {
          logger.error('Failed to fetch all permissions', { status: allPermissionsResponse.status });
          throw new Error(`Failed to fetch all permissions: ${allPermissionsResponse.status}`);
        }

        const { permissions: allPermissions } = await allPermissionsResponse.json() as PermissionsResponse;
        const processedPermission = allPermissions.find((p) => p.id === permissionRequestId);

        if (processedPermission) {
          if (processedPermission.status === 'approved') {
            logger.debug('Permission approved', { tool_name, permissionRequestId });
            const approvalResponse = {
              behavior: 'allow',
              updatedInput: processedPermission.modifiedInput || input,
            };
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(approvalResponse),
              }],
            };
          } else if (processedPermission.status === 'denied') {
            logger.debug('Permission denied', { tool_name, permissionRequestId });
            const denyResponse = {
              behavior: 'deny',
              message: processedPermission.denyReason || 'The user doesnt want to proceed with this tool use.The tool use was rejected(eg.if it was a file edit, the new_string was NOT written to the file).STOP what you are doing and wait for the user to tell you how to proceed.',
            };
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(denyResponse),
              }],
            };
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
    
  } catch (error) {
    logger.error('Error processing permission request', { error });
    
    // Return a deny response on error
    const denyResponse = {
      behavior: 'deny',
      message: `Permission denied due to error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(denyResponse),
      }],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP Permission server started', { cuiServerUrl: CUI_SERVER_URL });
}

main().catch((error) => {
  logger.error('MCP server error', { error });
  process.exit(1);
});