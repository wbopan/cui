import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CCUIServer } from '@/ccui-server';
import { SessionDepsService } from '@/services/session-deps-service';
import { ClaudeHistoryReader } from '@/services/claude-history-reader';
import type { ConversationSummary, ConversationMessage } from '@/types';

describe('Session Dependencies Integration', () => {
  let server: CCUIServer;
  let testHomeDir: string;
  let sessionDepsService: SessionDepsService;

  beforeEach(async () => {
    // Create a temporary test directory
    testHomeDir = path.join(os.tmpdir(), 'ccui-test-' + Date.now());
    fs.mkdirSync(testHomeDir, { recursive: true });
    fs.mkdirSync(path.join(testHomeDir, '.ccui'), { recursive: true });
    fs.mkdirSync(path.join(testHomeDir, '.claude', 'projects'), { recursive: true });

    // Mock os.homedir to return our test directory
    jest.spyOn(os, 'homedir').mockReturnValue(testHomeDir);

    // Reset singleton instances
    SessionDepsService.resetInstance();
    sessionDepsService = SessionDepsService.getInstance();
    
    // Re-initialize paths with test directory
    sessionDepsService.reinitializePaths();

    // Create server instance
    server = new CCUIServer({ 
      port: 0, // Use random port
      host: 'localhost',
      logLevel: 'silent'
    });

    await server.start();
    
    // Manually initialize SessionDepsService for these tests since it's skipped in test mode
    await sessionDepsService.initialize();
  });

  afterEach(async () => {
    await server.stop();
    
    // Clean up test directory
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    
    // Restore mocks
    jest.restoreAllMocks();
    
    // Reset singleton
    SessionDepsService.resetInstance();
  });

  it('should enhance conversations API with leaf_session and hash', async () => {
    // Create mock conversation data in Claude history format
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Create two sessions where session-2 is a continuation of session-1
    const session1Data = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'session-1',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'session-1',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: { 
          role: 'assistant', 
          content: [{ type: 'text', text: 'Hi there!' }],
          model: 'claude-3-sonnet'
        },
        costUSD: 0.01,
        durationMs: 1000
      },
      {
        type: 'summary',
        leafUuid: 'msg-2',
        summary: 'Test conversation 1'
      }
    ];

    const session2Data = [
      // Same first two messages as session-1
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'session-2',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'session-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: { 
          role: 'assistant', 
          content: [{ type: 'text', text: 'Hi there!' }],
          model: 'claude-3-sonnet'
        },
        costUSD: 0.01,
        durationMs: 1000
      },
      // Additional message in session-2
      {
        type: 'user',
        uuid: 'msg-3',
        sessionId: 'session-2',
        parentUuid: 'msg-2',
        timestamp: '2024-01-01T00:02:00Z',
        message: { role: 'user', content: 'How are you?' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-4',
        sessionId: 'session-2',
        parentUuid: 'msg-3',
        timestamp: '2024-01-01T00:03:00Z',
        message: { 
          role: 'assistant', 
          content: [{ type: 'text', text: 'I am doing well, thank you!' }],
          model: 'claude-3-sonnet'
        },
        costUSD: 0.02,
        durationMs: 1500
      },
      {
        type: 'summary',
        leafUuid: 'msg-4',
        summary: 'Test conversation 2 - extended'
      }
    ];

    // Write session data to JSONL files
    const session1Content = session1Data.map(item => JSON.stringify(item)).join('\n');
    const session2Content = session2Data.map(item => JSON.stringify(item)).join('\n');
    
    fs.writeFileSync(path.join(projectDir, 'session-1.jsonl'), session1Content);
    fs.writeFileSync(path.join(projectDir, 'session-2.jsonl'), session2Content);

    // Make API request to list conversations
    const response = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    expect(response.body).toHaveProperty('conversations');
    expect(response.body.conversations).toHaveLength(2);

    // Find the sessions in the response
    const session1 = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'session-1');
    const session2 = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'session-2');

    expect(session1).toBeDefined();
    expect(session2).toBeDefined();

    // Verify session dependencies were calculated
    expect(session1.leaf_session).toBe('session-2'); // session-1's nearest leaf is session-2
    expect(session2.leaf_session).toBe('session-2'); // session-2 is a leaf itself
    
    // Verify hashes are present and different
    expect(session1.hash).toBeTruthy();
    expect(session2.hash).toBeTruthy();
    expect(session1.hash).not.toBe(session2.hash);

    // Verify session-2's hash is based on more messages
    expect(session2.messageCount).toBe(4);
    expect(session1.messageCount).toBe(2);
  });

  it('should persist dependencies across service restarts', async () => {
    // Create initial session data
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'persist-test',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Persistence test' },
        cwd: '/test/project'
      }
    ];

    fs.writeFileSync(
      path.join(projectDir, 'persist-test.jsonl'), 
      sessionData.map(item => JSON.stringify(item)).join('\n')
    );

    // First API call to trigger dependency calculation
    const response1 = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    const session1 = response1.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-test');
    expect(session1).toBeDefined();
    expect(session1.hash).toBeTruthy();
    const originalHash = session1.hash;

    // Verify the database file was created
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    expect(fs.existsSync(dbPath)).toBe(true);

    // Stop the server
    await server.stop();

    // Create a new server instance (simulating restart)
    server = new CCUIServer({ 
      port: 0,
      host: 'localhost',
      logLevel: 'silent'
    });
    await server.start();

    // Make another API call
    const response2 = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    const session2 = response2.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-test');
    expect(session2).toBeDefined();
    expect(session2.hash).toBe(originalHash); // Hash should be the same

    // Verify no unnecessary recalculation occurred by checking the database wasn't modified
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(dbContent.sessions['persist-test']).toBeDefined();
    expect(dbContent.sessions['persist-test'].end_hash).toBe(originalHash);
  });

  it('should handle concurrent updates safely', async () => {
    // Create multiple sessions
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionCount = 10;
    for (let i = 0; i < sessionCount; i++) {
      const sessionData = [
        {
          type: 'user',
          uuid: `msg-${i}`,
          sessionId: `concurrent-${i}`,
          timestamp: `2024-01-01T00:0${i}:00Z`,
          message: { role: 'user', content: `Message ${i}` },
          cwd: '/test/project'
        }
      ];

      fs.writeFileSync(
        path.join(projectDir, `concurrent-${i}.jsonl`),
        sessionData.map(item => JSON.stringify(item)).join('\n')
      );
    }

    // Make multiple concurrent requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        request(server['app'])
          .get('/api/conversations')
          .expect(200)
      );
    }

    const responses = await Promise.all(requests);

    // All responses should be successful and contain the same data
    const firstResponse = responses[0].body;
    expect(firstResponse.conversations.length).toBeGreaterThanOrEqual(sessionCount);

    // Verify all responses are consistent
    for (let i = 1; i < responses.length; i++) {
      expect(responses[i].body.conversations.length).toBe(firstResponse.conversations.length);
      
      // Check that the same sessions have the same hashes
      for (const conv of firstResponse.conversations) {
        const matchingConv = responses[i].body.conversations.find(
          (c: ConversationSummary) => c.sessionId === conv.sessionId
        );
        if (matchingConv) {
          expect(matchingConv.hash).toBe(conv.hash);
        }
      }
    }

    // Verify the database is in a consistent state
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(Object.keys(dbContent.sessions).length).toBeGreaterThanOrEqual(sessionCount);
  });

  it('should gracefully degrade on corruption', async () => {
    // Create a corrupted database file
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    fs.writeFileSync(dbPath, 'invalid json content');

    // Create valid session data
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'corruption-test',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Corruption test' },
        cwd: '/test/project'
      }
    ];

    fs.writeFileSync(
      path.join(projectDir, 'corruption-test.jsonl'),
      sessionData.map(item => JSON.stringify(item)).join('\n')
    );

    // API should still work despite corrupted database
    const response = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    expect(response.body.conversations).toBeDefined();
    const session = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'corruption-test');
    expect(session).toBeDefined();
    
    // The service should recover from corruption and calculate values correctly
    expect(session.leaf_session).toBe('corruption-test');
    // The hash should be calculated even if the initial database was corrupted
    expect(session.hash).toBeTruthy();
    expect(session.hash).not.toBe('');
  });

  it('should maintain consistency with claude history', async () => {
    // Create a complex session tree
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Root session
    const rootData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'root',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      }
    ];

    // Branch 1 (extends root)
    const branch1Data = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'branch-1',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'branch-1',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: { role: 'assistant', content: 'Branch 1 response' }
      }
    ];

    // Branch 2 (also extends root)
    const branch2Data = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'branch-2',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-3',
        sessionId: 'branch-2',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:02:00Z',
        message: { role: 'assistant', content: 'Branch 2 response' }
      }
    ];

    fs.writeFileSync(path.join(projectDir, 'root.jsonl'), rootData.map(item => JSON.stringify(item)).join('\n'));
    fs.writeFileSync(path.join(projectDir, 'branch-1.jsonl'), branch1Data.map(item => JSON.stringify(item)).join('\n'));
    fs.writeFileSync(path.join(projectDir, 'branch-2.jsonl'), branch2Data.map(item => JSON.stringify(item)).join('\n'));

    // Get conversations via API
    const response = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    const root = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'root');
    const branch1 = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'branch-1');
    const branch2 = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'branch-2');

    expect(root).toBeDefined();
    expect(branch1).toBeDefined();
    expect(branch2).toBeDefined();

    // Verify message counts match Claude history
    expect(root.messageCount).toBe(1);
    expect(branch1.messageCount).toBe(2);
    expect(branch2.messageCount).toBe(2);

    // Verify tree structure is correct
    // Root should have one of the branches as its leaf (deterministic based on implementation)
    expect(['branch-1', 'branch-2']).toContain(root.leaf_session);
    
    // Branches should be their own leaves
    expect(branch1.leaf_session).toBe('branch-1');
    expect(branch2.leaf_session).toBe('branch-2');

    // Verify hashes are unique
    const hashes = [root.hash, branch1.hash, branch2.hash];
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(3);
  });

  it('should calculate correct dependencies for gap scenarios', async () => {
    // Test the specific gap scenario: A(1) -> B(1,2,3) where no session with (1,2) exists
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Session A with just one message
    const sessionAData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'gap-A',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Initial message' },
        cwd: '/test/project'
      }
    ];

    // Session B with three messages (same first message as A)
    const sessionBData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'gap-B',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Initial message' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'gap-B',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: { role: 'assistant', content: 'Response 1' }
      },
      {
        type: 'user',
        uuid: 'msg-3',
        sessionId: 'gap-B',
        parentUuid: 'msg-2',
        timestamp: '2024-01-01T00:02:00Z',
        message: { role: 'user', content: 'Follow-up' }
      }
    ];

    fs.writeFileSync(path.join(projectDir, 'gap-A.jsonl'), sessionAData.map(item => JSON.stringify(item)).join('\n'));
    fs.writeFileSync(path.join(projectDir, 'gap-B.jsonl'), sessionBData.map(item => JSON.stringify(item)).join('\n'));

    // Get conversations and verify dependency
    const response = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    const sessionA = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'gap-A');
    const sessionB = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'gap-B');

    expect(sessionA).toBeDefined();
    expect(sessionB).toBeDefined();

    // A should point to B as its leaf
    expect(sessionA.leaf_session).toBe('gap-B');
    expect(sessionB.leaf_session).toBe('gap-B');

    // Read the database to verify internal structure
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // B should have A as its parent
    expect(dbContent.sessions['gap-B'].parent_session).toBe('gap-A');
    expect(dbContent.sessions['gap-A'].children_sessions).toContain('gap-B');
  });
});