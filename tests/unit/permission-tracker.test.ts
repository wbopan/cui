import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PermissionTracker } from '@/services/permission-tracker';
import { PermissionRequest } from '@/types';

describe('PermissionTracker', () => {
  let tracker: PermissionTracker;

  beforeEach(() => {
    tracker = new PermissionTracker();
  });

  afterEach(() => {
    tracker.clear();
  });

  describe('addPermissionRequest', () => {
    it('should add a new permission request', () => {
      const request = tracker.addPermissionRequest('Bash', { command: 'ls -la' }, 'stream-123');

      expect(request.id).toBeDefined();
      expect(request.toolName).toBe('Bash');
      expect(request.toolInput).toEqual({ command: 'ls -la' });
      expect(request.streamingId).toBe('stream-123');
      expect(request.status).toBe('pending');
      expect(request.timestamp).toBeDefined();
    });

    it('should use unknown streamingId when not provided', () => {
      const request = tracker.addPermissionRequest('Read', { file_path: '/tmp/test.txt' });

      expect(request.streamingId).toBe('unknown');
    });

    it('should emit permission_request event', () => {
      return new Promise<void>((resolve) => {
        tracker.on('permission_request', (request: PermissionRequest) => {
          expect(request.toolName).toBe('Write');
          expect(request.toolInput).toEqual({ file_path: '/tmp/output.txt', content: 'Hello' });
          resolve();
        });

        tracker.addPermissionRequest('Write', { file_path: '/tmp/output.txt', content: 'Hello' });
      });
    });
  });

  describe('getAllPermissionRequests', () => {
    it('should return all permission requests', () => {
      tracker.addPermissionRequest('Bash', { command: 'pwd' });
      tracker.addPermissionRequest('Read', { file_path: '/etc/hosts' });

      const requests = tracker.getAllPermissionRequests();

      expect(requests).toHaveLength(2);
      expect(requests[0].toolName).toBe('Bash');
      expect(requests[1].toolName).toBe('Read');
    });

    it('should return empty array when no requests', () => {
      const requests = tracker.getAllPermissionRequests();
      expect(requests).toEqual([]);
    });
  });

  describe('getPermissionRequests', () => {
    beforeEach(() => {
      // Add some test requests
      const req1 = tracker.addPermissionRequest('Bash', { command: 'ls' }, 'stream-1');
      const req2 = tracker.addPermissionRequest('Read', { file_path: '/tmp/a.txt' }, 'stream-2');
      const req3 = tracker.addPermissionRequest('Write', { file_path: '/tmp/b.txt' }, 'stream-1');
      
      // Update some statuses
      tracker.updatePermissionStatus(req1.id, 'approved');
      tracker.updatePermissionStatus(req2.id, 'denied', { denyReason: 'Not allowed' });
    });

    it('should filter by streamingId', () => {
      const requests = tracker.getPermissionRequests({ streamingId: 'stream-1' });

      expect(requests).toHaveLength(2);
      expect(requests[0].toolName).toBe('Bash');
      expect(requests[1].toolName).toBe('Write');
    });

    it('should filter by status', () => {
      const pendingRequests = tracker.getPermissionRequests({ status: 'pending' });
      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].toolName).toBe('Write');

      const approvedRequests = tracker.getPermissionRequests({ status: 'approved' });
      expect(approvedRequests).toHaveLength(1);
      expect(approvedRequests[0].toolName).toBe('Bash');

      const deniedRequests = tracker.getPermissionRequests({ status: 'denied' });
      expect(deniedRequests).toHaveLength(1);
      expect(deniedRequests[0].toolName).toBe('Read');
    });

    it('should filter by both streamingId and status', () => {
      const requests = tracker.getPermissionRequests({ 
        streamingId: 'stream-1', 
        status: 'approved' 
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].toolName).toBe('Bash');
    });
  });

  describe('getPermissionRequest', () => {
    it('should return specific permission request by ID', () => {
      const added = tracker.addPermissionRequest('Bash', { command: 'echo test' });
      
      const request = tracker.getPermissionRequest(added.id);

      expect(request).toBeDefined();
      expect(request?.id).toBe(added.id);
      expect(request?.toolName).toBe('Bash');
    });

    it('should return undefined for non-existent ID', () => {
      const request = tracker.getPermissionRequest('non-existent-id');
      expect(request).toBeUndefined();
    });
  });

  describe('updatePermissionStatus', () => {
    it('should update permission status to approved', () => {
      const request = tracker.addPermissionRequest('Bash', { command: 'ls' });
      
      const success = tracker.updatePermissionStatus(request.id, 'approved');

      expect(success).toBe(true);
      const updated = tracker.getPermissionRequest(request.id);
      expect(updated?.status).toBe('approved');
    });

    it('should update permission status to denied with reason', () => {
      const request = tracker.addPermissionRequest('Bash', { command: 'rm -rf /' });
      
      const success = tracker.updatePermissionStatus(request.id, 'denied', { 
        denyReason: 'Dangerous command' 
      });

      expect(success).toBe(true);
      const updated = tracker.getPermissionRequest(request.id);
      expect(updated?.status).toBe('denied');
      expect(updated?.denyReason).toBe('Dangerous command');
    });

    it('should update with modified input when approved', () => {
      const request = tracker.addPermissionRequest('Bash', { command: 'rm file.txt' });
      
      const success = tracker.updatePermissionStatus(request.id, 'approved', { 
        modifiedInput: { command: 'rm -i file.txt' } 
      });

      expect(success).toBe(true);
      const updated = tracker.getPermissionRequest(request.id);
      expect(updated?.status).toBe('approved');
      expect(updated?.modifiedInput).toEqual({ command: 'rm -i file.txt' });
    });

    it('should return false for non-existent request', () => {
      const success = tracker.updatePermissionStatus('non-existent', 'approved');
      expect(success).toBe(false);
    });

    it('should emit permission_updated event', () => {
      return new Promise<void>((resolve) => {
        const request = tracker.addPermissionRequest('Edit', { file_path: '/tmp/test.txt' });

        tracker.on('permission_updated', (updated: PermissionRequest) => {
          expect(updated.id).toBe(request.id);
          expect(updated.status).toBe('approved');
          resolve();
        });

        tracker.updatePermissionStatus(request.id, 'approved');
      });
    });
  });

  describe('clear', () => {
    it('should clear all permission requests', () => {
      tracker.addPermissionRequest('Bash', { command: 'ls' });
      tracker.addPermissionRequest('Read', { file_path: '/tmp/test.txt' });

      expect(tracker.size()).toBe(2);

      tracker.clear();

      expect(tracker.size()).toBe(0);
      expect(tracker.getAllPermissionRequests()).toEqual([]);
    });
  });

  describe('size', () => {
    it('should return the number of permission requests', () => {
      expect(tracker.size()).toBe(0);

      tracker.addPermissionRequest('Bash', { command: 'ls' });
      expect(tracker.size()).toBe(1);

      tracker.addPermissionRequest('Read', { file_path: '/tmp/test.txt' });
      expect(tracker.size()).toBe(2);
    });
  });

  describe('removePermissionsByStreamingId', () => {
    beforeEach(() => {
      // Add requests for different streaming IDs
      tracker.addPermissionRequest('Bash', { command: 'ls' }, 'stream-1');
      tracker.addPermissionRequest('Read', { file_path: '/tmp/a.txt' }, 'stream-2');
      tracker.addPermissionRequest('Write', { file_path: '/tmp/b.txt' }, 'stream-1');
      tracker.addPermissionRequest('Edit', { file_path: '/tmp/c.txt' }, 'stream-3');
    });

    it('should remove all permissions for a specific streaming ID', () => {
      expect(tracker.size()).toBe(4);

      const removedCount = tracker.removePermissionsByStreamingId('stream-1');

      expect(removedCount).toBe(2);
      expect(tracker.size()).toBe(2);

      // Verify that only stream-1 permissions were removed
      const remaining = tracker.getAllPermissionRequests();
      expect(remaining).toHaveLength(2);
      expect(remaining[0].streamingId).toBe('stream-2');
      expect(remaining[1].streamingId).toBe('stream-3');
    });

    it('should return 0 when no permissions match the streaming ID', () => {
      const removedCount = tracker.removePermissionsByStreamingId('non-existent-stream');

      expect(removedCount).toBe(0);
      expect(tracker.size()).toBe(4);
    });

    it('should handle removing permissions from empty tracker', () => {
      tracker.clear();

      const removedCount = tracker.removePermissionsByStreamingId('stream-1');

      expect(removedCount).toBe(0);
      expect(tracker.size()).toBe(0);
    });

    it('should remove all permissions when all have same streaming ID', () => {
      tracker.clear();
      tracker.addPermissionRequest('Bash', { command: 'ls' }, 'stream-x');
      tracker.addPermissionRequest('Read', { file_path: '/tmp/test.txt' }, 'stream-x');
      tracker.addPermissionRequest('Write', { file_path: '/tmp/out.txt' }, 'stream-x');

      const removedCount = tracker.removePermissionsByStreamingId('stream-x');

      expect(removedCount).toBe(3);
      expect(tracker.size()).toBe(0);
      expect(tracker.getAllPermissionRequests()).toEqual([]);
    });
  });
});