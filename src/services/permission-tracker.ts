import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { PermissionRequest } from '@/types/index.js';
import { logger } from '@/services/logger.js';
import { NotificationService } from './notification-service.js';
import { ConversationStatusManager } from './conversation-status-manager.js';
import { ClaudeHistoryReader } from './claude-history-reader.js';

/**
 * Service to track permission requests from Claude CLI via MCP
 */
export class PermissionTracker extends EventEmitter {
  private permissionRequests: Map<string, PermissionRequest> = new Map();
  private notificationService?: NotificationService;
  private conversationStatusManager?: ConversationStatusManager;
  private historyReader?: ClaudeHistoryReader;

  constructor() {
    super();
  }

  /**
   * Set the notification service
   */
  setNotificationService(service: NotificationService): void {
    this.notificationService = service;
  }

  /**
   * Set the conversation status manager
   */
  setConversationStatusManager(manager: ConversationStatusManager): void {
    this.conversationStatusManager = manager;
  }

  /**
   * Set the history reader
   */
  setHistoryReader(reader: ClaudeHistoryReader): void {
    this.historyReader = reader;
  }

  /**
   * Add a new permission request
   */
  addPermissionRequest(toolName: string, toolInput: Record<string, unknown>, streamingId?: string): PermissionRequest {
    const id = uuidv4();
    const request: PermissionRequest = {
      id,
      streamingId: streamingId || 'unknown',
      toolName,
      toolInput,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    this.permissionRequests.set(id, request);
    logger.info('Permission request added', { id, toolName, streamingId });

    // Emit event for new permission request
    this.emit('permission_request', request);

    // Send notification if services are available
    if (this.notificationService && this.conversationStatusManager && this.historyReader) {
      // Get session ID from streaming ID
      const sessionId = this.conversationStatusManager.getSessionId(streamingId || '');
      
      if (sessionId) {
        // Try to get conversation summary
        this.historyReader.getConversationMetadata(sessionId)
          .then(metadata => {
            if (this.notificationService) {
              return this.notificationService.sendPermissionNotification(
                request, 
                sessionId, 
                metadata?.summary
              );
            }
          })
          .catch(error => {
            logger.error('Failed to fetch conversation metadata for notification', error);
            // Fall back to sending without summary
            if (this.notificationService) {
              this.notificationService.sendPermissionNotification(request, sessionId)
                .catch(err => logger.error('Failed to send permission notification', err));
            }
          });
      } else {
        // No session ID available, send without session info
        this.notificationService.sendPermissionNotification(request)
          .catch(error => {
            logger.error('Failed to send permission notification', error);
          });
      }
    }

    return request;
  }

  /**
   * Get all permission requests
   */
  getAllPermissionRequests(): PermissionRequest[] {
    return Array.from(this.permissionRequests.values());
  }

  /**
   * Get permission requests filtered by criteria
   */
  getPermissionRequests(filter?: { streamingId?: string; status?: 'pending' | 'approved' | 'denied' }): PermissionRequest[] {
    let requests = Array.from(this.permissionRequests.values());

    if (filter?.streamingId) {
      requests = requests.filter(req => req.streamingId === filter.streamingId);
    }

    if (filter?.status) {
      requests = requests.filter(req => req.status === filter.status);
    }

    return requests;
  }

  /**
   * Get a specific permission request by ID
   */
  getPermissionRequest(id: string): PermissionRequest | undefined {
    return this.permissionRequests.get(id);
  }

  /**
   * Update permission request status (for future use when we implement approval/denial)
   */
  updatePermissionStatus(
    id: string, 
    status: 'approved' | 'denied', 
    options?: { modifiedInput?: Record<string, unknown>; denyReason?: string }
  ): boolean {
    const request = this.permissionRequests.get(id);
    if (!request) {
      logger.warn('Permission request not found', { id });
      return false;
    }

    request.status = status;
    if (status === 'approved' && options?.modifiedInput) {
      request.modifiedInput = options.modifiedInput;
    }
    if (status === 'denied' && options?.denyReason) {
      request.denyReason = options.denyReason;
    }

    logger.info('Permission request updated', { id, status });
    this.emit('permission_updated', request);

    return true;
  }

  /**
   * Clear all permission requests (for testing)
   */
  clear(): void {
    this.permissionRequests.clear();
  }

  /**
   * Get the number of permission requests
   */
  size(): number {
    return this.permissionRequests.size;
  }

  /**
   * Remove all permissions for a specific streaming ID
   * Used for cleanup when a conversation ends
   */
  removePermissionsByStreamingId(streamingId: string): number {
    const toRemove: string[] = [];
    
    // Find all permissions with this streamingId
    for (const [id, request] of this.permissionRequests.entries()) {
      if (request.streamingId === streamingId) {
        toRemove.push(id);
      }
    }
    
    // Remove them
    toRemove.forEach(id => this.permissionRequests.delete(id));
    
    if (toRemove.length > 0) {
      logger.info('Removed permissions for streaming session', { 
        streamingId, 
        removedCount: toRemove.length 
      });
    }
    
    return toRemove.length;
  }
}