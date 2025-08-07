import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createPermissionRoutes } from '@/routes/permission.routes';
import { PermissionTracker } from '@/services/permission-tracker';
import { CUIError } from '@/types';

vi.mock('@/services/logger.js');

describe('Permission Routes', () => {
  let app: express.Application;
  let permissionTracker: vi.Mocked<PermissionTracker>;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    permissionTracker = {
      addPermissionRequest: vi.fn(),
      getPermissionRequests: vi.fn(),
      updatePermissionStatus: vi.fn(),
      clearExpiredRequests: vi.fn(),
    } as any;

    app.use('/api/permissions', createPermissionRoutes(permissionTracker));
    
    // Add error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  describe('POST /api/permissions/:requestId/decision', () => {
    it('should approve a permission request', async () => {
      const requestId = 'test-request-id';
      const pendingRequest = {
        id: requestId,
        toolName: 'test-tool',
        toolInput: { test: 'input' },
        streamingId: 'test-streaming-id',
        timestamp: new Date().toISOString(),
        status: 'pending' as const,
      };

      const approvedRequest = {
        ...pendingRequest,
        status: 'approved' as const,
        modifiedInput: { test: 'modified' },
      };

      permissionTracker.getPermissionRequests.mockReturnValue([pendingRequest]);
      permissionTracker.updatePermissionStatus.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/permissions/${requestId}/decision`)
        .send({
          action: 'approve',
          modifiedInput: { test: 'modified' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Permission approved successfully',
      });

      expect(permissionTracker.getPermissionRequests).toHaveBeenCalledWith({ status: 'pending' });
      expect(permissionTracker.updatePermissionStatus).toHaveBeenCalledWith(
        requestId,
        'approved',
        { modifiedInput: { test: 'modified' } }
      );
    });

    it('should deny a permission request', async () => {
      const requestId = 'test-request-id';
      const pendingRequest = {
        id: requestId,
        toolName: 'test-tool',
        toolInput: { test: 'input' },
        streamingId: 'test-streaming-id',
        timestamp: new Date().toISOString(),
        status: 'pending' as const,
      };

      const deniedRequest = {
        ...pendingRequest,
        status: 'denied' as const,
        denyReason: 'User denied permission',
      };

      permissionTracker.getPermissionRequests.mockReturnValue([pendingRequest]);
      permissionTracker.updatePermissionStatus.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/permissions/${requestId}/decision`)
        .send({
          action: 'deny',
          denyReason: 'User denied permission',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Permission denied successfully',
      });

      expect(permissionTracker.getPermissionRequests).toHaveBeenCalledWith({ status: 'pending' });
      expect(permissionTracker.updatePermissionStatus).toHaveBeenCalledWith(
        requestId,
        'denied',
        { denyReason: 'User denied permission' }
      );
    });

    it('should return 400 for invalid action', async () => {
      const response = await request(app)
        .post('/api/permissions/test-id/decision')
        .send({
          action: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Action must be either "approve" or "deny"');
    });

    it('should return 404 for non-existent permission request', async () => {
      permissionTracker.getPermissionRequests.mockReturnValue([]);

      const response = await request(app)
        .post('/api/permissions/non-existent-id/decision')
        .send({
          action: 'approve',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Permission request not found or not pending');
    });

    it('should return 404 for already processed permission request', async () => {
      const requestId = 'test-request-id';
      const approvedRequest = {
        id: requestId,
        toolName: 'test-tool',
        toolInput: { test: 'input' },
        streamingId: 'test-streaming-id',
        timestamp: new Date().toISOString(),
        status: 'approved' as const,
      };

      permissionTracker.getPermissionRequests.mockReturnValue([]);

      const response = await request(app)
        .post(`/api/permissions/${requestId}/decision`)
        .send({
          action: 'approve',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Permission request not found or not pending');
    });
  });

  describe('POST /api/permissions/notify', () => {
    it('should create a new permission request', async () => {
      const permissionRequest = {
        id: 'generated-id',
        toolName: 'test-tool',
        toolInput: { test: 'input' },
        streamingId: 'test-streaming-id',
        timestamp: new Date().toISOString(),
        status: 'pending' as const,
      };

      permissionTracker.addPermissionRequest.mockReturnValue(permissionRequest);

      const response = await request(app)
        .post('/api/permissions/notify')
        .send({
          toolName: 'test-tool',
          toolInput: { test: 'input' },
          streamingId: 'test-streaming-id',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        id: 'generated-id',
      });

      expect(permissionTracker.addPermissionRequest).toHaveBeenCalledWith(
        'test-tool',
        { test: 'input' },
        'test-streaming-id'
      );
    });

    it('should return 400 if toolName is missing', async () => {
      const response = await request(app)
        .post('/api/permissions/notify')
        .send({
          toolInput: { test: 'input' },
          streamingId: 'test-streaming-id',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('toolName is required');
    });
  });

  describe('GET /api/permissions', () => {
    it('should list all permissions', async () => {
      const permissions = [
        {
          id: 'id1',
          toolName: 'tool1',
          toolInput: {},
          streamingId: 'stream1',
          timestamp: new Date().toISOString(),
          status: 'pending' as const,
        },
        {
          id: 'id2',
          toolName: 'tool2',
          toolInput: {},
          streamingId: 'stream2',
          timestamp: new Date().toISOString(),
          status: 'approved' as const,
        },
      ];

      permissionTracker.getPermissionRequests.mockReturnValue(permissions);

      const response = await request(app)
        .get('/api/permissions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ permissions });
      expect(permissionTracker.getPermissionRequests).toHaveBeenCalledWith({});
    });

    it('should filter permissions by streamingId', async () => {
      const permissions = [
        {
          id: 'id1',
          toolName: 'tool1',
          toolInput: {},
          streamingId: 'stream1',
          timestamp: new Date().toISOString(),
          status: 'pending' as const,
        },
      ];

      permissionTracker.getPermissionRequests.mockReturnValue(permissions);

      const response = await request(app)
        .get('/api/permissions?streamingId=stream1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ permissions });
      expect(permissionTracker.getPermissionRequests).toHaveBeenCalledWith({
        streamingId: 'stream1',
      });
    });

    it('should filter permissions by status', async () => {
      const permissions = [
        {
          id: 'id1',
          toolName: 'tool1',
          toolInput: {},
          streamingId: 'stream1',
          timestamp: new Date().toISOString(),
          status: 'pending' as const,
        },
      ];

      permissionTracker.getPermissionRequests.mockReturnValue(permissions);

      const response = await request(app)
        .get('/api/permissions?status=pending');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ permissions });
      expect(permissionTracker.getPermissionRequests).toHaveBeenCalledWith({
        status: 'pending',
      });
    });
  });
});