import { PermissionRequest } from '@/types/index.js';
import { createLogger, type Logger } from './logger.js';
import { PreferencesService } from './preferences-service.js';
import { ConfigService } from './config-service.js';

export interface Notification {
  title: string;
  message: string;
  priority: 'min' | 'low' | 'default' | 'high' | 'urgent';
  tags: string[];
  sessionId: string;
  streamingId: string;
  permissionRequestId?: string;
}

/**
 * Service for sending push notifications via ntfy.sh
 */
export class NotificationService {
  private logger: Logger;
  private preferencesService: PreferencesService;
  private configService: ConfigService;
  private machineId: string | null = null;

  constructor(preferencesService: PreferencesService) {
    this.logger = createLogger('NotificationService');
    this.preferencesService = preferencesService;
    this.configService = ConfigService.getInstance();
  }

  /**
   * Get machine ID from config
   */
  private getMachineId(): string {
    if (!this.machineId) {
      try {
        const config = this.configService.getConfig();
        this.machineId = config.machine_id;
      } catch (error) {
        this.logger.error('Failed to get machine ID from config', error);
        this.machineId = 'unknown';
      }
    }
    return this.machineId;
  }

  /**
   * Check if notifications are enabled
   */
  private async isEnabled(): Promise<boolean> {
    const preferences = await this.preferencesService.getPreferences();
    return preferences.notifications?.enabled ?? false;
  }

  /**
   * Get the ntfy URL from preferences
   */
  private async getNtfyUrl(): Promise<string> {
    const preferences = await this.preferencesService.getPreferences();
    return preferences.notifications?.ntfyUrl || 'https://ntfy.sh';
  }

  /**
   * Send a notification for a permission request
   */
  async sendPermissionNotification(
    request: PermissionRequest,
    sessionId?: string,
    summary?: string
  ): Promise<void> {
    if (!(await this.isEnabled())) {
      this.logger.debug('Notifications disabled, skipping permission notification');
      return;
    }

    try {
      const machineId = this.getMachineId();
      const topic = `cui-${machineId}`;
      const ntfyUrl = await this.getNtfyUrl();

      const notification: Notification = {
        title: 'CUI Permission Request',
        message: summary 
          ? `${summary} - ${request.toolName}`
          : `${request.toolName} tool: ${JSON.stringify(request.toolInput).substring(0, 100)}...`,
        priority: 'default',
        tags: ['cui-permission'],
        sessionId: sessionId || 'unknown',
        streamingId: request.streamingId,
        permissionRequestId: request.id
      };

      await this.sendNotification(ntfyUrl, topic, notification);
      
      this.logger.info('Permission notification sent', {
        requestId: request.id,
        toolName: request.toolName,
        topic
      });
    } catch (error) {
      this.logger.error('Failed to send permission notification', error, {
        requestId: request.id
      });
    }
  }

  /**
   * Send a notification when a conversation ends
   */
  async sendConversationEndNotification(
    streamingId: string,
    sessionId: string,
    summary?: string
  ): Promise<void> {
    if (!(await this.isEnabled())) {
      this.logger.debug('Notifications disabled, skipping conversation end notification');
      return;
    }

    try {
      const machineId = this.getMachineId();
      const topic = `cui-${machineId}`;
      const ntfyUrl = await this.getNtfyUrl();

      const notification: Notification = {
        title: 'Task Finished',
        message: summary || 'Task completed',
        priority: 'default',
        tags: ['cui-complete'],
        sessionId,
        streamingId
      };

      await this.sendNotification(ntfyUrl, topic, notification);
      
      this.logger.info('Conversation end notification sent', {
        sessionId,
        streamingId,
        topic
      });
    } catch (error) {
      this.logger.error('Failed to send conversation end notification', error, {
        sessionId,
        streamingId
      });
    }
  }

  /**
   * Send a notification to ntfy
   */
  private async sendNotification(
    ntfyUrl: string,
    topic: string,
    notification: Notification
  ): Promise<void> {
    const url = `${ntfyUrl}/${topic}`;
    
    const headers: Record<string, string> = {
      'Title': notification.title,
      'Priority': notification.priority,
      'Tags': notification.tags.join(',')
    };

    // Add custom headers for CUI metadata
    headers['X-CUI-SessionId'] = notification.sessionId;
    headers['X-CUI-StreamingId'] = notification.streamingId;
    if (notification.permissionRequestId) {
      headers['X-CUI-PermissionRequestId'] = notification.permissionRequestId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: notification.message
    });

    if (!response.ok) {
      throw new Error(`Ntfy returned ${response.status}: ${await response.text()}`);
    }
  }
}