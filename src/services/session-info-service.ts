import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SessionInfo, SessionInfoDatabase } from '@/types/index.js';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';
import { JsonFileManager } from './json-file-manager.js';

/**
 * SessionInfoService manages session information using custom JSON file manager
 * Stores session metadata including custom names in ~/.cui/session-info.json
 * Provides fast lookups and updates for session-specific data with race condition protection
 */
export class SessionInfoService {
  private static instance: SessionInfoService;
  private jsonManager!: JsonFileManager<SessionInfoDatabase>;
  private logger: Logger;
  private dbPath!: string;
  private configDir!: string;
  private isInitialized = false;

  constructor(customConfigDir?: string) {
    this.logger = createLogger('SessionInfoService');
    this.initializePaths(customConfigDir);
  }

  static getInstance(): SessionInfoService {
    if (!SessionInfoService.instance) {
      SessionInfoService.instance = new SessionInfoService();
    }
    return SessionInfoService.instance;
  }

  static resetInstance(): void {
    if (SessionInfoService.instance) {
      SessionInfoService.instance.isInitialized = false;
    }
    SessionInfoService.instance = null as unknown as SessionInfoService;
  }

  /**
   * Initialize file paths and JsonFileManager
   * Separated to allow re-initialization during testing
   */
  private initializePaths(customConfigDir?: string): void {
    if (customConfigDir) {
      this.configDir = path.join(customConfigDir, '.cui');
    } else {
      this.configDir = path.join(os.homedir(), '.cui');
    }
    this.dbPath = path.join(this.configDir, 'session-info.json');
    
    this.logger.debug('Initializing paths', { 
      homedir: os.homedir(), 
      configDir: this.configDir, 
      dbPath: this.dbPath 
    });
    
    // Create default database structure
    const defaultData: SessionInfoDatabase = {
      sessions: {},
      metadata: {
        schema_version: 3,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }
    };
    
    this.jsonManager = new JsonFileManager<SessionInfoDatabase>(this.dbPath, defaultData);
  }

  /**
   * Initialize the database
   * Creates database file if it doesn't exist
   * Throws error if initialization fails
   */
  async initialize(): Promise<void> {
    // Prevent multiple initializations
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.debug('Created config directory', { dir: this.configDir });
      }

      // Read existing data or initialize with defaults
      await this.jsonManager.read();

      // Ensure metadata exists and update schema if needed
      await this.ensureMetadata();

      this.isInitialized = true;

    } catch (error) {
      this.logger.error('Failed to initialize session info database', error);
      throw new Error(`Session info database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get session information for a given session ID
   * Creates entry with default values if session doesn't exist
   */
  async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    // this.logger.debug('Getting session info', { sessionId });

    try {
      const data = await this.jsonManager.read();
      
      const sessionInfo = data.sessions[sessionId];
      
      if (sessionInfo) {
        // this.logger.debug('Found existing session info', { sessionId, sessionInfo });
        return sessionInfo;
      }

      // Create default session info for new session
      const defaultSessionInfo: SessionInfo = {
        custom_name: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 3,
        pinned: false,
        archived: false,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      };

      // Create entry in database for the new session
      try {
        const createdSessionInfo = await this.updateSessionInfo(sessionId, defaultSessionInfo);
        return createdSessionInfo;
      } catch (createError) {
        // If creation fails, still return defaults to maintain backward compatibility
        this.logger.warn('Failed to create session info entry, returning defaults', { sessionId, error: createError });
        return defaultSessionInfo;
      }
    } catch (error) {
      this.logger.error('Failed to get session info', { sessionId, error });
      // Return default on error to maintain graceful degradation
      return {
        custom_name: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 3,
        pinned: false,
        archived: false,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      };
    }
  }

  /**
   * Update session information
   * Creates session entry if it doesn't exist
   * Supports partial updates - only provided fields will be updated
   */
  async updateSessionInfo(sessionId: string, updates: Partial<SessionInfo>): Promise<SessionInfo> {

    try {
      let updatedSession: SessionInfo | null = null;
      
      await this.jsonManager.update((data) => {
        const now = new Date().toISOString();
        const existingSession = data.sessions[sessionId];

        if (existingSession) {
          // Update existing session - preserve fields not being updated
          updatedSession = {
            ...existingSession,
            ...updates,
            updated_at: now
          };
          data.sessions[sessionId] = updatedSession;
        } else {
          // Create new session entry with defaults
          updatedSession = {
            custom_name: '',
            created_at: now,
            updated_at: now,
            version: 3,
            pinned: false,
            archived: false,
            continuation_session_id: '',
            initial_commit_head: '',
            permission_mode: 'default',
            ...updates  // Apply any provided updates
          };
          data.sessions[sessionId] = updatedSession;
        }

        // Update metadata
        data.metadata.last_updated = now;

        return data;
      });

      return updatedSession!;
    } catch (error) {
      this.logger.error('Failed to update session info', { sessionId, updates, error });
      throw new Error(`Failed to update session info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update custom name for a session (backward compatibility)
   * @deprecated Use updateSessionInfo instead
   */
  async updateCustomName(sessionId: string, customName: string): Promise<void> {
    await this.updateSessionInfo(sessionId, { custom_name: customName });
  }

  /**
   * Delete session information
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.logger.info('Deleting session info', { sessionId });

    try {
      await this.jsonManager.update((data) => {
        if (data.sessions[sessionId]) {
          delete data.sessions[sessionId];
          data.metadata.last_updated = new Date().toISOString();
          this.logger.info('Session info deleted successfully', { sessionId });
        } else {
          this.logger.debug('Session info not found for deletion', { sessionId });
        }
        return data;
      });
    } catch (error) {
      this.logger.error('Failed to delete session info', { sessionId, error });
      throw new Error(`Failed to delete session info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all session information
   * Returns mapping of sessionId -> SessionInfo
   */
  async getAllSessionInfo(): Promise<Record<string, SessionInfo>> {
    this.logger.debug('Getting all session info');

    try {
      const data = await this.jsonManager.read();
      return { ...data.sessions };
    } catch (error) {
      this.logger.error('Failed to get all session info', error);
      return {};
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{ sessionCount: number; dbSize: number; lastUpdated: string }> {
    try {
      const data = await this.jsonManager.read();
      
      let dbSize = 0;
      try {
        const stats = fs.statSync(this.dbPath);
        dbSize = stats.size;
      } catch (_statError) {
        // File might not exist yet
        dbSize = 0;
      }
      
      return {
        sessionCount: Object.keys(data.sessions).length,
        dbSize,
        lastUpdated: data.metadata.last_updated
      };
    } catch (error) {
      this.logger.error('Failed to get database stats', error);
      return {
        sessionCount: 0,
        dbSize: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Ensure metadata exists and is current
   */
  private async ensureMetadata(): Promise<void> {
    try {
      await this.jsonManager.update((data) => {
        if (!data.metadata) {
          data.metadata = {
            schema_version: 1,
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString()
          };
          this.logger.info('Created missing metadata');
        }

        // Schema migration logic
        if (data.metadata.schema_version < 2) {
          // Migrate to version 2 - add new fields to existing sessions
          Object.keys(data.sessions).forEach(sessionId => {
            const session = data.sessions[sessionId];
            data.sessions[sessionId] = {
              ...session,
              pinned: session.pinned ?? false,
              archived: session.archived ?? false,
              continuation_session_id: session.continuation_session_id ?? '',
              initial_commit_head: session.initial_commit_head ?? '',
              version: 2
            };
          });
          
          data.metadata.schema_version = 2;
          data.metadata.last_updated = new Date().toISOString();
          this.logger.info('Migrated database to schema version 2');
        }

        if (data.metadata.schema_version < 3) {
          // Migrate to version 3 - add permission_mode field to existing sessions
          Object.keys(data.sessions).forEach(sessionId => {
            const session = data.sessions[sessionId];
            data.sessions[sessionId] = {
              ...session,
              permission_mode: session.permission_mode ?? 'default',
              version: 3
            };
          });

          data.metadata.schema_version = 3;
          data.metadata.last_updated = new Date().toISOString();
          this.logger.info('Migrated database to schema version 3');
        }


        return data;
      });
    } catch (error) {
      this.logger.error('Failed to ensure metadata', error);
      throw error;
    }
  }

  /**
   * Re-initialize paths and JsonFileManager (for testing)
   * Call this after mocking os.homedir() to use test paths
   */
  reinitializePaths(customConfigDir?: string): void {
    this.initializePaths(customConfigDir);
  }

  /**
   * Get current database path (for testing)
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Get current config directory path (for testing)
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Archive all sessions that aren't already archived
   * Returns the number of sessions that were archived
   */
  async archiveAllSessions(): Promise<number> {
    this.logger.info('Archiving all sessions');

    try {
      let archivedCount = 0;
      
      await this.jsonManager.update((data) => {
        const now = new Date().toISOString();
        
        Object.keys(data.sessions).forEach(sessionId => {
          const session = data.sessions[sessionId];
          if (!session.archived) {
            data.sessions[sessionId] = {
              ...session,
              archived: true,
              updated_at: now
            };
            archivedCount++;
          }
        });

        if (archivedCount > 0) {
          data.metadata.last_updated = now;
        }

        return data;
      });

      this.logger.info('Sessions archived successfully', { archivedCount });
      return archivedCount;
    } catch (error) {
      this.logger.error('Failed to archive all sessions', error);
      throw new Error(`Failed to archive all sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}