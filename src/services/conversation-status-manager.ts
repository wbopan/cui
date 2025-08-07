import { EventEmitter } from 'events';
import { createLogger, type Logger } from './logger.js';
import { ConversationSummary, ConversationMessage, ConversationDetailsResponse } from '@/types/index.js';

/**
 * Context data stored for active conversations that have not yet been written to local directories
 */
export interface ConversationStatusContext {
  initialPrompt: string;
  workingDirectory: string;
  model: string;
  timestamp: string;
  inheritedMessages?: ConversationMessage[]; // Messages from previous session when resuming
}

/**
 * Unified service for managing conversation status and tracking active session status.
 * This service combines the functionality of ConversationStatusTracker and optimistic conversation handling.
 * 
 * Responsibilities:
 * - Track active streaming sessions and their Claude session IDs
 * - Store conversation status contexts for active sessions
 * - Generate optimistic conversation summaries and details for UI feedback
 * - Emit events for session lifecycle (started/ended)
 */
export class ConversationStatusManager extends EventEmitter {
  // Maps Claude session ID -> CUI streaming ID
  private sessionToStreaming: Map<string, string> = new Map();
  // Maps CUI streaming ID -> Claude session ID (reverse lookup)
  private streamingToSession: Map<string, string> = new Map();
  // Maps Claude session ID -> conversation context for active sessions
  private sessionContext: Map<string, ConversationStatusContext> = new Map();
  private logger: Logger;

  constructor() {
    super();
    this.logger = createLogger('ConversationStatusManager');
  }

  /**
   * Register a new active streaming session with optional conversation context
   * This is called when we extract the session_id from the first stream message
   */
  registerActiveSession(streamingId: string, claudeSessionId: string, conversationContext?: { initialPrompt: string; workingDirectory: string; model?: string; inheritedMessages?: ConversationMessage[] }): void {
    this.logger.debug('Registering active session', { 
      streamingId, 
      claudeSessionId,
      hasConversationContext: !!conversationContext
    });

    // Remove any existing mapping for this Claude session
    const existingStreamingId = this.sessionToStreaming.get(claudeSessionId);
    if (existingStreamingId && existingStreamingId !== streamingId) {
      this.logger.debug('Removing existing mapping for Claude session', { 
        claudeSessionId, 
        oldStreamingId: existingStreamingId,
        newStreamingId: streamingId
      });
      this.streamingToSession.delete(existingStreamingId);
    }

    // Remove any existing mapping for this streaming ID
    const existingClaudeSessionId = this.streamingToSession.get(streamingId);
    if (existingClaudeSessionId && existingClaudeSessionId !== claudeSessionId) {
      this.logger.debug('Removing existing mapping for streaming ID', { 
        streamingId, 
        oldClaudeSessionId: existingClaudeSessionId,
        newClaudeSessionId: claudeSessionId
      });
      this.sessionToStreaming.delete(existingClaudeSessionId);
      this.sessionContext.delete(existingClaudeSessionId);
    }

    // Set the new mapping
    this.sessionToStreaming.set(claudeSessionId, streamingId);
    this.streamingToSession.set(streamingId, claudeSessionId);

    // If conversation context is provided, store it immediately
    if (conversationContext) {
      const context: ConversationStatusContext = {
        initialPrompt: conversationContext.initialPrompt,
        workingDirectory: conversationContext.workingDirectory,
        model: conversationContext.model || 'default',
        timestamp: new Date().toISOString(),
        inheritedMessages: conversationContext.inheritedMessages
      };
      this.sessionContext.set(claudeSessionId, context);
      
      this.logger.debug('Stored conversation status context', {
        claudeSessionId,
        hasInitialPrompt: !!context.initialPrompt,
        workingDirectory: context.workingDirectory,
        model: context.model,
        inheritedMessageCount: context.inheritedMessages?.length || 0
      });
    }

    this.logger.debug('Active session registered', { 
      streamingId, 
      claudeSessionId,
      totalActiveSessions: this.sessionToStreaming.size,
      hasConversationContext: !!conversationContext
    });

    this.emit('session-started', { streamingId, claudeSessionId });
  }

  /**
   * Unregister an active streaming session when it ends
   */
  unregisterActiveSession(streamingId: string): void {
    const claudeSessionId = this.streamingToSession.get(streamingId);
    
    if (claudeSessionId) {
      this.logger.debug('Unregistering active session', { 
        streamingId, 
        claudeSessionId 
      });

      this.sessionToStreaming.delete(claudeSessionId);
      this.streamingToSession.delete(streamingId);
      this.sessionContext.delete(claudeSessionId);

      this.logger.info('Active session unregistered', { 
        streamingId, 
        claudeSessionId,
        totalActiveSessions: this.sessionToStreaming.size
      });

      this.emit('session-ended', { streamingId, claudeSessionId });
    } else {
      this.logger.debug('Attempted to unregister unknown streaming session', { streamingId });
    }
  }

  /**
   * Get conversation context for an active session
   */
  getConversationContext(claudeSessionId: string): ConversationStatusContext | undefined {
    const context = this.sessionContext.get(claudeSessionId);
    this.logger.debug('Getting conversation context', {
      claudeSessionId,
      hasContext: !!context
    });
    return context;
  }

  /**
   * Check if a Claude session ID is currently active (has ongoing stream)
   */
  isSessionActive(claudeSessionId: string): boolean {
    const isActive = this.sessionToStreaming.has(claudeSessionId);
    return isActive;
  }

  /**
   * Get the streaming ID for an active Claude session
   */
  getStreamingId(claudeSessionId: string): string | undefined {
    const streamingId = this.sessionToStreaming.get(claudeSessionId);
    this.logger.debug('Getting streaming ID for Claude session', { 
      claudeSessionId, 
      streamingId: streamingId || 'not found' 
    });
    return streamingId;
  }

  /**
   * Get the Claude session ID for an active streaming session
   */
  getSessionId(streamingId: string): string | undefined {
    const claudeSessionId = this.streamingToSession.get(streamingId);
    this.logger.debug('Getting Claude session ID for streaming ID', { 
      streamingId, 
      claudeSessionId: claudeSessionId || 'not found' 
    });
    return claudeSessionId;
  }

  /**
   * Get all active Claude session IDs
   */
  getActiveSessionIds(): string[] {
    const sessions = Array.from(this.sessionToStreaming.keys());
    this.logger.debug('Getting all active session IDs', { 
      count: sessions.length,
      sessions 
    });
    return sessions;
  }

  /**
   * Get all active streaming IDs
   */
  getActiveStreamingIds(): string[] {
    const streamingIds = Array.from(this.streamingToSession.keys());
    this.logger.debug('Getting all active streaming IDs', { 
      count: streamingIds.length,
      streamingIds 
    });
    return streamingIds;
  }

  /**
   * Get conversation status for a Claude session ID
   */
  getConversationStatus(claudeSessionId: string): 'completed' | 'ongoing' | 'pending' {
    const isActive = this.isSessionActive(claudeSessionId);
    const status = isActive ? 'ongoing' : 'completed';
    return status;
  }

  /**
   * Get conversations that haven't appeared in history yet
   * Used by the conversation list endpoint
   */
  getConversationsNotInHistory(existingSessionIds: Set<string>): ConversationSummary[] {
    const activeSessionIds = this.getActiveSessionIds();
    
    const conversationsNotInHistory = activeSessionIds
      .filter(sessionId => !existingSessionIds.has(sessionId))
      .map(sessionId => {
        const context = this.getConversationContext(sessionId);
        const streamingId = this.getStreamingId(sessionId);
        
        if (context && streamingId) {
          // Create conversation entry for active session
          const conversationSummary: ConversationSummary = {
            sessionId,
            projectPath: context.workingDirectory,
            summary: '', // No summary for active conversation
            sessionInfo: {
              custom_name: '', // No custom name yet
              created_at: context.timestamp,
              updated_at: context.timestamp,
              version: 4,
              pinned: false,
              archived: false,
              continuation_session_id: '',
              initial_commit_head: '',
              permission_mode: 'default'
            },
            createdAt: context.timestamp,
            updatedAt: context.timestamp,
            messageCount: 1, // At least the initial user message
            totalDuration: 0, // No duration yet
            model: context.model || 'unknown',
            status: 'ongoing' as const,
            streamingId
          };
          
          this.logger.debug('Created conversation summary for active session', {
            sessionId,
            streamingId,
            workingDirectory: context.workingDirectory,
            model: context.model
          });
          
          return conversationSummary;
        }
        
        return null;
      })
      .filter((conversation): conversation is ConversationSummary => conversation !== null);

    this.logger.debug('Generated conversations not in history', {
      activeSessionCount: activeSessionIds.length,
      existingSessionCount: existingSessionIds.size,
      conversationsNotInHistoryCount: conversationsNotInHistory.length
    });

    return conversationsNotInHistory;
  }

  /**
   * Get conversation details if session is active but not in history
   * Used by the conversation details endpoint
   */
  getActiveConversationDetails(sessionId: string): ConversationDetailsResponse | null {
    const isActive = this.isSessionActive(sessionId);
    const context = this.getConversationContext(sessionId);
    
    this.logger.debug('Checking for active conversation details', {
      sessionId,
      isActive,
      hasContext: !!context
    });
    
    if (!isActive || !context) {
      return null;
    }

    // Create messages array
    const messages: ConversationMessage[] = [];
    
    // Add inherited messages first (if any)
    if (context.inheritedMessages) {
      messages.push(...context.inheritedMessages);
    }
    
    // Add the current initial prompt message
    const activeMessage: ConversationMessage = {
      uuid: `active-${sessionId}-user`,
      type: 'user',
      message: {
        role: 'user',
        content: context.initialPrompt
      },
      timestamp: context.timestamp,
      sessionId: sessionId,
      cwd: context.workingDirectory
    };
    messages.push(activeMessage);
    
    const response: ConversationDetailsResponse = {
      messages,
      summary: '', // No summary for active conversation
      projectPath: context.workingDirectory,
      metadata: {
        totalDuration: 0,
        model: context.model || 'unknown'
      }
    };
    
    this.logger.debug('Created active conversation details', {
      sessionId,
      workingDirectory: context.workingDirectory,
      model: context.model,
      totalMessageCount: messages.length,
      inheritedMessageCount: context.inheritedMessages?.length || 0
    });
    
    return response;
  }

  /**
   * Clear all mappings (useful for testing)
   */
  clear(): void {
    this.logger.debug('Clearing all session mappings');
    this.sessionToStreaming.clear();
    this.streamingToSession.clear();
    this.sessionContext.clear();
  }

  /**
   * Get statistics about tracked sessions
   */
  getStats(): {
    activeSessionsCount: number;
    activeStreamingIdsCount: number;
    activeContextsCount: number;
    activeSessions: Array<{ claudeSessionId: string; streamingId: string }>;
  } {
    const activeSessions = Array.from(this.sessionToStreaming.entries()).map(
      ([claudeSessionId, streamingId]) => ({ claudeSessionId, streamingId })
    );

    return {
      activeSessionsCount: this.sessionToStreaming.size,
      activeStreamingIdsCount: this.streamingToSession.size,
      activeContextsCount: this.sessionContext.size,
      activeSessions
    };
  }
}