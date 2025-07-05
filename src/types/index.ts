// Core types and interfaces for CCUI backend
import Anthropic from '@anthropic-ai/sdk';

// Base conversation types
export interface ConversationSummary {
  sessionId: string; // Claude CLI's actual session ID (used for history files)
  projectPath: string;
  summary: string;
  custom_name: string; // Custom name from SessionInfoService, default: ""
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalCost: number;
  totalDuration: number;
  model: string;
  status: 'completed' | 'ongoing' | 'pending'; // Conversation status based on active streams
  streamingId?: string; // CCUI's internal streaming ID (only present when status is 'ongoing')
  leaf_session: string; // Nearest leaf session descendant from SessionDepsService
  hash: string; // This session's end hash from SessionDepsService
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
  costUSD?: number;
  durationMs?: number;
}

// Stream message types
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  session_id: string; // Claude CLI's session ID (in stream messages)
  parent_tool_use_id?: string | null;
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
}

export interface UserStreamMessage extends StreamMessage {
  type: 'user';
  message: Anthropic.MessageParam;
}

export interface ResultStreamMessage extends StreamMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns';
  cost_usd: number;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result?: string;
  total_cost: number;
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
  streamingId: string; // CCUI's internal streaming identifier
  toolName: string;
  toolInput: Record<string, any>;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied';
  modifiedInput?: Record<string, any>;
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
}

// API request/response types
export interface StartConversationRequest {
  workingDirectory: string;
  initialPrompt: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
}

export interface ResumeConversationRequest {
  sessionId: string;
  message: string;
}

export interface StartConversationResponse {
  streamingId: string; // CCUI's internal streaming identifier for managing streaming connections
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
}

export interface ConversationDetailsResponse {
  messages: ConversationMessage[];
  summary: string;
  projectPath: string;
  metadata: {
    totalCost: number;
    totalDuration: number;
    model: string;
  };
}


export interface PermissionDecisionRequest {
  action: 'approve' | 'deny';
  modifiedInput?: Record<string, any>;
}

export interface SystemStatusResponse {
  claudeVersion: string;
  claudePath: string;
  configPath: string;
  activeConversations: number;
}

export interface ModelsResponse {
  models: string[];
  defaultModel: string;
}

// MCP types
export interface MCPPermissionToolInput {
  tool_name: string;
  input: Record<string, any>;
  session_id: string; // Claude CLI's session ID
}

export interface MCPPermissionResponse {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, any>;
  message?: string;
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
export class CCUIError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'CCUIError';
  }
}

// Config types
export interface CCUIConfig {
  machine_id: string;
  // Additional fields can be added here in the future
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
}

export interface DatabaseMetadata {
  schema_version: number;       // Current schema version
  created_at: string;          // When database was first created
  last_updated: string;        // Last database update timestamp
}

export interface SessionInfoDatabase {
  sessions: Record<string, SessionInfo>; // session-id -> SessionInfo mapping
  metadata: DatabaseMetadata;
}

// API types for session renaming
export interface SessionRenameRequest {
  customName: string;
}

export interface SessionRenameResponse {
  success: boolean;
  sessionId: string;
  customName: string;
}

// Session Dependencies Database types
export interface SessionDepsDatabase {
  sessions: Record<string, SessionDepsInfo>;
  metadata: {
    schema_version: number;
    created_at: string;
    last_updated: string;
    total_sessions: number;
  };
}

export interface SessionDepsInfo {
  session_id: string;
  prefix_hashes: string[];          // Each message's prefix hash
  end_hash: string;                 // Last message's prefix hash
  leaf_session: string;             // Nearest leaf descendant
  parent_session?: string;          // Direct parent session
  children_sessions: string[];      // Direct child sessions
  created_at: string;
  updated_at: string;
  message_count: number;            // For validation
  
  // Optimization fields
  depth?: number;                   // Tree depth cache
  last_leaf_update?: string;        // Last leaf calculation time
}