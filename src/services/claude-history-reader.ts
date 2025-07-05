import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConversationSummary, ConversationMessage, ConversationListQuery, CCUIError } from '@/types';
import { createLogger } from './logger';
import { SessionInfoService } from './session-info-service';
import { SessionDepsService } from './session-deps-service';
import type { Logger } from 'pino';
import Anthropic from '@anthropic-ai/sdk';

interface RawJsonEntry {
  type: string;
  uuid?: string;
  sessionId?: string;
  parentUuid?: string;
  timestamp?: string;
  message?: Anthropic.Message | Anthropic.MessageParam;
  cwd?: string;
  costUSD?: number;
  durationMs?: number;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  summary?: string;
  leafUuid?: string;
}

interface ConversationChain {
  sessionId: string;
  messages: ConversationMessage[];
  projectPath: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  totalCost: number;
  totalDuration: number;
  model: string;
}

/**
 * Reads conversation history from Claude's local storage
 */
export class ClaudeHistoryReader {
  private claudeHomePath: string;
  private logger: Logger;
  private sessionInfoService: SessionInfoService;
  private sessionDepsService: SessionDepsService;
  
  constructor() {
    this.claudeHomePath = path.join(os.homedir(), '.claude');
    this.logger = createLogger('ClaudeHistoryReader');
    this.sessionInfoService = SessionInfoService.getInstance();
    this.sessionDepsService = SessionDepsService.getInstance();
  }

  get homePath(): string {
    return this.claudeHomePath;
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
          // Get custom name from SessionInfoService
          let customName = '';
          try {
            const sessionInfo = await this.sessionInfoService.getSessionInfo(chain.sessionId);
            customName = sessionInfo.custom_name;
          } catch (error) {
            this.logger.warn('Failed to get session info for conversation', { 
              sessionId: chain.sessionId, 
              error: error instanceof Error ? error.message : String(error) 
            });
            // Continue with empty custom name on error
          }

          return {
            sessionId: chain.sessionId,
            projectPath: chain.projectPath,
            summary: chain.summary,
            custom_name: customName,
            createdAt: chain.createdAt,
            updatedAt: chain.updatedAt,
            messageCount: chain.messages.length,
            totalCost: chain.totalCost,
            totalDuration: chain.totalDuration,
            model: chain.model,
            status: 'completed' as const, // Default status, will be updated by server
            leaf_session: '', // Default value, will be enhanced by SessionDepsService
            hash: '' // Default value, will be enhanced by SessionDepsService
          };
        })
      );
      
      // Enhance conversations with dependency information
      const enhancedConversations = await this.sessionDepsService.getEnhancedConversations(allConversations);
      
      // Apply filters and pagination
      const filtered = this.applyFilters(enhancedConversations, filter);
      const paginated = this.applyPagination(filtered, filter);
      
      return {
        conversations: paginated,
        total: filtered.length
      };
    } catch (error) {
      throw new CCUIError('HISTORY_READ_FAILED', `Failed to read conversation history: ${error}`, 500);
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
        throw new CCUIError('CONVERSATION_NOT_FOUND', `Conversation ${sessionId} not found`, 404);
      }
      
      return conversation.messages;
    } catch (error) {
      if (error instanceof CCUIError) throw error;
      throw new CCUIError('CONVERSATION_READ_FAILED', `Failed to read conversation: ${error}`, 500);
    }
  }

  /**
   * Get conversation metadata
   */
  async getConversationMetadata(sessionId: string): Promise<{
    summary: string;
    projectPath: string;
    model: string;
    totalCost: number;
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
        totalCost: conversation.totalCost,
        totalDuration: conversation.totalDuration
      };
    } catch (error) {
      this.logger.error('Error getting metadata for conversation', error, { sessionId });
      return null;
    }
  }

  /**
   * Get full conversation details including messages
   * Used by SessionDepsService to get messages for hash calculation
   */
  async getConversationDetails(sessionId: string): Promise<{
    messages: ConversationMessage[];
    summary: string;
    projectPath: string;
    metadata: {
      totalCost: number;
      totalDuration: number;
      model: string;
    };
  }> {
    try {
      const conversationChains = await this.parseAllConversations();
      const conversation = conversationChains.find(chain => chain.sessionId === sessionId);
      
      if (!conversation) {
        throw new CCUIError('CONVERSATION_NOT_FOUND', `Conversation ${sessionId} not found`, 404);
      }

      return {
        messages: conversation.messages,
        summary: conversation.summary,
        projectPath: conversation.projectPath,
        metadata: {
          totalCost: conversation.totalCost,
          totalDuration: conversation.totalDuration,
          model: conversation.model
        }
      };
    } catch (error) {
      if (error instanceof CCUIError) throw error;
      throw new CCUIError('CONVERSATION_READ_FAILED', `Failed to read conversation: ${error}`, 500);
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
   * Parse all conversations from all JSONL files
   */
  private async parseAllConversations(): Promise<ConversationChain[]> {
    const projectsPath = path.join(this.claudeHomePath, 'projects');
    const projects = await this.readDirectory(projectsPath);
    
    // Collect all JSON entries from all files with source tracking
    const allEntries: (RawJsonEntry & { sourceProject: string })[] = [];
    
    for (const project of projects) {
      const projectPath = path.join(projectsPath, project);
      const stats = await fs.stat(projectPath);
      
      if (!stats.isDirectory()) continue;
      
      const files = await this.readDirectory(projectPath);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        
        const filePath = path.join(projectPath, file);
        const entries = await this.parseJsonlFile(filePath);
        
        // Add source project tracking to each entry
        const entriesWithSource = entries.map(entry => ({
          ...entry,
          sourceProject: project
        }));
        
        allEntries.push(...entriesWithSource);
      }
    }
    
    // Group entries by sessionId
    const sessionGroups = this.groupEntriesBySession(allEntries);
    
    // Process summaries
    const summaries = this.processSummaries(allEntries);
    
    // Build conversation chains
    const conversationChains: ConversationChain[] = [];
    
    for (const [sessionId, entries] of sessionGroups) {
      const chain = this.buildConversationChain(sessionId, entries, summaries);
      if (chain) {
        conversationChains.push(chain);
      }
    }
    
    return conversationChains;
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
          this.logger.warn('Failed to parse line from JSONL file', parseError, { 
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
      
      // Determine project path - respect first message's cwd over directory name
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
      const summary = this.determineConversationSummary(orderedMessages, summaries);
      
      // Calculate metadata
      const totalCost = messages.reduce((sum, msg) => sum + (msg.costUSD || 0), 0);
      const totalDuration = messages.reduce((sum, msg) => sum + (msg.durationMs || 0), 0);
      const model = this.extractModel(messages);
      
      // Get timestamps
      const timestamps = messages
        .map(msg => msg.timestamp)
        .filter(ts => ts)
        .sort();
      
      const createdAt = timestamps[0] || new Date().toISOString();
      const updatedAt = timestamps[timestamps.length - 1] || createdAt;
      
      return {
        sessionId,
        messages: orderedMessages,
        projectPath,
        summary,
        createdAt,
        updatedAt,
        totalCost,
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
      costUSD: entry.costUSD,
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