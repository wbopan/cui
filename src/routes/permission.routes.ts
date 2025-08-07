import { Router } from 'express';
import { CUIError, PermissionDecisionRequest, PermissionDecisionResponse } from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { PermissionTracker } from '@/services/permission-tracker.js';
import { createLogger } from '@/services/logger.js';

export function createPermissionRoutes(
  permissionTracker: PermissionTracker
): Router {
  const router = Router();
  const logger = createLogger('PermissionRoutes');

  // Notify endpoint - called by MCP server when permission is requested
  router.post('/notify', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('Permission notification received', {
      requestId,
      body: req.body
    });
    
    try {
      const { toolName, toolInput, streamingId } = req.body;
      
      if (!toolName) {
        throw new CUIError('MISSING_TOOL_NAME', 'toolName is required', 400);
      }
      
      // Add permission request with the provided streamingId
      const request = permissionTracker.addPermissionRequest(toolName, toolInput, streamingId);
      
      logger.debug('Permission request tracked', {
        requestId,
        permissionId: request.id,
        toolName,
        streamingId: request.streamingId
      });
      
      res.json({ success: true, id: request.id });
    } catch (error) {
      logger.debug('Permission notification failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // List permissions
  router.get('/', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('List permissions request', {
      requestId,
      query: req.query
    });
    
    try {
      const { streamingId, status } = req.query as { streamingId?: string; status?: 'pending' | 'approved' | 'denied' };
      
      const permissions = permissionTracker.getPermissionRequests({ streamingId, status });
      
      logger.debug('Permissions listed successfully', {
        requestId,
        count: permissions.length,
        filter: { streamingId, status }
      });
      
      res.json({ permissions });
    } catch (error) {
      logger.debug('List permissions failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Permission decision endpoint - called by frontend to approve/deny permissions
  router.post('/:requestId/decision', async (req: RequestWithRequestId, res, next) => {
    const requestIdHeader = req.requestId;
    const { requestId } = req.params;
    const decisionRequest: PermissionDecisionRequest = req.body;
    
    logger.debug('Permission decision request', {
      requestId: requestIdHeader,
      permissionRequestId: requestId,
      decision: decisionRequest
    });
    
    try {
      // Validate request body
      if (!decisionRequest.action || !['approve', 'deny'].includes(decisionRequest.action)) {
        throw new CUIError('INVALID_ACTION', 'Action must be either "approve" or "deny"', 400);
      }
      
      // Get the permission request to validate it exists and is pending
      const permissions = permissionTracker.getPermissionRequests({ status: 'pending' });
      const permission = permissions.find(p => p.id === requestId);
      
      if (!permission) {
        throw new CUIError('PERMISSION_NOT_FOUND', 'Permission request not found or not pending', 404);
      }
      
      // Update permission status
      let updated: boolean;
      if (decisionRequest.action === 'approve') {
        updated = permissionTracker.updatePermissionStatus(
          requestId, 
          'approved', 
          { modifiedInput: decisionRequest.modifiedInput }
        );
      } else {
        updated = permissionTracker.updatePermissionStatus(
          requestId, 
          'denied', 
          { denyReason: decisionRequest.denyReason }
        );
      }
      
      if (!updated) {
        throw new CUIError('UPDATE_FAILED', 'Failed to update permission status', 500);
      }
      
      logger.debug('Permission decision processed', {
        requestId: requestIdHeader,
        permissionRequestId: requestId,
        action: decisionRequest.action
      });
      
      const response: PermissionDecisionResponse = {
        success: true,
        message: `Permission ${decisionRequest.action === 'approve' ? 'approved' : 'denied'} successfully`
      };
      
      res.json(response);
    } catch (error) {
      logger.debug('Permission decision failed', {
        requestId: requestIdHeader,
        permissionRequestId: requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  return router;
}