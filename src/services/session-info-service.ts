import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import type { SessionInfo } from '@/types/index.js';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';

type SessionRow = {
  custom_name: string;
  created_at: string;
  updated_at: string;
  version: number;
  pinned: number | boolean;
  archived: number | boolean;
  continuation_session_id: string;
  initial_commit_head: string;
  permission_mode: string;
};

/**
 * SessionInfoService manages session information using SQLite backend
 * Stores session metadata including custom names in ~/.cui/session-info.db
 * Provides fast lookups and updates for session-specific data
 */
export class SessionInfoService {
  private static instance: SessionInfoService;
  private logger: Logger;
  private dbPath!: string;
  private configDir!: string;
  private isInitialized = false;
  private db!: Database.Database;

  private getSessionStmt!: Database.Statement;
  private insertSessionStmt!: Database.Statement;
  private updateSessionStmt!: Database.Statement;
  private deleteSessionStmt!: Database.Statement;
  private getAllStmt!: Database.Statement;
  private countStmt!: Database.Statement;
  private archiveAllStmt!: Database.Statement;
  private setMetadataStmt!: Database.Statement;
  private getMetadataStmt!: Database.Statement;

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

  private initializePaths(customConfigDir?: string): void {
    if (customConfigDir) {
      if (customConfigDir === ':memory:') {
        this.configDir = ':memory:';
        this.dbPath = ':memory:';
        return;
      }
      this.configDir = path.join(customConfigDir, '.cui');
    } else {
      this.configDir = path.join(os.homedir(), '.cui');
    }
    this.dbPath = path.join(this.configDir, 'session-info.db');

    this.logger.debug('Initializing paths', {
      homedir: os.homedir(),
      configDir: this.configDir,
      dbPath: this.dbPath
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (this.dbPath !== ':memory:' && !fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.debug('Created config directory', { dir: this.configDir });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          custom_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          version INTEGER NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          continuation_session_id TEXT NOT NULL DEFAULT '',
          initial_commit_head TEXT NOT NULL DEFAULT '',
          permission_mode TEXT NOT NULL DEFAULT 'default'
        );
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      this.prepareStatements();
      this.ensureMetadata();
      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize session info database', error);
      throw new Error(`Session info database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private prepareStatements(): void {
    this.getSessionStmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    this.insertSessionStmt = this.db.prepare(`
      INSERT INTO sessions (
        session_id,
        custom_name,
        created_at,
        updated_at,
        version,
        pinned,
        archived,
        continuation_session_id,
        initial_commit_head,
        permission_mode
      ) VALUES (
        @session_id,
        @custom_name,
        @created_at,
        @updated_at,
        @version,
        @pinned,
        @archived,
        @continuation_session_id,
        @initial_commit_head,
        @permission_mode
      )
    `);
    this.updateSessionStmt = this.db.prepare(`
      UPDATE sessions SET
        custom_name=@custom_name,
        updated_at=@updated_at,
        pinned=@pinned,
        archived=@archived,
        continuation_session_id=@continuation_session_id,
        initial_commit_head=@initial_commit_head,
        permission_mode=@permission_mode,
        version=@version
      WHERE session_id=@session_id
    `);
    this.deleteSessionStmt = this.db.prepare('DELETE FROM sessions WHERE session_id = ?');
    this.getAllStmt = this.db.prepare('SELECT * FROM sessions');
    this.countStmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
    this.archiveAllStmt = this.db.prepare('UPDATE sessions SET archived=1, updated_at=@updated_at WHERE archived=0');
    this.setMetadataStmt = this.db.prepare('INSERT INTO metadata (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    this.getMetadataStmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
  }

  private ensureMetadata(): void {
    const now = new Date().toISOString();
    const schema = this.getMetadataStmt.get('schema_version') as { value?: string } | undefined;
    if (!schema) {
      this.setMetadataStmt.run({ key: 'schema_version', value: '3' });
      this.setMetadataStmt.run({ key: 'created_at', value: now });
      this.setMetadataStmt.run({ key: 'last_updated', value: now });
    }
  }

  private mapRow(row: SessionRow): SessionInfo {
    return {
      custom_name: row.custom_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version,
      pinned: !!row.pinned,
      archived: !!row.archived,
      continuation_session_id: row.continuation_session_id,
      initial_commit_head: row.initial_commit_head,
      permission_mode: row.permission_mode
    };
  }

  async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    try {
      const row = this.getSessionStmt.get(sessionId) as SessionRow | undefined;
      if (row) {
        return this.mapRow(row);
      }

      const now = new Date().toISOString();
      const defaultSession: SessionInfo = {
        custom_name: '',
        created_at: now,
        updated_at: now,
        version: 3,
        pinned: false,
        archived: false,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      };
      this.insertSessionStmt.run({
        session_id: sessionId,
        custom_name: '',
        created_at: now,
        updated_at: now,
        version: 3,
        pinned: 0,
        archived: 0,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      });
      this.setMetadataStmt.run({ key: 'last_updated', value: now });
      return defaultSession;
    } catch (error) {
      this.logger.error('Failed to get session info', { sessionId, error });
      const now = new Date().toISOString();
      return {
        custom_name: '',
        created_at: now,
        updated_at: now,
        version: 3,
        pinned: false,
        archived: false,
        continuation_session_id: '',
        initial_commit_head: '',
        permission_mode: 'default'
      };
    }
  }

  async updateSessionInfo(sessionId: string, updates: Partial<SessionInfo>): Promise<SessionInfo> {
    try {
      const existingRow = this.getSessionStmt.get(sessionId) as SessionRow | undefined;
      const now = new Date().toISOString();
      if (existingRow) {
        const updatedSession: SessionInfo = {
          ...this.mapRow(existingRow),
          ...updates,
          updated_at: now
        };
        this.updateSessionStmt.run({
          session_id: sessionId,
          custom_name: updatedSession.custom_name,
          updated_at: updatedSession.updated_at,
          pinned: updatedSession.pinned ? 1 : 0,
          archived: updatedSession.archived ? 1 : 0,
          continuation_session_id: updatedSession.continuation_session_id,
          initial_commit_head: updatedSession.initial_commit_head,
          permission_mode: updatedSession.permission_mode,
          version: updatedSession.version
        });
        this.setMetadataStmt.run({ key: 'last_updated', value: now });
        return updatedSession;
      } else {
        const newSession: SessionInfo = {
          custom_name: '',
          created_at: now,
          updated_at: now,
          version: 3,
          pinned: false,
          archived: false,
          continuation_session_id: '',
          initial_commit_head: '',
          permission_mode: 'default',
          ...updates
        };
        this.insertSessionStmt.run({
          session_id: sessionId,
          custom_name: newSession.custom_name,
          created_at: newSession.created_at,
          updated_at: newSession.updated_at,
          version: newSession.version,
          pinned: newSession.pinned ? 1 : 0,
          archived: newSession.archived ? 1 : 0,
          continuation_session_id: newSession.continuation_session_id,
          initial_commit_head: newSession.initial_commit_head,
          permission_mode: newSession.permission_mode
        });
        this.setMetadataStmt.run({ key: 'last_updated', value: now });
        return newSession;
      }
    } catch (error) {
      this.logger.error('Failed to update session info', { sessionId, updates, error });
      throw new Error(`Failed to update session info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateCustomName(sessionId: string, customName: string): Promise<void> {
    await this.updateSessionInfo(sessionId, { custom_name: customName });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.logger.info('Deleting session info', { sessionId });
    try {
      const result = this.deleteSessionStmt.run(sessionId);
      if (result.changes > 0) {
        const now = new Date().toISOString();
        this.setMetadataStmt.run({ key: 'last_updated', value: now });
        this.logger.info('Session info deleted successfully', { sessionId });
      } else {
        this.logger.debug('Session info not found for deletion', { sessionId });
      }
    } catch (error) {
      this.logger.error('Failed to delete session info', { sessionId, error });
      throw new Error(`Failed to delete session info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAllSessionInfo(): Promise<Record<string, SessionInfo>> {
    this.logger.debug('Getting all session info');
    try {
      const rows = this.getAllStmt.all() as Array<SessionRow & { session_id: string }>;
      const result: Record<string, SessionInfo> = {};
      for (const row of rows) {
        result[row.session_id] = this.mapRow(row);
      }
      return result;
    } catch (error) {
      this.logger.error('Failed to get all session info', error);
      return {};
    }
  }

  async getStats(): Promise<{ sessionCount: number; dbSize: number; lastUpdated: string }> {
    try {
      const countRow = this.countStmt.get() as { count: number };
      let dbSize = 0;
      if (this.dbPath !== ':memory:') {
        try {
          const stats = fs.statSync(this.dbPath);
          dbSize = stats.size;
        } catch {
          dbSize = 0;
        }
      }
      const lastUpdatedRow = this.getMetadataStmt.get('last_updated') as { value?: string } | undefined;
      return {
        sessionCount: countRow.count,
        dbSize,
        lastUpdated: lastUpdatedRow?.value || new Date().toISOString()
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

  reinitializePaths(customConfigDir?: string): void {
    this.initializePaths(customConfigDir);
  }

  getDbPath(): string {
    return this.dbPath;
  }

  getConfigDir(): string {
    return this.configDir;
  }

  async archiveAllSessions(): Promise<number> {
    this.logger.info('Archiving all sessions');
    try {
      const now = new Date().toISOString();
      const transaction = this.db.transaction(() => {
        const info = this.archiveAllStmt.run({ updated_at: now });
        if (info.changes > 0) {
          this.setMetadataStmt.run({ key: 'last_updated', value: now });
        }
        return info.changes;
      });
      const archivedCount = transaction();
      this.logger.info('Sessions archived successfully', { archivedCount });
      return archivedCount;
    } catch (error) {
      this.logger.error('Failed to archive all sessions', error);
      throw new Error(`Failed to archive all sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncMissingSessions(sessionIds: string[]): Promise<number> {
    try {
      const now = new Date().toISOString();
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO sessions (
          session_id,
          custom_name,
          created_at,
          updated_at,
          version,
          pinned,
          archived,
          continuation_session_id,
          initial_commit_head,
          permission_mode
        ) VALUES (
          @session_id,
          '',
          @now,
          @now,
          3,
          0,
          0,
          '',
          '',
          'default'
        )
      `);
      const transaction = this.db.transaction((ids: string[]) => {
        let inserted = 0;
        for (const id of ids) {
          const info = insert.run({ session_id: id, now });
          if (info.changes > 0) inserted++;
        }
        if (inserted > 0) {
          this.setMetadataStmt.run({ key: 'last_updated', value: now });
        }
        return inserted;
      });
      return transaction(sessionIds);
    } catch (error) {
      this.logger.error('Failed to sync missing sessions', error);
      throw new Error(`Failed to sync missing sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

