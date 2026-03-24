# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**cui-server** (Common Agent UI) is a web UI platform for AI agents powered by Claude Code SDK. It provides a modern web interface that manages Claude CLI processes and supports multi-model agentic workflows.

## Essential Development Commands

```bash
# Development
npm run dev          # Start backend + Vite dev server (port 3001)
npm run dev:web      # Start Vite frontend dev server only

# Building
npm run build        # Build both backend and frontend (required before first test run)
npm run build:web    # Build frontend only
npm run build:mcp    # Build MCP server executable

# Testing
npm test             # Run all tests
npm run unit-tests   # Run unit tests only (tests/unit/)
npm run integration-tests  # Run integration tests only (tests/integration/)
npm run test:coverage      # Run with coverage report (75% lines, 80% functions)
npm run test:watch   # Watch mode for TDD
npm run test:debug   # Enable debug logs during testing

# Run specific test files or patterns
npm test -- claude-process-manager.test.ts
npm test -- tests/unit/
npm test -- --testNamePattern="should start conversation"

# Quality checks
npm run lint         # ESLint checking
npm run typecheck    # TypeScript type checking without emitting

# Production
npm run start        # Start production server (requires build first)
```

## Architecture

### Core Server Stack

The application is built around a **single-port Express server** (default: 3001) that:
- Manages Claude CLI child processes via `ClaudeProcessManager`
- Streams real-time updates via Server-Sent Events (SSE) through `StreamManager`
- Handles permissions via MCP (Model Context Protocol) server integration
- Supports multi-model routing via `ClaudeRouterService` (optional)

### Key Services (`src/services/`)

**Process Management:**
- `ClaudeProcessManager`: Spawns/manages Claude CLI processes. Each conversation runs as a separate child process. Finds Claude executable from node_modules/.bin or PATH.
- `ClaudeRouterService`: Optional service that wraps `@musistudio/llms` to route requests to different LLM providers (OpenRouter, Ollama, etc.)

**Streaming & Real-time:**
- `StreamManager`: Manages SSE connections for multiple concurrent conversations. Sends heartbeats every 30s to keep connections alive.
- `ConversationStatusManager`: Tracks active conversation states (working/idle/completed)

**Data & Persistence:**
- `ClaudeHistoryReader`: Reads conversation history from `~/.claude/` directory
- `SessionInfoService`: Manages extended session metadata in `~/.cui/session-info.db` (SQLite)
- `ConversationCache`: Caches conversation data with 5-minute TTL

**Permissions & Config:**
- `PermissionTracker`: Tracks tool permission requests from Claude CLI
- `MCPConfigGenerator`: Generates MCP config for cui-mcp-server integration
- `ConfigService`: Manages configuration from `~/.cui/config.json` with hot-reloading

**Utilities:**
- `JsonLinesParser`: Parses newline-delimited JSON streams from Claude CLI
- `FileSystemService`: Handles file operations with gitignore support, file downloads, and file uploads (to conversation's `uploads/` directory)
- `ToolMetricsService`: Tracks tool usage metrics per conversation
- `NotificationService`: Push notifications (ntfy/web-push)
- `GeminiService`: Dictation via Gemini 2.5 Flash

### Frontend (`src/web/`)

- **chat/**: Main chat UI with React
- **hooks/**: useStreaming, useMultipleStreams, useConversationMessages
- **services/api.ts**: API client using fetch
- Built with Vite, React Router v6, Tailwind CSS, shadcn/ui components

### API Routes (`src/routes/`)

All routes under `/api/` except:
- `/api/permissions` - Before auth (MCP server needs access)
- `/api/notifications` - Before auth (service worker subscription)

**Key endpoints:**
- `POST /api/conversations` - Start new conversation
- `GET /api/conversations/:id` - Get conversation details
- `POST /api/conversations/:id/continue` - Continue conversation
- `DELETE /api/conversations/:id` - Stop/archive conversation
- `GET /api/stream/:streamingId` - SSE stream for real-time updates
- `GET /api/logs/stream` - Server log streaming
- `GET /api/filesystem/download` - Download single file from conversation
- `POST /api/filesystem/upload` - Upload files to conversation's uploads directory

### Configuration

All configuration and data stored in `~/.cui/`:
- `config.json` - Server settings, router config, notification config
- `session-info.db` - SQLite database for session metadata
- `mcp-config.json` - Generated MCP server configuration

## Important Patterns

### TypeScript Configuration

This project uses **path aliases** with `@/` prefix:
```typescript
import { ClaudeProcessManager } from '@/services/claude-process-manager.js';
```

Note: Import paths must include `.js` extension for ESM compatibility.

### Testing Philosophy

- **Prefer real implementations over mocks** when testing
- **Mock Claude CLI** using `tests/__mocks__/claude` script (outputs valid JSONL)
- **Silent logging** in tests: `LOG_LEVEL=silent` (set in tests/setup.ts)
- **Random ports** for server tests to avoid conflicts (9000 + random)
- **Vitest** with path aliases matching source structure

### Process Lifecycle

1. `ClaudeProcessManager.startConversation()` spawns Claude CLI process
2. `JsonLinesParser` parses stdout as newline-delimited JSON
3. Messages forwarded to `StreamManager` which broadcasts via SSE
4. `ConversationStatusManager` tracks conversation state
5. On close: cleanup permissions, unregister session, close streams

### MCP Integration

- `MCPConfigGenerator` creates config pointing to `dist/mcp-server/index.js`
- Claude CLI automatically loads this MCP server when spawned
- MCP server communicates with cui-server via HTTP for permission requests
- Tests can skip MCP if generation fails (controlled by NODE_ENV)

### Router Integration (Optional)

When `config.router.enabled` is true:
- `ClaudeRouterService` starts a local `@musistudio/llms` server on random port
- Intercepts Claude API requests and routes to configured providers
- Supports provider fallback, model routing, thinking mode
- Hot-reloads on configuration changes

### Error Handling

Use `CUIError` class with error codes:
```typescript
throw new CUIError('CODE', 'Message', httpStatusCode);
```

Common codes: `MCP_CONFIG_REQUIRED`, `SERVER_INIT_FAILED`, `HTTP_SERVER_START_FAILED`

## Development Gotchas

1. **Must build before first test run**: `npm run build` (creates MCP executable)
2. **Don't use `npm run dev` during testing**: Tests use built artifacts
3. **Enable debug logs**: `LOG_LEVEL=debug npm run dev`
4. **ViteExpress only in dev**: Production serves static files from `dist/web/`
5. **Auth token**: Generated on startup, stored in config, can be overridden with `--token` or `--no-auth`

## Code Style Requirements

- **Use strict TypeScript typing**: Avoid `any`, `undefined`, `unknown`
- **Use path aliases**: `@/services/...` not relative paths
- **Cleanup event listeners**: Especially in streaming logic
- **Never log secrets**: Auth tokens, API keys
- **Follow ESLint config**: Run `npm run lint` before committing
- **Proper error types**: Use `CUIError` with HTTP status codes
