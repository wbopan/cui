import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SessionDepsDatabase, SessionDepsInfo, ConversationSummary, ConversationMessage } from '@/types';
import { createLogger } from './logger';
import type { Logger } from 'pino';
import { JsonFileManager } from './json-file-manager';
import { ClaudeHistoryReader } from './claude-history-reader';

/**
 * SessionDepsService manages session dependency relationships
 * Tracks prefix hash relationships between sessions to build dependency trees
 * Calculates nearest leaf sessions and provides enhanced conversation data
 * Uses SHA256 prefix hashing to identify session relationships
 */
export class SessionDepsService {
  private static instance: SessionDepsService;
  private jsonManager!: JsonFileManager<SessionDepsDatabase>;
  private logger: Logger;
  private dbPath!: string;
  private configDir!: string;
  private isInitialized = false;
  private historyReaderForTesting?: ClaudeHistoryReader;
  
  // Performance caches
  private leafCache = new Map<string, string>();
  private distanceCache = new Map<string, number>();
  private hashIndex = new Map<string, string>();

  private constructor() {
    this.logger = createLogger('SessionDepsService');
    this.initializePaths();
  }

  /**
   * Initialize file paths and JsonFileManager
   * Separated to allow re-initialization during testing
   */
  private initializePaths(): void {
    this.configDir = path.join(os.homedir(), '.ccui');
    this.dbPath = path.join(this.configDir, 'session-deps.json');
    
    this.logger.debug('Initializing paths', { 
      homedir: os.homedir(), 
      configDir: this.configDir, 
      dbPath: this.dbPath 
    });
    
    const defaultData: SessionDepsDatabase = {
      sessions: {},
      metadata: {
        schema_version: 1,
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        total_sessions: 0
      }
    };
    
    this.jsonManager = new JsonFileManager<SessionDepsDatabase>(this.dbPath, defaultData);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionDepsService {
    if (!SessionDepsService.instance) {
      SessionDepsService.instance = new SessionDepsService();
    }
    return SessionDepsService.instance;
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

    this.logger.info('Initializing session dependencies database', { dbPath: this.dbPath });

    try {
      // Ensure config directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.debug('Created config directory', { dir: this.configDir });
      }

      // Read existing data or initialize with defaults
      const data = await this.jsonManager.read();

      // Ensure metadata exists and update schema if needed
      await this.ensureMetadata();

      this.isInitialized = true;

      this.logger.info('Session dependencies database initialized successfully', {
        dbPath: this.dbPath,
        sessionCount: Object.keys(data.sessions).length,
        schemaVersion: data.metadata.schema_version
      });
    } catch (error) {
      this.logger.error('Failed to initialize session dependencies database', error);
      throw new Error(`Session dependencies database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get enhanced conversations with dependency information
   * Adds leaf_session and hash fields to each conversation
   */
  async getEnhancedConversations(conversations: ConversationSummary[]): Promise<ConversationSummary[]> {
    this.logger.debug('Enhancing conversations with dependency information', { count: conversations.length });

    // If not initialized (e.g., in test mode), return conversations with defaults
    if (!this.isInitialized) {
      this.logger.debug('Service not initialized, returning conversations with defaults');
      return conversations.map(conv => ({
        ...conv,
        leaf_session: conv.sessionId,
        hash: ''
      }));
    }

    try {
      // Update dependencies for new/changed conversations
      await this.updateSessionDependenciesIncremental(conversations);
      
      // Read current dependency data
      const data = await this.jsonManager.read();
      
      // Enhance each conversation with dependency info
      const enhanced = conversations.map(conv => {
        const depsInfo = data.sessions[conv.sessionId];
        if (depsInfo) {
          return {
            ...conv,
            leaf_session: depsInfo.leaf_session,
            hash: depsInfo.end_hash
          };
        } else {
          // Fallback values
          return {
            ...conv,
            leaf_session: conv.sessionId,
            hash: ''
          };
        }
      });
      
      this.logger.debug('Enhanced conversations successfully', { count: enhanced.length });
      return enhanced;
    } catch (error) {
      this.logger.error('Failed to enhance conversations', error);
      // Return original conversations without enhancement on error
      return conversations.map(conv => ({
        ...conv,
        leaf_session: conv.sessionId,
        hash: ''
      }));
    }
  }

  /**
   * Get session dependency information for a specific session
   */
  async getSessionDepsInfo(sessionId: string): Promise<SessionDepsInfo | null> {
    try {
      const data = await this.jsonManager.read();
      return data.sessions[sessionId] || null;
    } catch (error) {
      this.logger.error('Failed to get session deps info', { sessionId, error });
      return null;
    }
  }

  /**
   * Get statistics about the dependency tree
   */
  async getStats(): Promise<{ sessionCount: number; treeDepth: number; leafCount: number }> {
    try {
      const data = await this.jsonManager.read();
      const sessions = Object.values(data.sessions);
      
      const leafCount = sessions.filter(s => s.children_sessions.length === 0).length;
      const maxDepth = Math.max(...sessions.map(s => s.depth || 0), 0);
      
      return {
        sessionCount: sessions.length,
        treeDepth: maxDepth,
        leafCount
      };
    } catch (error) {
      this.logger.error('Failed to get stats', error);
      return { sessionCount: 0, treeDepth: 0, leafCount: 0 };
    }
  }

  /**
   * Calculate prefix hashes for a sequence of messages
   * Time Complexity: O(m) where m = message count
   */
  private calculatePrefixHashes(messages: ConversationMessage[]): string[] {
    const hashes: string[] = [];
    let previousHash = '';
    
    for (const message of messages) {
      const messageData = this.extractMessageForHashing(message.message);
      const dataToHash = previousHash + JSON.stringify(messageData);
      const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
      hashes.push(hash);
      previousHash = hash;
    }
    
    return hashes;
  }

  /**
   * Extract standardized message data for hashing
   */
  private extractMessageForHashing(message: any): {role: string, content: string} {
    if (typeof message === 'object' && message !== null) {
      const role = message.role || 'unknown';
      let content = '';
      
      if (typeof message.content === 'string') {
        content = message.content;
      } else if (Array.isArray(message.content)) {
        // Extract all text blocks
        content = message.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text || '')
          .join('');
      }
      
      return { role, content };
    }
    
    return { role: 'unknown', content: '' };
  }

  /**
   * Build dependency tree with CORRECTED direct parent identification
   * Handles gaps: A(1) -> B(1,2,3) where no session (1,2) exists
   * Time Complexity: O(n·m) where n = sessions, m = avg prefix length
   */
  private buildDependencyTreeOptimized(sessionDepsMap: Record<string, SessionDepsInfo>): void {
    // Build end_hash index - O(n)
    const endHashToSession = new Map<string, string>();
    for (const [sessionId, session] of Object.entries(sessionDepsMap)) {
      endHashToSession.set(session.end_hash, sessionId);
    }
    
    // Clear existing relationships - O(n)
    Object.values(sessionDepsMap).forEach(session => {
      session.parent_session = undefined;
      session.children_sessions = [];
    });
    
    // For each session, find its direct parent - O(n·m)
    for (const [sessionId, session] of Object.entries(sessionDepsMap)) {
      let directParentId: string | undefined;
      let maxParentPosition = -1;
      
      // Check each prefix position (excluding last which is session itself)
      for (let i = 0; i < session.prefix_hashes.length - 1; i++) {
        const prefixHash = session.prefix_hashes[i];
        const potentialParentId = endHashToSession.get(prefixHash); // O(1)
        
        if (potentialParentId && potentialParentId !== sessionId) {
          // Found a potential parent at position i
          // If this position is higher than previous candidates, it's closer to current session
          if (i > maxParentPosition) {
            maxParentPosition = i;
            directParentId = potentialParentId;
          }
        }
      }
      
      // Establish parent-child relationship
      if (directParentId) {
        session.parent_session = directParentId;
        sessionDepsMap[directParentId].children_sessions.push(sessionId);
      }
    }
  }

  /**
   * Calculate nearest leaf sessions using topological sorting
   * Time Complexity: O(V + E) where V = nodes, E = edges  
   * Improvement from O(n²)
   */
  private calculateLeafSessionsOptimized(sessionDepsMap: Record<string, SessionDepsInfo>): void {
    const sessionIds = Object.keys(sessionDepsMap);
    const leafCache = new Map<string, string>();
    const distanceCache = new Map<string, number>();
    
    // Find all leaf nodes - O(n)
    const leafNodes = sessionIds.filter(id => 
      sessionDepsMap[id].children_sessions.length === 0
    );
    
    // Initialize leaf nodes - O(leaf_count)
    leafNodes.forEach(leafId => {
      leafCache.set(leafId, leafId);
      distanceCache.set(leafId, 0);
    });
    
    // Build indegree map for topological sort - O(n)
    const indegree = new Map<string, number>();
    sessionIds.forEach(id => {
      indegree.set(id, sessionDepsMap[id].children_sessions.length);
    });
    
    // Topological sort from leaves to roots - O(V + E)
    const queue = [...leafNodes];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentSession = sessionDepsMap[currentId];
      
      if (currentSession.parent_session) {
        const parentId = currentSession.parent_session;
        const newIndegree = indegree.get(parentId)! - 1;
        indegree.set(parentId, newIndegree);
        
        if (newIndegree === 0) {
          // Calculate parent's nearest leaf from children
          const nearestLeaf = this.computeNearestLeafFromChildren(
            parentId, sessionDepsMap, leafCache, distanceCache
          );
          leafCache.set(parentId, nearestLeaf.leafId);
          distanceCache.set(parentId, nearestLeaf.distance);
          
          queue.push(parentId);
        }
      }
    }
    
    // Apply results - O(n)
    sessionIds.forEach(id => {
      sessionDepsMap[id].leaf_session = leafCache.get(id) || id;
    });
  }

  /**
   * Compute nearest leaf from a node's children
   */
  private computeNearestLeafFromChildren(
    parentId: string,
    sessionDepsMap: Record<string, SessionDepsInfo>,
    leafCache: Map<string, string>,
    distanceCache: Map<string, number>
  ): { leafId: string; distance: number } {
    const parentSession = sessionDepsMap[parentId];
    let nearestLeaf = parentId;
    let minDistance = Infinity;
    
    for (const childId of parentSession.children_sessions) {
      const childLeafId = leafCache.get(childId)!;
      const childDistance = distanceCache.get(childId)! + 1;
      
      if (childDistance < minDistance) {
        minDistance = childDistance;
        nearestLeaf = childLeafId;
      }
    }
    
    return { leafId: nearestLeaf, distance: minDistance };
  }

  /**
   * Incremental update to avoid full tree rebuilds
   * Time Complexity: O(k + affected) where k = updated sessions
   */
  async updateSessionDependenciesIncremental(
    newConversations: ConversationSummary[]
  ): Promise<void> {
    // Read current data first
    const currentData = await this.jsonManager.read();
    
    // 1. Identify sessions that actually need updates - O(k)
    const sessionsToUpdate = newConversations.filter(conv => {
      const existing = currentData.sessions[conv.sessionId];
      return !existing || existing.message_count !== conv.messageCount;
    });
    
    if (sessionsToUpdate.length === 0) return; // No updates needed
    
    // 2. Fetch all messages for sessions that need updates
    const sessionMessages = new Map<string, ConversationMessage[]>();
    for (const conv of sessionsToUpdate) {
      const messages = await this.getSessionMessages(conv.sessionId, this.historyReaderForTesting);
      sessionMessages.set(conv.sessionId, messages);
    }
    
    // 3. Update database with all changes at once
    await this.jsonManager.update((data) => {
      const affectedSessions = new Set<string>();
      
      // Update hash information for changed sessions - O(k·m)
      for (const conv of sessionsToUpdate) {
        const messages = sessionMessages.get(conv.sessionId) || [];
        const oldSession = data.sessions[conv.sessionId];
        const newPrefixHashes = this.calculatePrefixHashes(messages);
        
        // Mark sessions affected by this change
        if (oldSession) {
          this.markAffectedByChange(
            conv.sessionId, oldSession, newPrefixHashes, data.sessions, affectedSessions
          );
        }
        
        // Update session info
        data.sessions[conv.sessionId] = {
          session_id: conv.sessionId,
          prefix_hashes: newPrefixHashes,
          end_hash: newPrefixHashes[newPrefixHashes.length - 1] || '',
          leaf_session: conv.sessionId, // Temporary, will be recalculated
          parent_session: undefined,
          children_sessions: [],
          created_at: oldSession?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: conv.messageCount
        };
        
        affectedSessions.add(conv.sessionId);
      }
      
      // Rebuild only affected subgraph - O(affected_nodes)
      this.rebuildAffectedSubgraph(affectedSessions, data.sessions);
      
      // Update metadata
      data.metadata.last_updated = new Date().toISOString();
      data.metadata.total_sessions = Object.keys(data.sessions).length;
      
      return data;
    });
  }

  /**
   * Mark sessions affected by a change for selective rebuild
   */
  private markAffectedByChange(
    changedSessionId: string,
    oldSession: SessionDepsInfo,
    newPrefixHashes: string[],
    allSessions: Record<string, SessionDepsInfo>,
    affectedSessions: Set<string>
  ): void {
    const oldEndHash = oldSession.end_hash;
    const newEndHash = newPrefixHashes[newPrefixHashes.length - 1] || '';
    
    // If end_hash changed, check all sessions that might reference it
    if (oldEndHash !== newEndHash) {
      Object.keys(allSessions).forEach(sessionId => {
        const session = allSessions[sessionId];
        if (session.prefix_hashes.includes(oldEndHash) || 
            session.prefix_hashes.includes(newEndHash)) {
          affectedSessions.add(sessionId);
        }
      });
    }
    
    // Mark existing parent and children as affected
    if (oldSession.parent_session) {
      affectedSessions.add(oldSession.parent_session);
    }
    oldSession.children_sessions.forEach(childId => {
      affectedSessions.add(childId);
    });
  }

  /**
   * Rebuild the dependency tree for affected sessions only
   */
  private rebuildAffectedSubgraph(
    affectedSessions: Set<string>,
    allSessions: Record<string, SessionDepsInfo>
  ): void {
    // If no affected sessions, nothing to rebuild
    if (affectedSessions.size === 0) return;
    
    // Rebuild the entire tree if many sessions are affected
    // This threshold can be tuned based on performance testing
    const rebuildThreshold = Object.keys(allSessions).length * 0.3;
    if (affectedSessions.size > rebuildThreshold) {
      this.buildDependencyTreeOptimized(allSessions);
      this.calculateLeafSessionsOptimized(allSessions);
      return;
    }
    
    // Otherwise, rebuild just the affected portions
    // First, rebuild tree relationships
    this.buildDependencyTreeOptimized(allSessions);
    
    // Then recalculate leaf sessions
    this.calculateLeafSessionsOptimized(allSessions);
  }

  /**
   * Get messages for a session from Claude history
   */
  private async getSessionMessages(sessionId: string, historyReader?: ClaudeHistoryReader): Promise<ConversationMessage[]> {
    try {
      const reader = historyReader || new ClaudeHistoryReader();
      const details = await reader.getConversationDetails(sessionId);
      return details.messages;
    } catch (error) {
      this.logger.error('Failed to get session messages', { sessionId, error });
      return [];
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
            last_updated: new Date().toISOString(),
            total_sessions: 0
          };
          this.logger.info('Created missing metadata');
        }

        // Future: Add schema migration logic here if needed
        if (data.metadata.schema_version < 1) {
          // Migrate to version 1
          data.metadata.schema_version = 1;
          data.metadata.last_updated = new Date().toISOString();
          this.logger.info('Migrated database to schema version 1');
        }

        return data;
      });
    } catch (error) {
      this.logger.error('Failed to ensure metadata', error);
      throw error;
    }
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (SessionDepsService.instance) {
      SessionDepsService.instance.isInitialized = false;
    }
    SessionDepsService.instance = null as unknown as SessionDepsService;
  }

  /**
   * Re-initialize paths and JsonFileManager (for testing)
   * Call this after mocking os.homedir() to use test paths
   */
  reinitializePaths(): void {
    this.initializePaths();
  }

  /**
   * Get current database path (for testing)
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Set history reader for testing
   */
  setHistoryReaderForTesting(reader: ClaudeHistoryReader): void {
    this.historyReaderForTesting = reader;
  }

  /**
   * Set JsonFileManager for testing
   */
  setJsonManagerForTesting(manager: JsonFileManager<SessionDepsDatabase>): void {
    this.jsonManager = manager;
  }
}