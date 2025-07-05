# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code, cc in short) when working with code in this repository.

## Project Overview

CCUI (Claude Code Web UI) is a backend server that provides a web interface for managing Claude CLI processes. The project enables users to interact with Claude through a web browser rather than the command line, offering features like conversation management, real-time streaming, and permission handling through the Model Context Protocol (MCP).

### MCP Permission System

CCUI includes an integrated MCP server that handles tool permission requests from Claude CLI:
- Automatically generates MCP configuration on server startup
- Provides `approval_prompt` tool for Claude to request permissions
- Tracks all permission requests through the PermissionTracker service
- Currently auto-approves all requests (future versions will support user approval/denial)

## Recent Major Features

### React-based Web UI with Vite Integration
- Modern React + TypeScript frontend replacing vanilla JavaScript
- Vite development server integration for hot module replacement
- Real-time conversation streaming with proper content block rendering
- File system navigation with security boundaries
- Comprehensive error handling and status tracking
- Real-time log viewer with filtering and JSONL parsing

### Enhanced File System API
- Secure file system access with multiple security layers
- Path traversal prevention and validation
- Support for listing directories and reading files
- Binary file detection and size limits
- Optional base path restrictions for sandboxing

### MCP Permission System Integration
- Automatic MCP configuration generation on server startup
- Permission request tracking and broadcasting
- Integration with Claude CLI's `--permission-prompt-tool` flag
- Real-time permission event streaming to clients

## Development Commands

```bash
# Development server with hot reloading (uses tsx)
npm run dev

# Development server with Vite for React UI
npm run dev:vite

# Build TypeScript to JavaScript with path alias resolution
npm run build

# Build React frontend for production
npm run build:web

# Run the CLI after building
npm run cli

# Run all tests
npm test

# Run unit tests only
npm run unit-tests

# Run integration tests only
npm run integration-tests

# Lint TypeScript files
npm run lint

# Type check TypeScript files
npm run typecheck
```

> For CLI commands and testing details, see `src/cli/CLAUDE.md` and `tests/CLAUDE.md`

## Architecture Overview

### Core Components

The backend follows a service-oriented architecture with these key components:

- **CCUIServer** (`src/ccui-server.ts`) - Main Express server that coordinates all components
- **ClaudeProcessManager** (`src/services/claude-process-manager.ts`) - Manages Claude CLI process lifecycle with MCP integration
- **StreamManager** (`src/services/stream-manager.ts`) - Handles client streaming connections  
- **ClaudeHistoryReader** (`src/services/claude-history-reader.ts`) - Reads conversation history from ~/.claude and provides working directory lookup
- **ConversationStatusTracker** (`src/services/conversation-status-tracker.ts`) - Tracks conversation status based on active streams
- **JsonLinesParser** (`src/services/json-lines-parser.ts`) - Parses JSONL streams from Claude CLI
- **PermissionTracker** (`src/services/permission-tracker.ts`) - Tracks MCP permission requests from Claude
- **MCPConfigGenerator** (`src/services/mcp-config-generator.ts`) - Generates dynamic MCP configuration files
- **MCP Permission Server** (`src/mcp-server/index.ts`) - Standalone MCP server for handling permission requests
- **FileSystemService** (`src/services/file-system-service.ts`) - Secure file system access with validation and sandboxing
- **LogStreamBuffer** (`src/services/log-stream-buffer.ts`) - Circular buffer for capturing and streaming server logs
- **SessionInfoService** (`src/services/session-info-service.ts`) - Manages session metadata including custom names using lowdb for fast local storage
- **SessionDepsService** (`src/services/session-deps-service.ts`) - Tracks session dependency relationships using SHA256 prefix hashing

> For detailed service architecture and implementation patterns, see `src/services/CLAUDE.md`

### Data Flow Architecture

1. **Frontend** makes REST API calls to start/manage conversations
2. **Backend** spawns Claude CLI processes independently with MCP configuration
3. **Claude CLI** outputs JSONL streams that are parsed and forwarded
4. **JsonLinesParser** transforms Claude output into structured events
5. **StreamManager** provides real-time updates to connected web clients via HTTP streaming
6. **MCP Server** receives permission requests from Claude and notifies backend
7. **PermissionTracker** manages and broadcasts permission events to clients

### File Structure Conventions

- **kebab-case** for all TypeScript file names (e.g., `claude-process-manager.ts`)
- **PascalCase** for class names (e.g., `ClaudeProcessManager`)
- **camelCase** for variables and functions
- **Path aliases** use `@/` prefix (e.g., `import { StreamManager } from '@/services/stream-manager'`)

## Core Type Definitions

> For complete type definitions and data structures, see `src/types/CLAUDE.md`

Key types include:
- **Stream Message Types**: SystemInitMessage, AssistantStreamMessage, UserStreamMessage, ResultStreamMessage
- **Content Block System**: TextBlock, ToolUseBlock, ThinkingBlock, etc.
- **API Request/Response Types**: StartConversationRequest, ConversationSummary, etc.
- **Configuration Types**: ConversationConfig
- **Stream Event Types**: StreamEvent union type
- **Tool Definitions**: FileOperationTools, SearchTools, ExecutionTools, etc.

## Session Dependencies System

CCUI includes an advanced session dependencies tracking system that:
- **Tracks prefix hash relationships** between Claude sessions to build dependency trees
- **Calculates "leaf sessions"** (nearest continuation) for each session
- **Uses SHA256 prefix hashing** to identify session relationships
- **Handles gaps in session chains** (e.g., A(1) → B(1,2,3) where no session with messages 1,2 exists)
- **Optimizes for performance** with incremental updates and caching

### Key Features:
- Deterministic hash calculation based on message content
- Tree building algorithm with direct parent identification
- Topological sorting for efficient leaf session calculation  
- Persistent storage in `~/.ccui/session-deps.json`
- Graceful degradation when database is corrupted
- Skip initialization in test mode for faster test execution

### API Enhancement:
- All conversation endpoints include `leaf_session` and `hash` fields
- `leaf_session`: ID of the nearest leaf session in the dependency tree
- `hash`: SHA256 hash of the session's complete message sequence

## Key Implementation Details

> For detailed implementation patterns and service architecture, see `src/services/CLAUDE.md`

**Claude Process Management:**
- Each conversation runs as a separate `claude` CLI child process
- Uses `child_process.spawn()` for real-time output streaming
- Parse JSONL output incrementally using custom `JsonLinesParser`
- Handle graceful shutdown with SIGTERM/SIGKILL fallback
- Automatically includes MCP configuration for permission handling
- Uses `--permission-prompt-tool` flag to enable MCP permission flow

**MCP Integration:**
- Dynamic MCP config generated on server startup
- Config includes CCUI permission server with proper port
- All conversations automatically get MCP permission tool enabled
- Permission requests are tracked and broadcast to clients

**Important:** Claude CLI in print mode (`-p`) runs once and exits. It does not accept stdin input for continuing conversations.

## Memories and Notes

- Check Anthropic.Message | Anthropic.MessageParam implementation at node_modules/@anthropic-ai/sdk/src/resources/messages/messages.ts when working on rendering/parsing message outputs
- Use test:debug for trouble shooting
- The cc-worktrees/ is used for isolated working tree with git worktree. Create worktree there and cd into it when instructed to use worktree to implement feature
- If mcp are missing in real claude test/usage, it might be that we need to build and build:mcp to chmod mcp endpoiints
- Added details about the `config.json` in `~/.ccui`:
  - Location: `~/.ccui/config.json`
  - Automatically created on first server startup
  - Contains machine-specific configuration with auto-generated machine ID
  - Includes server, logging, and machine identification settings
  - Replaces previous environment variable-based configuration
  - Provides a centralized, file-based approach to configuration management

## Testing Architecture

> For comprehensive testing details, patterns, and mock setup, see `tests/CLAUDE.md`

**Testing Philosophy:**
- Prefer real implementations over mocks when testing
- Comprehensive unit test coverage for all services (90%+ target)
- Mock Claude CLI using `tests/__mocks__/claude` script
- Silent logging in tests (LOG_LEVEL=silent)

**Key Features:**
- Jest with `ts-jest` preset for TypeScript support
- Path mapping using `@/` aliases matching source structure
- Custom mock Claude CLI that outputs valid JSONL stream format

## Code Practices and Guidelines

### File Organization
- **Service classes** in `src/services/` for core business logic
- **Type definitions** centralized in `src/types/index.ts`
- **CLI commands** in `src/cli/commands/` with Commander.js
- **React components** in `src/web/` for the web UI
- **Path aliases** use `@/` prefix for clean imports
- **TypeScript configs** separated by concern (base, node, web)

### Web UI Structure (`src/web/`)
- **App.tsx** - Main application entry point with routing
- **chat/** - Chat interface components and logic
  - **components/** - Reusable UI components (Layout, Sidebar, MessageList, etc.)
  - **hooks/** - Custom React hooks (useStreaming, useTheme)
  - **services/** - API client for backend communication
  - **styles/** - Global styles and theme configuration
- **console/** - Console/log viewing interface
  - **ConsoleApp.tsx** - Main console application
  - **LogWindow.tsx** - Log display component
- **main.tsx** - React application bootstrap
- **index.html** - HTML template for Vite

> See subdirectory CLAUDE.md files for detailed implementation patterns:
> - `src/services/CLAUDE.md` - Service architecture and error handling
> - `src/cli/CLAUDE.md` - CLI command patterns
> - `src/types/CLAUDE.md` - Type definitions and data structures
> - `tests/CLAUDE.md` - Testing philosophy and patterns

### Development Practices
- **TypeScript strict mode** for type safety
- **ESLint** for code quality and consistency
- **Event-driven architecture** using Node.js EventEmitter
- **Stateless design** for scalability

## API Endpoints

### Conversation Management
- `POST /api/conversations/start` - Start new conversation with Claude CLI
- `POST /api/conversations/resume` - Resume existing conversation with session ID and new message
- `GET /api/conversations` - List conversation history with filtering
- `GET /api/conversations/:sessionId` - Get full conversation details
- `POST /api/conversations/:streamingId/stop` - Stop active conversation

### Streaming
- `GET /api/stream/:streamingId` - HTTP streaming endpoint for real-time updates
- Uses newline-delimited JSON format (not Server-Sent Events)
- Supports multiple clients per conversation session

### System
- `GET /api/system/status` - System status including Claude version and active conversations
- `GET /health` - Health check endpoint

### File System Utilities
- `GET /api/filesystem/list?path=/absolute/path` - List directory contents with security checks
- `GET /api/filesystem/read?path=/absolute/path/file.txt` - Read file contents (max 10MB, UTF-8 only)

### Log Streaming
- `GET /api/logs/recent?limit=100` - Get recent buffered logs 
- `GET /api/logs/stream` - Real-time log streaming via Server-Sent Events

**Security Features:**
- Path traversal prevention (rejects paths containing `..`)
- Absolute paths required
- Hidden files/directories blocked (starting with `.`)
- Null byte protection
- Invalid character validation
- Optional base path restrictions via FileSystemService constructor
- File size limits (configurable, default 10MB)
- Binary file detection and rejection

### Resume Conversation

Resume existing conversations using Claude CLI's `--resume` functionality:

**API Usage:**
```json
POST /api/conversations/resume
{
  "sessionId": "claude-session-id",
  "message": "Continue with this message"
}
```

Returns new streaming ID for continued conversation. Session parameters are inherited from original conversation.

### Conversation Status Tracking

The backend automatically tracks conversation status based on active streaming connections:

**Status Values:**
- `completed`: Conversation has finished and no active stream exists (default)
- `ongoing`: Conversation has an active streaming connection (currently being processed)
- `pending`: Reserved for future features (not currently used)

Ongoing conversations include an optional `streamingId` field in API responses for connecting to active streams or stopping conversations.

## Configuration System

CCUI uses a JSON configuration file located at `~/.ccui/config.json`. The config file is created automatically on first startup.

### Configuration Structure
```json
{
  "machine_id": "wenbomacbook-a1b2c3d4",  // Auto-generated unique identifier
  "server": {
    "host": "localhost",                  // Server bind address
    "port": 3001                          // Server port
  },
  "logging": {
    "level": "info"                       // Log level (silent, debug, info, warn, error)
  }
}
```

### Machine ID Generation
The `machine_id` is automatically generated on first startup:
- Format: `{hostname}-{8char_hash}`
- Hostname: System hostname (lowercase)
- Hash: First 8 characters of SHA256(primary_mac_address)
- Example: `wenbomacbook-a1b2c3d4`

### Configuration Loading
1. On server startup, ConfigService checks for `~/.ccui/config.json`
2. If not found, creates the directory and generates default config
3. Loads and validates the configuration
4. If any step fails, the server will not start

### Environment Variables
Only the following environment variables are still used:
```bash
NODE_ENV=test|development|production         # Build/runtime environment
CLAUDE_HOME_PATH=~/.claude                  # Claude CLI home directory (not configurable)
```

Note: All server and logging configuration has been moved to the config file. Environment variables like `PORT` and `LOG_LEVEL` are no longer supported.

## Database Cache System

CCUI uses a lowdb-based database cache system stored in `~/.ccui/session-info.json` for managing session metadata. This provides fast access to session information without parsing JSONL files.

### Session Info Database
- **Location**: `~/.ccui/session-info.json`
- **Technology**: lowdb v7.0.1 with TypeScript support
- **Purpose**: Cache session metadata including custom names for fast retrieval

### Database Schema
```typescript
interface SessionInfoDatabase {
  sessions: Record<string, SessionInfo>;     // session-id -> SessionInfo mapping
  metadata: DatabaseMetadata;               // Database schema information
}

interface SessionInfo {
  custom_name: string;          // Custom name set by user, default: ""
  created_at: string;           // ISO 8601 timestamp when session info created
  updated_at: string;           // ISO 8601 timestamp when session info updated
  version: number;              // Schema version for future migrations
}
```

### Key Features
- **Automatic Creation**: Database file created on first server startup
- **Default Values**: Sessions without entries return default empty custom_name
- **Type Safety**: Full TypeScript integration with lowdb
- **Performance**: Fast lookups without parsing Claude's JSONL files
- **Graceful Degradation**: Falls back to defaults if database is inaccessible
- **Schema Versioning**: Built-in migration support for future updates

### API Integration
- All conversation list endpoints include `custom_name` field
- New `/api/conversations/:sessionId/rename` endpoint for updating custom names
- Integration with ClaudeHistoryReader for enhanced conversation summaries

## Development Status

This is a **fully functional implementation** with:
- ✅ Complete Claude CLI process management
- ✅ HTTP streaming with newline-delimited JSON
- ✅ Conversation history reading from `~/.claude`
- ✅ Comprehensive test coverage
- ✅ CLI interface with multiple commands
- ✅ Error handling and graceful shutdown
- ✅ Structured logging and monitoring
- ✅ TypeScript type safety throughout
- ✅ React-based web UI with Vite integration
- ✅ Secure file system API with validation
- ✅ MCP permission system integration
- ✅ Real-time permission tracking and broadcasting
- ✅ Real-time log streaming and console integration
- ✅ Database cache system with lowdb for session metadata
- ✅ Custom session naming with persistent storage

The project provides a production-ready foundation for web-based Claude CLI interaction with a modern, responsive UI.

## Session ID Architecture

CCUI maintains **two separate session ID systems**:

1. **CCUI Streaming ID** (`streamingId`): Internal UUID for managing active processes and streaming connections
2. **Claude CLI Session ID** (`session_id`): Claude's internal session tracking, used in history files

## CC Patterns

> For Claude CLI command construction patterns and conversation history structure, see `src/cli/CLAUDE.md`

## Important Notes

- **Logging**: Always use `@/services/logger.ts` for logging. NEVER USE CONSOLE.LOG in production code
- **API Documentation**: Update `@cc-workfiles/knowledge/API.md` after altering API endpoints
- **Web UI**: React app in `src/web/` with Vite for development. Use `npm run dev:vite` for HMR
- **TypeScript Configs**: Separate configs for different environments (tsconfig.base.json, tsconfig.node.json, tsconfig.web.json)
- **Claude CLI Streaming**: See `@cc-workfiles/knowledge/example-cc-stream-json.md` to understand raw JSONL output format
- **Integration Testing**: See `@cc-workfiles/knowledge/cc-with-fake-home-example.txt` for Claude CLI behavior with fake home directories
- **Claude Home Structure**: See `@cc-workfiles/knowledge/example-cc-config-folder.md` for `.claude` directory structure
- **Process Independence**: Each conversation runs as a separate Claude CLI child process
- **Vite Integration**: Server conditionally loads ViteExpress in non-test environments to avoid Jest compatibility issues
- **Web UI Architecture**: See `src/web/chat/README.md` for detailed chat interface documentation