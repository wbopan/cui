import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ClaudeProcessManager } from './services/claude-process-manager';
import { StreamManager } from './services/stream-manager';
import { ClaudeHistoryReader } from './services/claude-history-reader';
import { ConversationStatusTracker } from './services/conversation-status-tracker';
import { PermissionTracker } from './services/permission-tracker';
import { MCPConfigGenerator } from './services/mcp-config-generator';
import { FileSystemService } from './services/file-system-service';
import { logStreamBuffer } from './services/log-stream-buffer';
import { ConfigService } from './services/config-service';
import { SessionInfoService } from './services/session-info-service';
import { SessionDepsService } from './services/session-deps-service';
import { 
  StartConversationRequest,
  StartConversationResponse,
  ResumeConversationRequest,
  ConversationListQuery,
  ConversationDetailsResponse,
  SystemStatusResponse,
  ModelsResponse,
  StreamEvent,
  CCUIError,
  PermissionRequest,
  FileSystemListQuery,
  FileSystemListResponse,
  FileSystemReadQuery,
  FileSystemReadResponse,
  SessionRenameRequest,
  SessionRenameResponse
} from './types';
import { createLogger, logger as globalLogger } from './services/logger';
import type { Logger } from 'pino';
import type { LogLevel } from './types/config';

// Conditionally import ViteExpress only in non-test environments
let ViteExpress: any;
if (process.env.NODE_ENV !== 'test') {
  ViteExpress = require('vite-express');
}

/**
 * Main CCUI server class
 */
export class CCUIServer {
  private app: Express;
  private server?: import('http').Server;
  private processManager: ClaudeProcessManager;
  private streamManager: StreamManager;
  private historyReader: ClaudeHistoryReader;
  private statusTracker: ConversationStatusTracker;
  private permissionTracker: PermissionTracker;
  private mcpConfigGenerator: MCPConfigGenerator;
  private fileSystemService: FileSystemService;
  private configService: ConfigService;
  private sessionInfoService: SessionInfoService;
  private sessionDepsService: SessionDepsService;
  private logger: Logger;
  private port: number;
  private host: string;
  private configOverrides?: { port?: number; host?: string; logLevel?: LogLevel };

  constructor(configOverrides?: { port?: number; host?: string; logLevel?: LogLevel }) {
    this.app = express();
    this.configOverrides = configOverrides;
    
    // Update log level immediately if provided via CLI, before creating any child loggers
    if (configOverrides?.logLevel) {
      globalLogger.updateLogLevel(configOverrides.logLevel);
    }
    
    this.logger = createLogger('CCUIServer');
    
    // TEST: Add debug log right at the start
    this.logger.debug('🔍 TEST: CCUIServer constructor started - this should be visible if debug logging works');
    
    // Initialize config service first
    this.configService = ConfigService.getInstance();
    
    // Will be set after config is loaded
    this.port = 0;
    this.host = '';
    
    this.logger.debug('Initializing CCUIServer', {
      nodeEnv: process.env.NODE_ENV,
      configOverrides
    });
    
    // Initialize services
    this.logger.debug('Initializing services');
    this.historyReader = new ClaudeHistoryReader();
    this.processManager = new ClaudeProcessManager(this.historyReader);
    this.streamManager = new StreamManager();
    this.statusTracker = new ConversationStatusTracker();
    this.permissionTracker = new PermissionTracker();
    this.mcpConfigGenerator = new MCPConfigGenerator();
    this.fileSystemService = new FileSystemService();
    this.sessionInfoService = SessionInfoService.getInstance();
    this.sessionDepsService = SessionDepsService.getInstance();
    this.logger.debug('Services initialized successfully');
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupProcessManagerIntegration();
    this.setupPermissionTrackerIntegration();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    this.logger.debug('Start method called');
    try {
      // Initialize configuration first
      this.logger.debug('Initializing configuration');
      await this.configService.initialize();
      const config = this.configService.getConfig();
      
      // Initialize session info service
      this.logger.debug('Initializing session info service');
      await this.sessionInfoService.initialize();
      this.logger.debug('Session info service initialized successfully');
      
      // Initialize session dependencies service (skip in test mode for performance)
      if (process.env.NODE_ENV !== 'test') {
        this.logger.debug('Initializing session dependencies service');
        await this.sessionDepsService.initialize();
        this.logger.debug('Session dependencies service initialized successfully');
      } else {
        this.logger.debug('Skipping session dependencies service initialization in test mode');
      }
      
      // Apply overrides if provided (for tests and CLI options)
      this.port = this.configOverrides?.port ?? config.server.port;
      this.host = this.configOverrides?.host ?? config.server.host;
      
      this.logger.info('Configuration loaded', {
        machineId: config.machine_id,
        port: this.port,
        host: this.host,
        logLevel: config.logging.level,
        overrides: this.configOverrides ? Object.keys(this.configOverrides) : []
      });

      // Generate MCP config before starting server
      this.logger.debug('Generating MCP config');
      const mcpConfigPath = this.mcpConfigGenerator.generateConfig(this.port);
      this.processManager.setMCPConfigPath(mcpConfigPath);
      this.logger.info('MCP config generated and set', { path: mcpConfigPath });

      // Start Express server
      const isTestEnv = process.env.NODE_ENV === 'test';
      this.logger.info(`Starting HTTP server${!isTestEnv ? ' with Vite' : ''} on ${this.host}:${this.port}...`);
      this.logger.debug('Creating HTTP server listener', { 
        useViteExpress: !isTestEnv,
        environment: process.env.NODE_ENV 
      });
      
      await new Promise<void>((resolve, reject) => {
        // Use ViteExpress in non-test environments, regular Express in tests
        if (!isTestEnv && ViteExpress) {
          try {
            // ViteExpress.listen returns a promise in newer versions
            this.server = this.app.listen(this.port, this.host, () => {
              this.logger.info(`CCUI server with Vite running on ${this.host}:${this.port}`);
              this.logger.debug('Server successfully bound to port', {
                port: this.port,
                host: this.host,
                address: this.server?.address()
              });
              resolve();
            });
            
            // Configure ViteExpress to use existing server
            ViteExpress.config({
              mode: 'development',
              viteConfigFile: 'vite.config.ts'
            });
            
            ViteExpress.bind(this.app, this.server);
          } catch (error) {
            this.logger.error('Failed to start ViteExpress server', error);
            reject(error);
          }
        } else {
          this.server = this.app.listen(this.port, this.host, () => {
            this.logger.info(`CCUI server running on ${this.host}:${this.port}`);
            this.logger.debug('Server successfully bound to port', {
              port: this.port,
              host: this.host,
              address: this.server?.address()
            });
            resolve();
          });
        }

        if (this.server) {
          this.server.on('error', (error: Error) => {
            this.logger.error('Failed to start HTTP server:', error, {
              errorCode: (error as any).code,
              errorSyscall: (error as any).syscall,
              port: this.port,
              host: this.host
            });
            reject(new CCUIError('HTTP_SERVER_START_FAILED', `Failed to start HTTP server: ${error.message}`, 500));
          });
        }
      });
      this.logger.debug('Server start successful');
    } catch (error) {
      this.logger.error('Failed to start server:', error, {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      // Attempt cleanup on startup failure
      await this.cleanup();
      
      if (error instanceof CCUIError) {
        throw error;
      } else {
        throw new CCUIError('SERVER_START_FAILED', `Server startup failed: ${error}`, 500);
      }
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('Starting graceful shutdown...');
    this.logger.debug('Stop method called', {
      hasServer: !!this.server,
      activeSessions: this.processManager.getActiveSessions().length,
      connectedClients: this.streamManager.getTotalClientCount()
    });
    
    // Stop accepting new connections
    if (this.server) {
      this.logger.debug('Closing HTTP server');
      await new Promise<void>((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            this.logger.error('Error closing HTTP server:', error);
            reject(error);
          } else {
            this.logger.info('HTTP server closed');
            resolve();
          }
        });
      });
    }
    
    // Stop all active Claude processes
    const activeSessions = this.processManager.getActiveSessions();
    if (activeSessions.length > 0) {
      this.logger.info(`Stopping ${activeSessions.length} active sessions...`);
      this.logger.debug('Active sessions to stop', { sessionIds: activeSessions });
      
      const stopResults = await Promise.allSettled(
        activeSessions.map(streamingId => 
          this.processManager.stopConversation(streamingId)
            .catch(error => this.logger.error(`Error stopping session ${streamingId}:`, error))
        )
      );
      
      this.logger.debug('Session stop results', {
        total: stopResults.length,
        fulfilled: stopResults.filter(r => r.status === 'fulfilled').length,
        rejected: stopResults.filter(r => r.status === 'rejected').length
      });
    }
    
    // Disconnect all streaming clients
    this.logger.debug('Disconnecting all streaming clients');
    this.streamManager.disconnectAll();
    
    // Clean up MCP config
    this.logger.debug('Cleaning up MCP config');
    this.mcpConfigGenerator.cleanup();
    
    this.logger.info('Graceful shutdown complete');
  }

  /**
   * Cleanup resources during failed startup
   */
  private async cleanup(): Promise<void> {
    this.logger.info('Performing cleanup after startup failure...');
    this.logger.debug('Cleanup initiated', {
      hasServer: !!this.server,
      hasActiveStreams: this.streamManager.getTotalClientCount() > 0
    });
    
    try {
      // Close HTTP server if it was started
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => {
            this.logger.info('HTTP server closed during cleanup');
            resolve();
          });
        });
      }

      // Disconnect streaming clients
      this.streamManager.disconnectAll();
      
      this.logger.info('Cleanup completed');
    } catch (error) {
      this.logger.error('Error during cleanup:', error, {
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
    }
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    
    // In test environment, serve static files normally
    // In production/dev, ViteExpress handles static file serving
    if (process.env.NODE_ENV === 'test') {
      this.app.use(express.static('public'));
    }
    
    // Request logging
    this.app.use((req, res, next) => {
      const requestId = Math.random().toString(36).substring(7);
      (req as any).requestId = requestId;
      
      this.logger.info({ 
        method: req.method, 
        url: req.url,
        requestId,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent']
        },
        query: req.query,
        ip: req.ip
      }, 'Incoming request');
      
      // Log response when finished
      const startTime = Date.now();
      res.on('finish', () => {
        this.logger.debug('Request completed', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          contentLength: res.get('content-length')
        });
      });
      
      next();
    });
    
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Conversation management routes
    this.setupConversationRoutes();
    
    // System management routes
    this.setupSystemRoutes();
    
    // Permission management routes
    this.setupPermissionRoutes();
    
    // File system routes
    this.setupFileSystemRoutes();
    
    // Log routes
    this.setupLogRoutes();
    
    // Streaming endpoint
    this.setupStreamingRoute();
    
    // ViteExpress handles React app routing automatically
    
    // Error handling - MUST be last
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      const requestId = (req as any).requestId || 'unknown';
      
      if (err instanceof CCUIError) {
        this.logger.warn('CCUIError in request', {
          requestId,
          code: err.code,
          message: err.message,
          statusCode: err.statusCode,
          url: req.url,
          method: req.method
        });
        res.status(err.statusCode).json({ error: err.message, code: err.code });
      } else {
        this.logger.error(err, 'Unhandled error', {
          requestId,
          url: req.url,
          method: req.method,
          errorType: err.constructor.name
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
  }

  private setupConversationRoutes(): void {
    // Start new conversation
    this.app.post('/api/conversations/start', async (req: Request<{}, StartConversationResponse, StartConversationRequest>, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('Start conversation request', {
        requestId,
        body: {
          ...req.body,
          initialPrompt: req.body.initialPrompt ? `${req.body.initialPrompt.substring(0, 50)}...` : undefined
        }
      });
      
      try {
        // Validate required fields
        if (!req.body.workingDirectory) {
          throw new CCUIError('MISSING_WORKING_DIRECTORY', 'workingDirectory is required', 400);
        }
        if (!req.body.initialPrompt) {
          throw new CCUIError('MISSING_INITIAL_PROMPT', 'initialPrompt is required', 400);
        }
        
        const { streamingId, systemInit } = await this.processManager.startConversation(req.body);
        
        this.logger.debug('Conversation started successfully', {
          requestId,
          streamingId,
          sessionId: systemInit.session_id,
          model: systemInit.model,
          cwd: systemInit.cwd
        });
        
        res.json({ 
          streamingId,
          streamUrl: `/api/stream/${streamingId}`,
          // System init fields
          sessionId: systemInit.session_id,
          cwd: systemInit.cwd,
          tools: systemInit.tools,
          mcpServers: systemInit.mcp_servers,
          model: systemInit.model,
          permissionMode: systemInit.permissionMode,
          apiKeySource: systemInit.apiKeySource
        });
      } catch (error) {
        this.logger.debug('Start conversation failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // Resume existing conversation
    this.app.post('/api/conversations/resume', async (req: Request<{}, StartConversationResponse, ResumeConversationRequest>, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('Resume conversation request', {
        requestId,
        sessionId: req.body.sessionId,
        messagePreview: req.body.message ? `${req.body.message.substring(0, 50)}...` : undefined
      });
      
      try {
        // Validate required fields
        if (!req.body.sessionId || !req.body.sessionId.trim()) {
          throw new CCUIError('MISSING_SESSION_ID', 'sessionId is required', 400);
        }
        if (!req.body.message || !req.body.message.trim()) {
          throw new CCUIError('MISSING_MESSAGE', 'message is required', 400);
        }
        
        // Validate that only allowed fields are provided (no extra parameters)
        const allowedFields = ['sessionId', 'message'];
        const providedFields = Object.keys(req.body);
        const extraFields = providedFields.filter(field => !allowedFields.includes(field));
        
        if (extraFields.length > 0) {
          throw new CCUIError('INVALID_FIELDS', `Invalid fields for resume: ${extraFields.join(', ')}. Only sessionId and message are allowed.`, 400);
        }
        
        const { streamingId, systemInit } = await this.processManager.resumeConversation({
          sessionId: req.body.sessionId,
          message: req.body.message
        });
        
        this.logger.debug('Conversation resumed successfully', {
          requestId,
          originalSessionId: req.body.sessionId,
          newStreamingId: streamingId,
          newSessionId: systemInit.session_id,
          model: systemInit.model,
          cwd: systemInit.cwd
        });
        
        res.json({ 
          streamingId,
          streamUrl: `/api/stream/${streamingId}`,
          // System init fields
          sessionId: systemInit.session_id,
          cwd: systemInit.cwd,
          tools: systemInit.tools,
          mcpServers: systemInit.mcp_servers,
          model: systemInit.model,
          permissionMode: systemInit.permissionMode,
          apiKeySource: systemInit.apiKeySource
        });
      } catch (error) {
        this.logger.debug('Resume conversation failed', {
          requestId,
          sessionId: req.body.sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // List conversations
    this.app.get('/api/conversations', async (req: Request<{}, {}, {}, ConversationListQuery>, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('List conversations request', {
        requestId,
        query: req.query
      });
      
      try {
        const result = await this.historyReader.listConversations(req.query);
        
        // Update status for each conversation based on active streams
        const conversationsWithStatus = result.conversations.map(conversation => {
          const status = this.statusTracker.getConversationStatus(conversation.sessionId);
          const baseConversation = {
            ...conversation,
            status
          };
          
          // Add streamingId if conversation is ongoing
          if (status === 'ongoing') {
            const streamingId = this.statusTracker.getStreamingId(conversation.sessionId);
            if (streamingId) {
              return { ...baseConversation, streamingId };
            }
          }
          
          return baseConversation;
        });
        
        this.logger.debug('Conversations listed successfully', {
          requestId,
          conversationCount: conversationsWithStatus.length,
          totalFound: result.total,
          activeConversations: conversationsWithStatus.filter(c => c.status === 'ongoing').length
        });
        
        res.json({
          conversations: conversationsWithStatus,
          total: result.total
        });
      } catch (error) {
        this.logger.debug('List conversations failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // Get conversation details
    this.app.get('/api/conversations/:sessionId', async (req, res, next) => {
      const requestId = (req as any).requestId;
      const { sessionId } = req.params;
      
      this.logger.debug('Get conversation details request', {
        requestId,
        sessionId
      });
      
      try {
        const messages = await this.historyReader.fetchConversation(req.params.sessionId);
        const metadata = await this.historyReader.getConversationMetadata(req.params.sessionId);
        
        if (!metadata) {
          throw new CCUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
        }
        
        const response: ConversationDetailsResponse = {
          messages,
          summary: metadata.summary,
          projectPath: metadata.projectPath,
          metadata: {
            totalCost: metadata.totalCost,
            totalDuration: metadata.totalDuration,
            model: metadata.model
          }
        };
        
        this.logger.debug('Conversation details retrieved successfully', {
          requestId,
          sessionId,
          messageCount: response.messages.length,
          hasSummary: !!response.summary,
          projectPath: response.projectPath
        });
        
        res.json(response);
      } catch (error) {
        this.logger.debug('Get conversation details failed', {
          requestId,
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });


    // Stop conversation
    this.app.post('/api/conversations/:streamingId/stop', async (req, res, next) => {
      const requestId = (req as any).requestId;
      const { streamingId } = req.params;
      
      this.logger.debug('Stop conversation request', {
        requestId,
        streamingId
      });
      
      try {
        const success = await this.processManager.stopConversation(streamingId);
        
        this.logger.debug('Stop conversation result', {
          requestId,
          streamingId,
          success
        });
        
        res.json({ success });
      } catch (error) {
        this.logger.debug('Stop conversation failed', {
          requestId,
          streamingId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // Rename session (update custom name)
    this.app.put('/api/conversations/:sessionId/rename', async (req: Request<{ sessionId: string }, SessionRenameResponse, SessionRenameRequest>, res, next) => {
      const requestId = (req as any).requestId;
      const { sessionId } = req.params;
      const { customName } = req.body;
      
      this.logger.debug('Rename session request', {
        requestId,
        sessionId,
        customName
      });
      
      try {
        // Validate required fields
        if (!sessionId || !sessionId.trim()) {
          throw new CCUIError('MISSING_SESSION_ID', 'sessionId is required', 400);
        }
        if (customName === undefined || customName === null) {
          throw new CCUIError('MISSING_CUSTOM_NAME', 'customName is required', 400);
        }
        
        // Validate custom name length (reasonable limit)
        if (customName.length > 200) {
          throw new CCUIError('CUSTOM_NAME_TOO_LONG', 'customName must be 200 characters or less', 400);
        }
        
        // Check if session exists by trying to get its metadata
        const metadata = await this.historyReader.getConversationMetadata(sessionId);
        if (!metadata) {
          throw new CCUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
        }
        
        // Update custom name
        await this.sessionInfoService.updateCustomName(sessionId, customName.trim());
        
        this.logger.info('Session renamed successfully', {
          requestId,
          sessionId,
          customName: customName.trim()
        });
        
        res.json({
          success: true,
          sessionId,
          customName: customName.trim()
        });
      } catch (error) {
        this.logger.debug('Rename session failed', {
          requestId,
          sessionId,
          customName,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });
  }

  private setupSystemRoutes(): void {
    // Get system status
    this.app.get('/api/system/status', async (req, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('Get system status request', { requestId });
      
      try {
        const systemStatus = await this.getSystemStatus();
        
        this.logger.debug('System status retrieved', {
          requestId,
          ...systemStatus
        });
        
        res.json(systemStatus);
      } catch (error) {
        this.logger.debug('Get system status failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });
  }

  private setupStreamingRoute(): void {
    this.app.get('/api/stream/:streamingId', (req, res) => {
      const { streamingId } = req.params;
      const requestId = (req as any).requestId;
      
      this.logger.debug('Stream connection request', {
        requestId,
        streamingId,
        headers: {
          'accept': req.headers.accept,
          'user-agent': req.headers['user-agent']
        }
      });
      
      this.streamManager.addClient(streamingId, res);
      
      // Log when stream closes
      res.on('close', () => {
        this.logger.debug('Stream connection closed', {
          requestId,
          streamingId
        });
      });
    });
  }

  private setupProcessManagerIntegration(): void {
    this.logger.debug('Setting up ProcessManager integration with StreamManager');
    
    // Forward Claude messages to stream
    this.processManager.on('claude-message', ({ streamingId, message }) => {
      this.logger.debug('Received claude-message event', { 
        streamingId, 
        messageType: message?.type,
        messageSubtype: message?.subtype,
        hasContent: !!message?.content,
        contentLength: message?.content?.length || 0,
        messageKeys: message ? Object.keys(message) : []
      });
      
      // Extract session ID from stream message and register with status tracker
      if (message && message.session_id) {
        const claudeSessionId = message.session_id;
        this.logger.debug('Registering active session with status tracker', {
          streamingId,
          claudeSessionId
        });
        this.statusTracker.registerActiveSession(streamingId, claudeSessionId);
      }
      
      // Skip broadcasting system init messages as they're now included in API response
      if (message && message.type === 'system' && message.subtype === 'init') {
        this.logger.debug('Skipping broadcast of system init message (included in API response)', {
          streamingId,
          sessionId: message.session_id
        });
        return;
      }
      
      // Stream other Claude messages as normal
      this.logger.debug('Broadcasting message to StreamManager', { 
        streamingId, 
        messageType: message?.type,
        messageSubtype: message?.subtype
      });
      this.streamManager.broadcast(streamingId, message);
    });

    // Handle process closure
    this.processManager.on('process-closed', ({ streamingId, code }) => {
      this.logger.debug('Received process-closed event, closing StreamManager session', { 
        streamingId,
        exitCode: code,
        clientCount: this.streamManager.getClientCount(streamingId),
        wasSuccessful: code === 0
      });
      
      // Unregister session from status tracker
      this.logger.debug('Unregistering session from status tracker', { streamingId });
      this.statusTracker.unregisterActiveSession(streamingId);
      
      // Clean up permissions for this streaming session
      const removedCount = this.permissionTracker.removePermissionsByStreamingId(streamingId);
      if (removedCount > 0) {
        this.logger.debug('Cleaned up permissions for closed session', { 
          streamingId, 
          removedPermissions: removedCount 
        });
      }
      
      this.streamManager.closeSession(streamingId);
    });

    // Handle process errors
    this.processManager.on('process-error', ({ streamingId, error }) => {
      this.logger.debug('Received process-error event, forwarding to StreamManager', { 
        streamingId, 
        error,
        errorLength: error?.toString().length || 0,
        clientCount: this.streamManager.getClientCount(streamingId)
      });
      
      // Unregister session from status tracker on error
      this.logger.debug('Unregistering session from status tracker due to error', { streamingId });
      this.statusTracker.unregisterActiveSession(streamingId);
      
      const errorEvent: StreamEvent = {
        type: 'error' as const,
        error: error.toString(),
        streamingId: streamingId,
        timestamp: new Date().toISOString()
      };
      
      this.logger.debug('Broadcasting error event to clients', {
        streamingId,
        errorEventKeys: Object.keys(errorEvent)
      });
      
      this.streamManager.broadcast(streamingId, errorEvent);
    });
    
    this.logger.debug('ProcessManager integration setup complete', {
      totalEventListeners: this.processManager.listenerCount('claude-message') + 
                          this.processManager.listenerCount('process-closed') + 
                          this.processManager.listenerCount('process-error')
    });
  }

  /**
   * Get system status including Claude version and active conversations
   */
  private async getSystemStatus(): Promise<SystemStatusResponse> {
    const { execSync } = require('child_process');
    
    try {
      // Get Claude version
      let claudeVersion = 'unknown';
      let claudePath = 'unknown';
      
      try {
        claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
        claudeVersion = execSync('claude --version', { encoding: 'utf-8' }).trim();
        this.logger.debug('Claude version info retrieved', {
          version: claudeVersion,
          path: claudePath
        });
      } catch (error) {
        this.logger.warn('Failed to get Claude version information', { 
          error: error instanceof Error ? error.message : String(error),
          errorCode: (error as any).code
        });
      }
      
      return {
        claudeVersion,
        claudePath,
        configPath: this.historyReader.homePath,
        activeConversations: this.processManager.getActiveSessions().length
      };
    } catch (error) {
      throw new CCUIError('SYSTEM_STATUS_ERROR', 'Failed to get system status', 500);
    }
  }

  private setupPermissionRoutes(): void {
    // Notify endpoint - called by MCP server when permission is requested
    this.app.post('/api/permissions/notify', async (req, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('Permission notification received', {
        requestId,
        body: req.body
      });
      
      try {
        const { toolName, toolInput, streamingId } = req.body;
        
        if (!toolName) {
          throw new CCUIError('MISSING_TOOL_NAME', 'toolName is required', 400);
        }
        
        // Add permission request with the provided streamingId
        const request = this.permissionTracker.addPermissionRequest(toolName, toolInput, streamingId);
        
        this.logger.debug('Permission request tracked', {
          requestId,
          permissionId: request.id,
          toolName,
          streamingId: request.streamingId
        });
        
        res.json({ success: true, id: request.id });
      } catch (error) {
        this.logger.debug('Permission notification failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // List permissions
    this.app.get('/api/permissions', async (req, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('List permissions request', {
        requestId,
        query: req.query
      });
      
      try {
        const { streamingId, status } = req.query as { streamingId?: string; status?: 'pending' | 'approved' | 'denied' };
        
        const permissions = this.permissionTracker.getPermissionRequests({ streamingId, status });
        
        this.logger.debug('Permissions listed successfully', {
          requestId,
          count: permissions.length,
          filter: { streamingId, status }
        });
        
        res.json({ permissions });
      } catch (error) {
        this.logger.debug('List permissions failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });
  }

  private setupFileSystemRoutes(): void {
    // List directory contents
    this.app.get('/api/filesystem/list', async (req: Request<{}, FileSystemListResponse, {}, any>, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('List directory request', {
        requestId,
        path: req.query.path,
        recursive: req.query.recursive,
        respectGitignore: req.query.respectGitignore
      });
      
      try {
        // Validate required parameters
        if (!req.query.path) {
          throw new CCUIError('MISSING_PATH', 'path query parameter is required', 400);
        }
        
        const result = await this.fileSystemService.listDirectory(
          req.query.path as string,
          req.query.recursive === 'true',
          req.query.respectGitignore === 'true'
        );
        
        this.logger.debug('Directory listed successfully', {
          requestId,
          path: result.path,
          entryCount: result.entries.length
        });
        
        res.json(result);
      } catch (error) {
        this.logger.debug('List directory failed', {
          requestId,
          path: req.query.path,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });

    // Read file contents
    this.app.get('/api/filesystem/read', async (req: Request<{}, FileSystemReadResponse, {}, FileSystemReadQuery>, res, next) => {
      const requestId = (req as any).requestId;
      this.logger.debug('Read file request', {
        requestId,
        path: req.query.path
      });
      
      try {
        // Validate required parameters
        if (!req.query.path) {
          throw new CCUIError('MISSING_PATH', 'path query parameter is required', 400);
        }
        
        const result = await this.fileSystemService.readFile(req.query.path);
        
        this.logger.debug('File read successfully', {
          requestId,
          path: result.path,
          size: result.size
        });
        
        res.json(result);
      } catch (error) {
        this.logger.debug('Read file failed', {
          requestId,
          path: req.query.path,
          error: error instanceof Error ? error.message : String(error)
        });
        next(error);
      }
    });
  }

  private setupLogRoutes(): void {
    // Get recent logs
    this.app.get('/api/logs/recent', (req, res) => {
      const requestId = (req as any).requestId;
      const limitParam = req.query.limit as string;
      const limit = limitParam !== undefined ? parseInt(limitParam) : 100;
      const validLimit = isNaN(limit) ? 100 : limit;
      
      this.logger.debug('Get recent logs request', {
        requestId,
        limit: validLimit
      });
      
      try {
        const logs = logStreamBuffer.getRecentLogs(validLimit);
        res.json({ logs });
      } catch (error) {
        this.logger.error('Failed to get recent logs', error, { requestId });
        res.status(500).json({ error: 'Failed to retrieve logs' });
      }
    });
    
    // Stream logs via SSE
    this.app.get('/api/logs/stream', (req, res) => {
      const requestId = (req as any).requestId;
      
      this.logger.debug('Log stream connection request', {
        requestId,
        headers: {
          'accept': req.headers.accept,
          'user-agent': req.headers['user-agent']
        }
      });
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable proxy buffering
      });
      
      // Send initial connection confirmation
      res.write('data: {"type":"connected"}\n\n');
      
      // Create log listener
      const logListener = (logLine: string) => {
        res.write(`data: ${logLine}\n\n`);
      };
      
      // Subscribe to log events
      logStreamBuffer.on('log', logListener);
      
      // Handle client disconnect
      req.on('close', () => {
        this.logger.debug('Log stream connection closed', { requestId });
        logStreamBuffer.removeListener('log', logListener);
      });
      
      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 30000);
      
      // Clean up heartbeat on disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
      });
    });
  }

  private setupPermissionTrackerIntegration(): void {
    this.logger.debug('Setting up PermissionTracker integration');
    
    // Forward permission events to stream
    this.permissionTracker.on('permission_request', (request: PermissionRequest) => {
      this.logger.debug('Permission request event received', {
        id: request.id,
        toolName: request.toolName,
        streamingId: request.streamingId
      });
      
      // Broadcast to the appropriate streaming session
      if (request.streamingId && request.streamingId !== 'unknown') {
        const event: StreamEvent = {
          type: 'permission_request',
          data: request,
          streamingId: request.streamingId,
          timestamp: new Date().toISOString()
        };
        
        this.streamManager.broadcast(request.streamingId, event);
      }
    });
    
    this.logger.debug('PermissionTracker integration setup complete');
  }
}