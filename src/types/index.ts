// Core types and interfaces for CUI backend
import Anthropic from '@anthropic-ai/sdk';

// Tool metrics types
export interface ToolMetrics {
  linesAdded: number;
  linesRemoved: number;
  editCount: number;
  writeCount: number;
}

// Base conversation types
export interface ConversationSummary {
  sessionId: string; // Claude CLI's actual session ID (used for history files)
  projectPath: string;
  summary: string;
  sessionInfo: SessionInfo; // Complete session metadata from SessionInfoService
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalDuration: number;
  model: string;
  status: 'completed' | 'ongoing' | 'pending'; // Conversation status based on active streams
  streamingId?: string; // CUI's internal streaming ID (only present when status is 'ongoing')
  toolMetrics?: ToolMetrics; // Optional tool usage metrics
}

export interface ConversationMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'system';
  message: Anthropic.Message | Anthropic.MessageParam;
  timestamp: string;
  sessionId: string; // Claude CLI's actual session ID
  parentUuid?: string;
  isSidechain?: boolean; // Whether this message is part of a sidechain conversation
  userType?: string; // Type of user interaction (e.g., 'external')
  cwd?: string; // Working directory when the message was created
  version?: string; // Claude CLI version used for this message
  durationMs?: number;
}

// Stream message types
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  session_id: string; // Claude CLI's session ID (in stream messages)
}

export interface SystemInitMessage extends StreamMessage {
  type: 'system';
  subtype: 'init';
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string; }[];
  model: string;
  permissionMode: string;
  apiKeySource: string;
}

export interface AssistantStreamMessage extends StreamMessage {
  type: 'assistant';
  message: Anthropic.Message;
  parent_tool_use_id?: string;
}

export interface UserStreamMessage extends StreamMessage {
  type: 'user';
  message: Anthropic.MessageParam;
  parent_tool_use_id?: string;
}

export interface ResultStreamMessage extends StreamMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns';
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result?: string;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use: {
      web_search_requests: number;
    };
  };
}

// Permission types
export interface PermissionRequest {
  id: string;
  streamingId: string; // CUI's internal streaming identifier
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied';
  modifiedInput?: Record<string, unknown>;
  denyReason?: string;
}

// Configuration types
export interface ConversationConfig {
  workingDirectory: string;
  initialPrompt: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  claudeExecutablePath?: string;
  previousMessages?: ConversationMessage[]; // Messages from previous session for resume context
  permissionMode?: string; // Permission mode: "acceptEdits" | "bypassPermissions" | "default" | "plan"
}

// API request/response types
export interface StartConversationRequest {
  workingDirectory: string;
  initialPrompt: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  permissionMode?: string; // Permission mode: "acceptEdits" | "bypassPermissions" | "default" | "plan"
  resumedSessionId?: string; // Optional: session ID to resume from
}


export interface StartConversationResponse {
  streamingId: string; // CUI's internal streaming identifier for managing streaming connections
  streamUrl: string;
  // System init fields from Claude CLI
  sessionId: string; // Claude CLI's session ID
  cwd: string; // Working directory
  tools: string[]; // Available tools
  mcpServers: { name: string; status: string; }[]; // MCP server list
  model: string; // Actual model being used
  permissionMode: string; // Permission handling mode
  apiKeySource: string; // API key source
}

export interface ConversationListQuery {
  projectPath?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'created' | 'updated';
  order?: 'asc' | 'desc';
  hasContinuation?: boolean;
  archived?: boolean;
  pinned?: boolean;
}

export interface ConversationDetailsResponse {
  messages: ConversationMessage[];
  summary: string;
  projectPath: string;
  metadata: {
      totalDuration: number;
    model: string;
  };
  toolMetrics?: ToolMetrics; // Optional tool usage metrics
}


export interface PermissionDecisionRequest {
  action: 'approve' | 'deny';
  modifiedInput?: Record<string, unknown>;
  denyReason?: string;
}

export interface PermissionDecisionResponse {
  success: boolean;
  message?: string;
}

export interface SystemStatusResponse {
  claudeVersion: string;
  claudePath: string;
  configPath: string;
  activeConversations: number;
  machineId: string;
}

// Stream event types
export type StreamEvent = 
  | { type: 'connected'; streaming_id: string; timestamp: string }
  | { type: 'permission_request'; data: PermissionRequest; streamingId: string; timestamp: string }
  | { type: 'error'; error: string; streamingId: string; timestamp: string }
  | { type: 'closed'; streamingId: string; timestamp: string }
  | SystemInitMessage
  | AssistantStreamMessage
  | UserStreamMessage
  | ResultStreamMessage;

// Error types
export class CUIError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'CUIError';
  }
}

// File system types
export interface FileSystemEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified: string;
}

export interface FileSystemListQuery {
  path: string;
  recursive?: boolean;
  respectGitignore?: boolean;
}

export interface FileSystemListResponse {
  path: string;
  entries: FileSystemEntry[];
  total: number;
}

export interface FileSystemReadQuery {
  path: string;
}

export interface FileSystemReadResponse {
  path: string;
  content: string;
  size: number;
  lastModified: string;
  encoding: string;
}

// Session Info Database types for lowdb
export interface SessionInfo {
  custom_name: string;          // Custom name for the session, default: ""
  created_at: string;           // ISO 8601 timestamp when session info was created
  updated_at: string;           // ISO 8601 timestamp when session info was last updated
  version: number;              // Schema version for future migrations
  pinned: boolean;              // Whether session is pinned, default: false
  archived: boolean;            // Whether session is archived, default: false
  continuation_session_id: string; // ID of the continuation session if exists, default: ""
  initial_commit_head: string;  // Git commit HEAD when session started, default: ""
  permission_mode: string;      // Permission mode used for the session, default: "default"
}


// API types for session renaming (deprecated - use SessionUpdateRequest instead)
export interface SessionRenameRequest {
  customName: string;
}

export interface SessionRenameResponse {
  success: boolean;
  sessionId: string;
  customName: string;
}

// API types for session update
export interface SessionUpdateRequest {
  customName?: string;           // Optional: update custom name
  pinned?: boolean;              // Optional: update pinned status
  archived?: boolean;            // Optional: update archived status
  continuationSessionId?: string; // Optional: update continuation session
  initialCommitHead?: string;    // Optional: update initial commit head
  permissionMode?: string;       // Optional: update permission mode
}

export interface SessionUpdateResponse {
  success: boolean;
  sessionId: string;
  updatedFields: SessionInfo;    // Returns the complete updated session info
}

// Notification types
export interface Notification {
  title: string;
  message: string;
  priority: 'min' | 'low' | 'default' | 'high' | 'urgent';
  tags: string[];
  sessionId: string;
  streamingId: string;
  permissionRequestId?: string;
}

// Working directories API types
export interface WorkingDirectory {
  path: string;              // Full absolute path (e.g., "/home/user/projects/myapp")
  shortname: string;         // Smart suffix (e.g., "myapp" or "projects/myapp")
  lastDate: string;          // ISO timestamp of most recent conversation
  conversationCount: number; // Total conversations in this directory
}

export interface WorkingDirectoriesResponse {
  directories: WorkingDirectory[];
  totalCount: number;
}

// Commands API types
export interface Command {
  name: string;
  type: 'builtin' | 'custom';
  description?: string;
}

export interface CommandsResponse {
  commands: Command[];
}


// Gemini API types
export interface GeminiHealthResponse {
  status: 'healthy' | 'unhealthy';
  message: string;
  apiKeyValid: boolean;
}

export interface GeminiTranscribeRequest {
  audio: string; // base64 encoded audio
  mimeType: string; // audio mime type
}

export interface GeminiTranscribeResponse {
  text: string;
}

export interface GeminiSummarizeRequest {
  text: string;
}

export interface GeminiSummarizeResponse {
  title: string;
  keypoints: string[];
}

export * from './config.js';
export * from './router-config.js';
