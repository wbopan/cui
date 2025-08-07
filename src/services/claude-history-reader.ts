import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConversationSummary, ConversationMessage, ConversationListQuery, CUIError } from '@/types/index.js';
import { createLogger, type Logger } from './logger.js';
import { SessionInfoService } from './session-info-service.js';
import { ConversationCache, ConversationChain } from './conversation-cache.js';
import { ToolMetricsService } from './ToolMetricsService.js';
import { MessageFilter } from './message-filter.js';
import Anthropic from '@anthropic-ai/sdk';

// Import RawJsonEntry from ConversationCache to avoid duplication
type RawJsonEntry = {
  type: string;
  uuid?: string;
  sessionId?: string;
  parentUuid?: string;
  timestamp?: string;
  message?: Anthropic.Message | Anthropic.MessageParam;
  cwd?: string;
  durationMs?: number;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  summary?: string;
  leafUuid?: string;
};

/**
 * Reads conversation history from Claude's local storage
 */
export class ClaudeHistoryReader {
  private claudeHomePath: string;
  private logger: Logger;
  private sessionInfoService: SessionInfoService;
  private conversationCache: ConversationCache;
  private toolMetricsService: ToolMetricsService;
  private messageFilter: MessageFilter;
  
  constructor(sessionInfoService?: SessionInfoService) {
    this.claudeHomePath = path.join(os.homedir(), '.claude');
    this.logger = createLogger('ClaudeHistoryReader');
    this.sessionInfoService = sessionInfoService || new SessionInfoService();
    this.conversationCache = new ConversationCache();
    this.toolMetricsService = new ToolMetricsService();
    this.messageFilter = new MessageFilter();
  }

  get homePath(): string {
    return this.claudeHomePath;
  }

  /**
   * Clear the conversation cache to force a refresh on next read
   */
  clearCache(): void {
    this.conversationCache.clear();
  }

  /**
   * List all conversations with optional filtering
   */
  async listConversations(filter?: ConversationListQuery): Promise<{
    conversations: ConversationSummary[];
    total: number;
  }> {
    try {
      // Parse all conversations from all JSONL files
      const conversationChains = await this.parseAllConversations();
      
      // Convert to ConversationSummary format and enhance with custom names
      const allConversations: ConversationSummary[] = await Promise.all(
        conversationChains.map(async (chain) => {
          // Get full session info from SessionInfoService
          let sessionInfo;
          try {
            sessionInfo = await this.sessionInfoService.getSessionInfo(chain.sessionId);
          } catch (error) {
            this.logger.warn('Failed to get session info for conversation', { 
              sessionId: chain.sessionId, 
              error: error instanceof Error ? error.message : String(error) 
            });
            // Continue with default session info on error
            sessionInfo = {
              custom_name: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: 4,
              pinned: false,
              archived: false,
              continuation_session_id: '',
              initial_commit_head: '',
              permission_mode: 'default'
            };
          }

          // Calculate tool metrics for this conversation
          const toolMetrics = this.toolMetricsService.calculateMetricsFromMessages(chain.messages);
          
          return {
            sessionId: chain.sessionId,
            projectPath: chain.projectPath,
            summary: chain.summary,
            sessionInfo: sessionInfo,
            createdAt: chain.createdAt,
            updatedAt: chain.updatedAt,
            messageCount: chain.messages.length,
            totalDuration: chain.totalDuration,
            model: chain.model,
            status: 'completed' as const, // Default status, will be updated by server
            toolMetrics: toolMetrics
          };
        })
      );
      
      // Apply filters and pagination
      const filtered = this.applyFilters(allConversations, filter);
      const paginated = this.applyPagination(filtered, filter);
      
      return {
        conversations: paginated,
        total: filtered.length
      };
    } catch (error) {
      throw new CUIError('HISTORY_READ_FAILED', `Failed to read conversation history: ${error}`, 500);
    }
  }

  /**
   * Fetch full conversation details
   */
  async fetchConversation(sessionId: string): Promise<ConversationMessage[]> {
    try {
      const conversationChains = await this.parseAllConversations();
      const conversation = conversationChains.find(chain => chain.sessionId === sessionId);
      
      if (!conversation) {
        throw new CUIError('CONVERSATION_NOT_FOUND', `Conversation ${sessionId} not found`, 404);
      }
      
      // Apply message filter before returning
      return this.messageFilter.filterMessages(conversation.messages);
    } catch (error) {
      if (error instanceof CUIError) throw error;
      throw new CUIError('CONVERSATION_READ_FAILED', `Failed to read conversation: ${error}`, 500);
    }
  }

  /**
   * Get conversation metadata
   */
  async getConversationMetadata(sessionId: string): Promise<{
    summary: string;
    projectPath: string;
    model: string;
    totalDuration: number;
  } | null> {
    try {
      const conversationChains = await this.parseAllConversations();
      const conversation = conversationChains.find(chain => chain.sessionId === sessionId);
      
      if (!conversation) {
        return null;
      }

      return {
        summary: conversation.summary,
        projectPath: conversation.projectPath,
        model: conversation.model,
        totalDuration: conversation.totalDuration
      };
    } catch (error) {
      this.logger.error('Error getting metadata for conversation', error, { sessionId });
      return null;
    }
  }

  /**
   * Get the working directory for a specific conversation session
   */
  async getConversationWorkingDirectory(sessionId: string): Promise<string | null> {
    try {
      const conversationChains = await this.parseAllConversations();
      const conversation = conversationChains.find(chain => chain.sessionId === sessionId);
      
      if (!conversation) {
        this.logger.warn('Conversation not found when getting working directory', { sessionId });
        return null;
      }

      this.logger.debug('Found working directory for conversation', { 
        sessionId, 
        workingDirectory: conversation.projectPath 
      });
      
      return conversation.projectPath;
    } catch (error) {
      this.logger.error('Error getting working directory for conversation', error, { sessionId });
      return null;
    }
  }

  /**
   * Get file modification times for all JSONL files
   */
  private async getFileModificationTimes(): Promise<Map<string, number>> {
    const modTimes = new Map<string, number>();
    const projectsPath = path.join(this.claudeHomePath, 'projects');
    
    this.logger.debug('Getting file modification times', { projectsPath });
    
    try {
      const projects = await this.readDirectory(projectsPath);
      this.logger.debug('Found projects', { projectCount: projects.length });
      
      for (const project of projects) {
        const projectPath = path.join(projectsPath, project);
        const stats = await fs.stat(projectPath);
        
        if (!stats.isDirectory()) continue;
        
        const files = await this.readDirectory(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        
        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          try {
            const fileStats = await fs.stat(filePath);
            modTimes.set(filePath, fileStats.mtimeMs);
          } catch (error) {
            this.logger.warn('Failed to stat file', { filePath, error });
          }
        }
      }
      
      this.logger.debug('File modification times collection complete', {
        totalFiles: modTimes.size,
        projects: projects.length
      });
    } catch (error) {
      this.logger.error('Error getting file modification times', error);
    }
    
    return modTimes;
  }


  /**
   * Extract source project name from file path
   */
  private extractSourceProject(filePath: string): string {
    const projectsPath = path.join(this.claudeHomePath, 'projects');
    const relativePath = path.relative(projectsPath, filePath);
    const segments = relativePath.split(path.sep);
    return segments[0]; // First segment is the project directory name
  }

  /**
   * Process all entries into conversation chains (the cheap in-memory operations)
   */
  private processAllEntries(allEntries: (RawJsonEntry & { sourceProject: string })[]): ConversationChain[] {
    const startTime = Date.now();
    
    this.logger.debug('Processing all entries into conversations', {
      totalEntries: allEntries.length
    });
    
    // Group entries by sessionId
    const sessionGroups = this.groupEntriesBySession(allEntries);
    this.logger.debug('Entries grouped by session', {
      sessionCount: sessionGroups.size,
      totalEntries: allEntries.length
    });
    
    // Process summaries
    const summaries = this.processSummaries(allEntries);
    this.logger.debug('Summaries processed', {
      summaryCount: summaries.size
    });
    
    // Build conversation chains
    const conversationChains: ConversationChain[] = [];
    
    for (const [sessionId, entries] of sessionGroups) {
      const chain = this.buildConversationChain(sessionId, entries, summaries);
      if (chain) {
        conversationChains.push(chain);
      }
    }
    
    const totalElapsed = Date.now() - startTime;
    this.logger.debug('Entry processing complete', {
      conversationCount: conversationChains.length,
      totalElapsedMs: totalElapsed,
      avgTimePerConversation: conversationChains.length > 0 ? totalElapsed / conversationChains.length : 0
    });
    
    return conversationChains;
  }

  /**
   * Parse all conversations from all JSONL files with file-level caching and concurrency protection
   */
  private async parseAllConversations(): Promise<ConversationChain[]> {
    const startTime = Date.now();
    this.logger.debug('Starting parseAllConversations with file-level caching');
    
    // Get current file modification times
    const currentModTimes = await this.getFileModificationTimes();
    this.logger.debug('Retrieved file modification times', { fileCount: currentModTimes.size });
    
    // Use the new file-level cache interface
    const conversations = await this.conversationCache.getOrParseConversations(
      currentModTimes,
      (filePath: string) => this.parseJsonlFile(filePath), // Parse single file
      (filePath: string) => this.extractSourceProject(filePath), // Get source project
      (allEntries: (RawJsonEntry & { sourceProject: string })[]) => this.processAllEntries(allEntries) // Process entries
    );
    
    const totalElapsed = Date.now() - startTime;
    this.logger.debug('File-level cached conversation parsing completed', { 
      conversationCount: conversations.length,
      totalElapsedMs: totalElapsed
    });
    
    return conversations;
  }
  
  /**
   * Parse a single JSONL file and return all valid entries
   */
  private async parseJsonlFile(filePath: string): Promise<RawJsonEntry[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const entries: RawJsonEntry[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as RawJsonEntry;
          entries.push(entry);
        } catch (parseError) {
          this.logger.warn('Failed to parse line from JSONL file', { 
            error: parseError,
            filePath, 
            line: line.substring(0, 100) 
          });
        }
      }
      
      return entries;
    } catch (error) {
      this.logger.error('Failed to read JSONL file', error, { filePath });
      return [];
    }
  }
  
  /**
   * Group entries by sessionId
   */
  private groupEntriesBySession(entries: (RawJsonEntry & { sourceProject: string })[]): Map<string, (RawJsonEntry & { sourceProject: string })[]> {
    const sessionGroups = new Map<string, (RawJsonEntry & { sourceProject: string })[]>();
    
    for (const entry of entries) {
      // Only group user and assistant messages
      if ((entry.type === 'user' || entry.type === 'assistant') && entry.sessionId) {
        if (!sessionGroups.has(entry.sessionId)) {
          sessionGroups.set(entry.sessionId, []);
        }
        sessionGroups.get(entry.sessionId)!.push(entry);
      }
    }
    
    return sessionGroups;
  }
  
  /**
   * Process summary entries and create leafUuid mapping
   */
  private processSummaries(entries: RawJsonEntry[]): Map<string, string> {
    const summaries = new Map<string, string>();
    
    for (const entry of entries) {
      if (entry.type === 'summary' && entry.leafUuid && entry.summary) {
        summaries.set(entry.leafUuid, entry.summary);
      }
    }
    
    return summaries;
  }
  
  private async readDirectory(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Build a conversation chain from session entries
   */
  private buildConversationChain(
    sessionId: string, 
    entries: (RawJsonEntry & { sourceProject: string })[], 
    summaries: Map<string, string>
  ): ConversationChain | null {
    try {
      // Convert entries to ConversationMessage format
      const messages: ConversationMessage[] = entries.map(entry => this.parseMessage(entry));
      
      // Build message chain using parentUuid/uuid relationships
      const orderedMessages = this.buildMessageChain(messages);
      
      if (orderedMessages.length === 0) {
        return null;
      }
      
      // Apply message filter
      const filteredMessages = this.messageFilter.filterMessages(orderedMessages);
      
      // Check if we have any messages left after filtering
      if (filteredMessages.length === 0) {
        return null;
      }
      
      // Determine project path - use original first message for cwd before filtering
      const firstMessage = orderedMessages[0];
      let projectPath = '';
      
      if (firstMessage.cwd) {
        projectPath = firstMessage.cwd;
      } else {
        // Fallback to decoding directory name from source project
        const sourceProject = entries[0].sourceProject;
        projectPath = this.decodeProjectPath(sourceProject);
      }
      
      // Determine conversation summary
      const summary = this.determineConversationSummary(filteredMessages, summaries);
      
      // Calculate metadata from filtered messages
      const totalDuration = filteredMessages.reduce((sum, msg) => sum + (msg.durationMs || 0), 0);
      const model = this.extractModel(filteredMessages);
      
      // Get timestamps from filtered messages
      const timestamps = filteredMessages
        .map(msg => msg.timestamp)
        .filter(ts => ts)
        .sort();
      
      const createdAt = timestamps[0] || new Date().toISOString();
      const updatedAt = timestamps[timestamps.length - 1] || createdAt;
      
      return {
        sessionId,
        messages: filteredMessages,
        projectPath,
        summary,
        createdAt,
        updatedAt,
        totalDuration,
        model
      };
    } catch (error) {
      this.logger.error('Error building conversation chain', error, { sessionId });
      return null;
    }
  }
  
  /**
   * Build ordered message chain using parentUuid relationships
   */
  private buildMessageChain(messages: ConversationMessage[]): ConversationMessage[] {
    // Create uuid to message mapping
    const messageMap = new Map<string, ConversationMessage>();
    messages.forEach(msg => messageMap.set(msg.uuid, msg));
    
    // Find head message (parentUuid is null)
    const headMessage = messages.find(msg => !msg.parentUuid);
    if (!headMessage) {
      // If no head found, return messages sorted by timestamp
      return messages.sort((a, b) => 
        new Date(a.timestamp || '').getTime() - new Date(b.timestamp || '').getTime()
      );
    }
    
    // Build chain from head
    const orderedMessages: ConversationMessage[] = [];
    const visited = new Set<string>();
    
    const traverse = (currentMessage: ConversationMessage) => {
      if (visited.has(currentMessage.uuid)) {
        return; // Avoid cycles
      }
      
      visited.add(currentMessage.uuid);
      orderedMessages.push(currentMessage);
      
      // Find children (messages with this message as parent)
      const children = messages.filter(msg => msg.parentUuid === currentMessage.uuid);
      
      // Sort children by timestamp to maintain order
      children.sort((a, b) => 
        new Date(a.timestamp || '').getTime() - new Date(b.timestamp || '').getTime()
      );
      
      children.forEach(child => traverse(child));
    };
    
    traverse(headMessage);
    
    // Add any orphaned messages at the end
    const orphanedMessages = messages.filter(msg => !visited.has(msg.uuid));
    orderedMessages.push(...orphanedMessages.sort((a, b) => 
      new Date(a.timestamp || '').getTime() - new Date(b.timestamp || '').getTime()
    ));
    
    return orderedMessages;
  }
  
  /**
   * Determine conversation summary from messages and summary map
   */
  private determineConversationSummary(
    messages: ConversationMessage[], 
    summaries: Map<string, string>
  ): string {
    // Walk through messages from latest to earliest to find last available summary
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (summaries.has(message.uuid)) {
        return summaries.get(message.uuid)!;
      }
    }
    
    // Fallback to first user message content
    const firstUserMessage = messages.find(msg => msg.type === 'user');
    if (firstUserMessage && firstUserMessage.message) {
      const content = this.extractMessageContent(firstUserMessage.message);
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }
    
    return 'No summary available';
  }
  
  /**
   * Extract text content from message object
   */
  private extractMessageContent(message: Anthropic.Message | Anthropic.MessageParam | string): string {
    if (typeof message === 'string') {
      return message;
    }
    
    if (message.content) {
      if (typeof message.content === 'string') {
        return message.content;
      }
      
      if (Array.isArray(message.content)) {
        // Find first text content block
        const textBlock = message.content.find((block) => block.type === 'text');
        return textBlock && 'text' in textBlock ? textBlock.text : '';
      }
    }
    
    return 'No content available';
  }
  
  /**
   * Extract model information from messages
   */
  private extractModel(messages: ConversationMessage[]): string {
    for (const message of messages) {
      if (message.message && typeof message.message === 'object') {
        const messageObj = message.message as { model?: string };
        if (messageObj.model) {
          return messageObj.model;
        }
      }
    }
    return 'Unknown';
  }


  private parseMessage(entry: RawJsonEntry): ConversationMessage {
    return {
      uuid: entry.uuid || '',
      type: entry.type as 'user' | 'assistant' | 'system',
      message: entry.message!,  // Non-null assertion since ConversationMessage requires it
      timestamp: entry.timestamp || '',
      sessionId: entry.sessionId || '',
      parentUuid: entry.parentUuid,
      isSidechain: entry.isSidechain,
      userType: entry.userType,
      cwd: entry.cwd,
      version: entry.version,
      durationMs: entry.durationMs
    };
  }

  private applyFilters(conversations: ConversationSummary[], filter?: ConversationListQuery): ConversationSummary[] {
    if (!filter) return conversations;
    
    let filtered = [...conversations];
    
    // Filter by project path
    if (filter.projectPath) {
      filtered = filtered.filter(c => c.projectPath === filter.projectPath);
    }
    
    // Filter by continuation session
    if (filter.hasContinuation !== undefined) {
      filtered = filtered.filter(c => {
        const hasContinuation = c.sessionInfo.continuation_session_id !== '';
        return filter.hasContinuation ? hasContinuation : !hasContinuation;
      });
    }
    
    // Filter by archived status
    if (filter.archived !== undefined) {
      filtered = filtered.filter(c => c.sessionInfo.archived === filter.archived);
    }
    
    // Filter by pinned status
    if (filter.pinned !== undefined) {
      filtered = filtered.filter(c => c.sessionInfo.pinned === filter.pinned);
    }
    
    // Sort
    if (filter.sortBy) {
      filtered.sort((a, b) => {
        const field = filter.sortBy === 'created' ? 'createdAt' : 'updatedAt';
        const aVal = new Date(a[field]).getTime();
        const bVal = new Date(b[field]).getTime();
        return filter.order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    return filtered;
  }

  private applyPagination(conversations: ConversationSummary[], filter?: ConversationListQuery): ConversationSummary[] {
    if (!filter) return conversations;
    
    const limit = filter.limit || 20;
    const offset = filter.offset || 0;
    
    return conversations.slice(offset, offset + limit);
  }

  private decodeProjectPath(encoded: string): string {
    // Claude encodes directory paths by replacing '/' with '-'
    return encoded.replace(/-/g, '/');
  }

}