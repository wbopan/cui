import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Don't mock the entire module - just create mock instances as needed

// Don't mock logger globally - create mock logger instances only when needed

// Mock the machine-id module before importing the service
mock.module('@/utils/machine-id', () => ({
  generateMachineId: mock(() => Promise.resolve('test-machine-12345678'))
}));

import { NotificationService } from '@/services/notification-service';
import { PermissionRequest } from '@/types';
import { generateMachineId } from '@/utils/machine-id';

// Mock fetch with proper typing for Bun
const mockFetch = mock() as any;
global.fetch = mockFetch;

describe('NotificationService', () => {
  let service: NotificationService;
  let mockPreferencesService: any;
  
  beforeEach(() => {
    // Clear all mocks
    mockFetch.mockClear();
    
    // Setup mocked preferences service
    mockPreferencesService = {
      getPreferences: mock(() => Promise.resolve({
        colorScheme: 'system',
        language: 'en',
        notifications: {
          enabled: true,
          ntfyUrl: 'https://ntfy.sh'
        }
      }))
    };
    
    // Create service instance for each test
    service = new NotificationService(mockPreferencesService);
    
    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: true,
      text: mock(() => Promise.resolve('Success'))
    }));
  });

  describe('sendPermissionNotification', () => {
    const mockPermissionRequest: PermissionRequest = {
      id: 'perm-123',
      streamingId: 'stream-456',
      toolName: 'Bash',
      toolInput: { command: 'npm install express' },
      timestamp: '2024-01-01T00:00:00Z',
      status: 'pending'
    };

    it('should send permission notification when enabled', async () => {
      await service.sendPermissionNotification(mockPermissionRequest, 'session-789');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/ntfy\.sh\/cui-.+$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Title': 'CUI Permission Request',
            'Priority': 'default',
            'Tags': 'cui-permission',
            'X-CUI-SessionId': 'session-789',
            'X-CUI-StreamingId': 'stream-456',
            'X-CUI-PermissionRequestId': 'perm-123'
          }),
          body: expect.stringContaining('Bash tool: ')
        })
      );
    });

    it('should skip notification when disabled', async () => {
      mockPreferencesService.getPreferences.mockImplementation(() => Promise.resolve({
        colorScheme: 'system',
        language: 'en',
        notifications: {
          enabled: false
        }
      }));

      await service.sendPermissionNotification(mockPermissionRequest, undefined);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));

      // Should not throw
      await service.sendPermissionNotification(mockPermissionRequest, undefined, undefined);
    });

    it('should handle non-ok responses', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: false,
        status: 500,
        text: mock(() => Promise.resolve('Server error'))
      }));

      // Should not throw
      await service.sendPermissionNotification(mockPermissionRequest, undefined, undefined);
    });

    it('should use custom ntfy URL if provided', async () => {
      mockPreferencesService.getPreferences.mockImplementation(() => Promise.resolve({
        colorScheme: 'system',
        language: 'en',
        notifications: {
          enabled: true,
          ntfyUrl: 'https://custom.ntfy.server'
        }
      }));

      await service.sendPermissionNotification(mockPermissionRequest, undefined, undefined);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/custom\.ntfy\.server\/cui-.+$/),
        expect.any(Object)
      );
    });

    it('should include summary in message when provided', async () => {
      await service.sendPermissionNotification(mockPermissionRequest, 'session-789', 'Working on authentication');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: 'Working on authentication - Bash'
        })
      );
    });

    it('should show tool input when summary not provided', async () => {
      await service.sendPermissionNotification(mockPermissionRequest, 'session-789');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('Bash tool: {"command":"npm install express"}')
        })
      );
    });
  });

  describe('sendConversationEndNotification', () => {
    it('should send conversation end notification when enabled', async () => {
      await service.sendConversationEndNotification(
        'stream-123',
        'session-456',
        'Fixed authentication bug'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/ntfy\.sh\/cui-.+$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Title': 'Task Finished',
            'Priority': 'default',
            'Tags': 'cui-complete',
            'X-CUI-SessionId': 'session-456',
            'X-CUI-StreamingId': 'stream-123'
          }),
          body: 'Fixed authentication bug'
        })
      );
    });

    it('should use default message when summary not provided', async () => {
      await service.sendConversationEndNotification(
        'stream-123',
        'session-456'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: 'Task completed'
        })
      );
    });

    it('should skip notification when disabled', async () => {
      mockPreferencesService.getPreferences.mockImplementation(() => Promise.resolve({
        colorScheme: 'system',
        language: 'en',
        notifications: {
          enabled: false
        }
      }));

      await service.sendConversationEndNotification('stream-123', 'session-456');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));

      // Should not throw even if notification fails
      await service.sendConversationEndNotification('stream-123', 'session-456');
    });
  });

  describe('notification preferences', () => {
    it('should not send any notifications when preferences not set', async () => {
      mockPreferencesService.getPreferences.mockImplementation(() => Promise.resolve({
        colorScheme: 'system',
        language: 'en'
        // notifications field not set
      }));

      const mockRequest: PermissionRequest = {
        id: 'perm-123',
        streamingId: 'stream-456',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        timestamp: '2024-01-01T00:00:00Z',
        status: 'pending'
      };

      await service.sendPermissionNotification(mockRequest, undefined);
      await service.sendConversationEndNotification('stream-123', 'session-456');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});