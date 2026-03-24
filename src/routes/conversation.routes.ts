import { Router, Request } from 'express';
import * as path from 'path';
import archiver from 'archiver';
import {
  StartConversationRequest,
  StartConversationResponse,
  ConversationListQuery,
  ConversationDetailsResponse,
  CUIError,
  SessionRenameRequest,
  SessionRenameResponse,
  SessionUpdateRequest,
  SessionUpdateResponse,
  ConversationMessage,
  ConversationSummary,
  SessionInfo,
  BulkDownloadFilesRequest
} from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { ClaudeProcessManager } from '@/services/claude-process-manager.js';
import { ClaudeHistoryReader } from '@/services/claude-history-reader.js';
import { SessionInfoService } from '@/services/session-info-service.js';
import { ConversationStatusManager } from '@/services/conversation-status-manager.js';
import { FileSystemService } from '@/services/file-system-service.js';
import { createLogger } from '@/services/logger.js';
import { ToolMetricsService } from '@/services/ToolMetricsService.js';

export function createConversationRoutes(
  processManager: ClaudeProcessManager,
  historyReader: ClaudeHistoryReader,
  statusTracker: ConversationStatusManager,
  sessionInfoService: SessionInfoService,
  conversationStatusManager: ConversationStatusManager,
  toolMetricsService: ToolMetricsService,
  fileSystemService: FileSystemService
): Router {
  const router = Router();
  const logger = createLogger('ConversationRoutes');

  // Start new conversation (also handles resume if resumedSessionId is provided)
  router.post('/start', async (req: Request<Record<string, never>, StartConversationResponse, StartConversationRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const isResume = !!req.body.resumedSessionId;
    
    logger.debug('Start conversation request', {
      requestId,
      isResume,
      resumedSessionId: req.body.resumedSessionId,
      body: {
        ...req.body,
        initialPrompt: req.body.initialPrompt ? `${req.body.initialPrompt.substring(0, 50)}...` : undefined
      }
    });
    
    try {
      // Validate required fields
      if (!req.body.workingDirectory) {
        throw new CUIError('MISSING_WORKING_DIRECTORY', 'workingDirectory is required', 400);
      }
      if (!req.body.initialPrompt) {
        throw new CUIError('MISSING_INITIAL_PROMPT', 'initialPrompt is required', 400);
      }
      
      // Validate permissionMode if provided
      if (req.body.permissionMode) {
        const validModes = ['acceptEdits', 'bypassPermissions', 'default', 'plan'];
        if (!validModes.includes(req.body.permissionMode)) {
          throw new CUIError('INVALID_PERMISSION_MODE', `permissionMode must be one of: ${validModes.join(', ')}`, 400);
        }
      }
      
      // If resuming, fetch previous messages and session info
      let previousMessages: ConversationMessage[] = [];
      let inheritedPermissionMode: string | undefined;
      
      if (req.body.resumedSessionId) {
        try {
          previousMessages = await historyReader.fetchConversation(req.body.resumedSessionId);
          logger.debug('Fetched previous session messages', {
            requestId,
            originalSessionId: req.body.resumedSessionId,
            messageCount: previousMessages.length
          });
        } catch (error) {
          logger.warn('Failed to fetch previous session messages', {
            requestId,
            originalSessionId: req.body.resumedSessionId,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue without previous messages - not a fatal error
        }
        
        // Fetch permission mode from session info if not provided
        if (!req.body.permissionMode) {
          try {
            const sessionInfo = await sessionInfoService.getSessionInfo(req.body.resumedSessionId);
            inheritedPermissionMode = sessionInfo.permission_mode;
            logger.debug('Retrieved permission mode from session info', {
              requestId,
              originalSessionId: req.body.resumedSessionId,
              permissionMode: inheritedPermissionMode
            });
          } catch (error) {
            logger.warn('Failed to fetch permission mode from session info', {
              requestId,
              originalSessionId: req.body.resumedSessionId,
              error: error instanceof Error ? error.message : String(error)
            });
            // Continue without permission mode - will use default
          }
        }
      }
      
      // Prepare config with previous messages if resuming
      const conversationConfig = {
        ...req.body,
        previousMessages: previousMessages.length > 0 ? previousMessages : undefined,
        permissionMode: req.body.permissionMode || inheritedPermissionMode
      };
      
      const { streamingId, systemInit } = await processManager.startConversation(conversationConfig);
      
      // Update original session with continuation session ID if resuming
      if (req.body.resumedSessionId) {
        try {
          await sessionInfoService.updateSessionInfo(req.body.resumedSessionId, {
            continuation_session_id: systemInit.session_id
          });
          logger.debug('Updated original session with continuation ID', {
            originalSessionId: req.body.resumedSessionId,
            continuationSessionId: systemInit.session_id
          });
        } catch (error) {
          logger.warn('Failed to update original session with continuation ID', {
            originalSessionId: req.body.resumedSessionId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // Register the resumed session with conversation status manager including previous messages
        try {
          conversationStatusManager.registerActiveSession(
            streamingId,
            systemInit.session_id,
            {
              initialPrompt: req.body.initialPrompt,
              workingDirectory: systemInit.cwd,
              model: systemInit.model,
              inheritedMessages: previousMessages.length > 0 ? previousMessages : undefined
            }
          );
          logger.debug('Registered resumed session with inherited messages', {
            requestId,
            newSessionId: systemInit.session_id,
            streamingId,
            inheritedMessageCount: previousMessages.length
          });
        } catch (error) {
          logger.warn('Failed to register resumed session with status manager', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Store permission mode in session info if provided
      if (conversationConfig.permissionMode) {
        try {
          await sessionInfoService.updateSessionInfo(systemInit.session_id, {
            permission_mode: conversationConfig.permissionMode
          });
          logger.debug('Stored permission mode in session info', {
            sessionId: systemInit.session_id,
            permissionMode: conversationConfig.permissionMode
          });
        } catch (error) {
          logger.warn('Failed to store permission mode in session info', {
            sessionId: systemInit.session_id,
            permissionMode: conversationConfig.permissionMode,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      logger.debug('Conversation started successfully', {
        requestId,
        isResume,
        resumedSessionId: req.body.resumedSessionId,
        streamingId,
        sessionId: systemInit.session_id,
        model: systemInit.model,
        cwd: systemInit.cwd,
        previousMessageCount: previousMessages.length
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
      logger.debug('Start conversation failed', {
        requestId,
        isResume,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });


  // List conversations
  router.get('/', async (req: Request<Record<string, never>, { conversations: ConversationSummary[]; total: number }, Record<string, never>, ConversationListQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    logger.debug('List conversations request', {
      requestId,
      query: req.query
    });
    
    try {
      const result = await historyReader.listConversations(req.query);
      
      // Update status for each conversation based on active streams
      const conversationsWithStatus = result.conversations.map(conversation => {
        const status = statusTracker.getConversationStatus(conversation.sessionId);
        const baseConversation = {
          ...conversation,
          status
        };
        
        // Add toolMetrics if available
        const metrics = toolMetricsService.getMetrics(conversation.sessionId);
        if (metrics) {
          baseConversation.toolMetrics = metrics;
        }
        
        // Add streamingId if conversation is ongoing
        if (status === 'ongoing') {
          const streamingId = statusTracker.getStreamingId(conversation.sessionId);
          if (streamingId) {
            return { ...baseConversation, streamingId };
          }
        }
        
        return baseConversation;
      });

      // Get all active sessions and add optimistic conversations for those not in history
      const existingSessionIds = new Set(conversationsWithStatus.map(c => c.sessionId));
      const conversationsNotInHistory = conversationStatusManager.getConversationsNotInHistory(existingSessionIds);

      // Combine history conversations with active ones not in history
      const allConversations = [...conversationsWithStatus, ...conversationsNotInHistory];

      // Ensure session info entries exist for all conversations
      try {
        await sessionInfoService.syncMissingSessions(allConversations.map(c => c.sessionId));
      } catch (syncError) {
        logger.debug('Failed to sync session info', {
          requestId,
          error: syncError instanceof Error ? syncError.message : String(syncError)
        });
      }

      logger.debug('Conversations listed successfully', {
        requestId,
        conversationCount: allConversations.length,
        historyConversations: conversationsWithStatus.length,
        conversationsNotInHistory: conversationsNotInHistory.length,
        totalFound: result.total,
        activeConversations: allConversations.filter(c => c.status === 'ongoing').length
      });
      
      res.json({
        conversations: allConversations,
        total: result.total + conversationsNotInHistory.length // Update total to include conversations not in history
      });
    } catch (error) {
      logger.debug('List conversations failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Get conversation details
  router.get('/:sessionId', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { sessionId } = req.params;
    
    logger.debug('Get conversation details request', {
      requestId,
      sessionId
    });
    
    try {
      // First try to fetch from history
      try {
        const messages = await historyReader.fetchConversation(req.params.sessionId);
        const metadata = await historyReader.getConversationMetadata(req.params.sessionId);
        
        if (!metadata) {
          throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
        }
        
        const response: ConversationDetailsResponse = {
          messages,
          summary: metadata.summary,
          projectPath: metadata.projectPath,
          metadata: {
            totalDuration: metadata.totalDuration,
            model: metadata.model
          }
        };
        
        // Add toolMetrics if available
        const metrics = toolMetricsService.getMetrics(req.params.sessionId);
        if (metrics) {
          response.toolMetrics = metrics;
        }
        
        logger.debug('Conversation details retrieved from history', {
          requestId,
          sessionId,
          messageCount: response.messages.length,
          hasSummary: !!response.summary,
          projectPath: response.projectPath
        });
        
        res.json(response);
      } catch (historyError) {
        // If not found in history, check if it's an active session
        if (historyError instanceof CUIError && historyError.code === 'CONVERSATION_NOT_FOUND') {
          const activeDetails = conversationStatusManager.getActiveConversationDetails(sessionId);
          
          if (activeDetails) {
            logger.debug('Conversation details created for active session', {
              requestId,
              sessionId,
              projectPath: activeDetails.projectPath
            });
            
            res.json(activeDetails);
          } else {
            // Not found in history and not active
            throw historyError;
          }
        } else {
          // Other errors, re-throw
          throw historyError;
        }
      }
    } catch (error) {
      logger.debug('Get conversation details failed', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Stop conversation
  router.post('/:streamingId/stop', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { streamingId } = req.params;
    
    logger.debug('Stop conversation request', {
      requestId,
      streamingId
    });
    
    try {
      const success = await processManager.stopConversation(streamingId);
      
      logger.debug('Stop conversation result', {
        requestId,
        streamingId,
        success
      });
      
      res.json({ success });
    } catch (error) {
      logger.debug('Stop conversation failed', {
        requestId,
        streamingId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Rename session (update custom name)
  router.put('/:sessionId/rename', async (req: Request<{ sessionId: string }, SessionRenameResponse, SessionRenameRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { sessionId } = req.params;
    const { customName } = req.body;
    
    logger.debug('Rename session request', {
      requestId,
      sessionId,
      customName
    });
    
    try {
      // Validate required fields
      if (!sessionId || !sessionId.trim()) {
        throw new CUIError('MISSING_SESSION_ID', 'sessionId is required', 400);
      }
      if (customName === undefined || customName === null) {
        throw new CUIError('MISSING_CUSTOM_NAME', 'customName is required', 400);
      }
      
      // Validate custom name length (reasonable limit)
      if (customName.length > 200) {
        throw new CUIError('CUSTOM_NAME_TOO_LONG', 'customName must be 200 characters or less', 400);
      }
      
      // Check if session exists by trying to get its metadata
      const metadata = await historyReader.getConversationMetadata(sessionId);
      if (!metadata) {
        throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
      }
      
      // Update custom name
      await sessionInfoService.updateCustomName(sessionId, customName.trim());
      
      logger.info('Session renamed successfully', {
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
      logger.debug('Rename session failed', {
        requestId,
        sessionId,
        customName,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Update session info (replaces rename endpoint)
  router.put('/:sessionId/update', async (req: Request<{ sessionId: string }, SessionUpdateResponse, SessionUpdateRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { sessionId } = req.params;
    const updates = req.body;
    
    logger.debug('Update session request', {
      requestId,
      sessionId,
      updates
    });
    
    try {
      // Validate sessionId
      if (!sessionId || sessionId.trim() === '') {
        logger.debug('Invalid session ID', { requestId, sessionId });
        return res.status(400).json({
          success: false,
          sessionId: '',
          updatedFields: {} as SessionInfo,
          error: 'Session ID is required'
        } as SessionUpdateResponse & { error: string });
      }
      
      // Check if session exists
      const { conversations } = await historyReader.listConversations();
      const sessionExists = conversations.some(conv => conv.sessionId === sessionId);
      
      if (!sessionExists) {
        logger.debug('Session not found', { requestId, sessionId });
        return res.status(404).json({
          success: false,
          sessionId,
          updatedFields: {} as SessionInfo,
          error: 'Conversation session not found'
        } as SessionUpdateResponse & { error: string });
      }
      
      // Validate fields if provided
      if (updates.customName !== undefined && updates.customName.length > 200) {
        logger.debug('Custom name too long', { requestId, length: updates.customName.length });
        return res.status(400).json({
          success: false,
          sessionId,
          updatedFields: {} as SessionInfo,
          error: 'Custom name must be 200 characters or less'
        } as SessionUpdateResponse & { error: string });
      }
      
      // Prepare updates object - map camelCase to snake_case
      const sessionUpdates: Partial<SessionInfo> = {};
      if (updates.customName !== undefined) sessionUpdates.custom_name = updates.customName.trim();
      if (updates.pinned !== undefined) sessionUpdates.pinned = updates.pinned;
      if (updates.archived !== undefined) sessionUpdates.archived = updates.archived;
      if (updates.continuationSessionId !== undefined) sessionUpdates.continuation_session_id = updates.continuationSessionId;
      if (updates.initialCommitHead !== undefined) sessionUpdates.initial_commit_head = updates.initialCommitHead;
      if (updates.permissionMode !== undefined) {
        // Validate permission mode
        const validModes = ['acceptEdits', 'bypassPermissions', 'default', 'plan'];
        if (!validModes.includes(updates.permissionMode)) {
          logger.debug('Invalid permission mode', { requestId, permissionMode: updates.permissionMode });
          return res.status(400).json({
            success: false,
            sessionId,
            updatedFields: {} as SessionInfo,
            error: `Permission mode must be one of: ${validModes.join(', ')}`
          } as SessionUpdateResponse & { error: string });
        }
        sessionUpdates.permission_mode = updates.permissionMode;
      }
      
      // Update session info
      const updatedFields = await sessionInfoService.updateSessionInfo(sessionId, sessionUpdates);
      
      logger.info('Session updated successfully', {
        requestId,
        sessionId,
        updatedFields
      });
      
      res.json({
        success: true,
        sessionId,
        updatedFields
      });
    } catch (error) {
      logger.debug('Update session failed', {
        requestId,
        sessionId,
        updates,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Archive all sessions
  router.post('/archive-all', async (req: RequestWithRequestId, res, next) => {
    const requestId = req.requestId;

    logger.debug('Archive all sessions request', {
      requestId
    });

    try {
      // Archive all sessions
      const archivedCount = await sessionInfoService.archiveAllSessions();

      logger.info('All sessions archived successfully', {
        requestId,
        archivedCount
      });

      res.json({
        success: true,
        archivedCount,
        message: `Successfully archived ${archivedCount} session${archivedCount !== 1 ? 's' : ''}`
      });
    } catch (error) {
      logger.debug('Archive all sessions failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  // Bulk download files from conversation as ZIP
  router.post('/:sessionId/download-files', async (req: Request<{ sessionId: string }, never, BulkDownloadFilesRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { sessionId } = req.params;
    const { files } = req.body;

    logger.debug('Bulk download files request', {
      requestId,
      sessionId,
      fileCount: files?.length
    });

    try {
      // Validate required parameters
      if (!sessionId || sessionId.trim() === '') {
        throw new CUIError('MISSING_SESSION_ID', 'sessionId is required', 400);
      }
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new CUIError('MISSING_FILES', 'files array is required and must not be empty', 400);
      }

      // Get conversation metadata to find the cwd
      const metadata = await historyReader.getConversationMetadata(sessionId);
      if (!metadata) {
        throw new CUIError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
      }

      // Get the cwd from the first message of the conversation
      const messages = await historyReader.fetchConversation(sessionId);
      if (messages.length === 0) {
        throw new CUIError('NO_MESSAGES', 'No messages found in conversation', 404);
      }

      const conversationCwd = messages[0].cwd || metadata.projectPath;
      if (!conversationCwd) {
        throw new CUIError('NO_CWD', 'Could not determine conversation working directory', 400);
      }

      // Normalize cwd for comparison
      const normalizedCwd = path.normalize(conversationCwd);

      // Validate all file paths are within conversation's cwd
      const invalidFiles: string[] = [];
      for (const filePath of files) {
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(normalizedCwd)) {
          invalidFiles.push(filePath);
        }
      }

      if (invalidFiles.length > 0) {
        logger.warn('Bulk download attempt with files outside conversation cwd', {
          requestId,
          sessionId,
          invalidFiles,
          conversationCwd: normalizedCwd
        });
        throw new CUIError(
          'FILES_OUTSIDE_CWD',
          `Some files are outside the conversation working directory: ${invalidFiles.join(', ')}`,
          403
        );
      }

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Set response headers for ZIP download
      const zipFilename = `${sessionId}-files.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      // Pipe archive to response
      archive.pipe(res);

      // Track successful and failed files
      const successfulFiles: string[] = [];
      const failedFiles: Array<{ path: string; error: string }> = [];

      // Add each file to the archive
      for (const filePath of files) {
        try {
          const fileData = await fileSystemService.downloadFile(filePath);

          // Use relative path within ZIP
          const relativePath = path.relative(normalizedCwd, filePath);

          archive.append(fileData.buffer, { name: relativePath });
          successfulFiles.push(filePath);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn('Failed to add file to ZIP', {
            requestId,
            sessionId,
            filePath,
            error: errorMsg
          });
          failedFiles.push({ path: filePath, error: errorMsg });
        }
      }

      // If no files were successfully added, return error
      if (successfulFiles.length === 0) {
        throw new CUIError(
          'NO_FILES_ADDED',
          'Failed to add any files to the archive',
          500
        );
      }

      // Add a metadata file if there were any failures
      if (failedFiles.length > 0) {
        const metadataContent = JSON.stringify({
          sessionId,
          generatedAt: new Date().toISOString(),
          successfulFiles,
          failedFiles
        }, null, 2);
        archive.append(metadataContent, { name: '_download-metadata.json' });
      }

      // Finalize the archive
      await archive.finalize();

      logger.info('Bulk download completed', {
        requestId,
        sessionId,
        totalFiles: files.length,
        successfulFiles: successfulFiles.length,
        failedFiles: failedFiles.length,
        zipFilename
      });

    } catch (error) {
      logger.debug('Bulk download files failed', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      next(error);
    }
  });

  return router;
}