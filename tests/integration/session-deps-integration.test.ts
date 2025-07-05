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
          id: 'msg_01Example123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Hi there!' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
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
          id: 'msg_01Example123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Hi there!' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
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
          id: 'msg_01Example456',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'I am doing well, thank you!' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 15, output_tokens: 10 }
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
    
    // Verify that session-2's hash is built on top of session-1's messages
    // Since session-2 has the same first 2 messages, it should have session-1's hash as a prefix
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    const session1Info = dbContent.sessions['session-1'];
    const session2Info = dbContent.sessions['session-2'];
    
    // Session-1 has 2 messages, so 2 prefix hashes
    expect(session1Info.prefix_hashes).toHaveLength(2);
    // Session-2 has 4 messages, so 4 prefix hashes
    expect(session2Info.prefix_hashes).toHaveLength(4);
    
    // The first 2 prefix hashes of session-2 should match session-1's hashes
    expect(session2Info.prefix_hashes[0]).toBe(session1Info.prefix_hashes[0]);
    expect(session2Info.prefix_hashes[1]).toBe(session1Info.prefix_hashes[1]);
    
    // And session-1's end_hash should be session-2's second prefix hash
    expect(session1Info.end_hash).toBe(session2Info.prefix_hashes[1]);

    // Verify session-2's hash is based on more messages
    expect(session2.messageCount).toBe(4);
    expect(session1.messageCount).toBe(2);
  });

  it('should persist dependencies across service restarts', async () => {
    // Create a tree of related sessions to test relationship persistence
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Root session
    const rootData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'persist-root',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      }
    ];

    // Child session (continuation of root)
    const childData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'persist-child',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'persist-child',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: {
          id: 'msg_01PersistChild',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Child response' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
      }
    ];

    // Grandchild session (continuation of child)
    const grandchildData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'persist-grandchild',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Root message' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'persist-grandchild',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: {
          id: 'msg_01PersistChild',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Child response' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
      },
      {
        type: 'user',
        uuid: 'msg-3',
        sessionId: 'persist-grandchild',
        parentUuid: 'msg-2',
        timestamp: '2024-01-01T00:02:00Z',
        message: { role: 'user', content: 'Grandchild question' }
      }
    ];

    fs.writeFileSync(path.join(projectDir, 'persist-root.jsonl'), rootData.map(item => JSON.stringify(item)).join('\n'));
    fs.writeFileSync(path.join(projectDir, 'persist-child.jsonl'), childData.map(item => JSON.stringify(item)).join('\n'));
    fs.writeFileSync(path.join(projectDir, 'persist-grandchild.jsonl'), grandchildData.map(item => JSON.stringify(item)).join('\n'));

    // First API call to trigger dependency calculation
    const response1 = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    // Find all sessions and verify initial relationships
    const root1 = response1.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-root');
    const child1 = response1.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-child');
    const grandchild1 = response1.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-grandchild');

    expect(root1).toBeDefined();
    expect(child1).toBeDefined();
    expect(grandchild1).toBeDefined();

    // Verify relationships before restart
    expect(root1.leaf_session).toBe('persist-grandchild');
    expect(child1.leaf_session).toBe('persist-grandchild');
    expect(grandchild1.leaf_session).toBe('persist-grandchild');

    // Store original database content
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    expect(fs.existsSync(dbPath)).toBe(true);
    const originalDbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

    // Verify internal relationships
    expect(originalDbContent.sessions['persist-root'].children_sessions).toContain('persist-child');
    expect(originalDbContent.sessions['persist-child'].parent_session).toBe('persist-root');
    expect(originalDbContent.sessions['persist-child'].children_sessions).toContain('persist-grandchild');
    expect(originalDbContent.sessions['persist-grandchild'].parent_session).toBe('persist-child');

    // Stop the server
    await server.stop();

    // Reset singleton to simulate fresh start
    SessionDepsService.resetInstance();
    sessionDepsService = SessionDepsService.getInstance();
    sessionDepsService.reinitializePaths();

    // Create a new server instance (simulating restart)
    server = new CCUIServer({ 
      port: 0,
      host: 'localhost',
      logLevel: 'silent'
    });
    await server.start();
    
    // Manually initialize SessionDepsService again
    await sessionDepsService.initialize();

    // Make another API call
    const response2 = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    // Find all sessions after restart
    const root2 = response2.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-root');
    const child2 = response2.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-child');
    const grandchild2 = response2.body.conversations.find((c: ConversationSummary) => c.sessionId === 'persist-grandchild');

    // Verify relationships are preserved after restart
    expect(root2.leaf_session).toBe('persist-grandchild');
    expect(child2.leaf_session).toBe('persist-grandchild');
    expect(grandchild2.leaf_session).toBe('persist-grandchild');

    // Verify hashes are the same
    expect(root2.hash).toBe(root1.hash);
    expect(child2.hash).toBe(child1.hash);
    expect(grandchild2.hash).toBe(grandchild1.hash);

    // Verify database relationships are still intact
    const newDbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(newDbContent.sessions['persist-root'].children_sessions).toContain('persist-child');
    expect(newDbContent.sessions['persist-child'].parent_session).toBe('persist-root');
    expect(newDbContent.sessions['persist-child'].children_sessions).toContain('persist-grandchild');
    expect(newDbContent.sessions['persist-grandchild'].parent_session).toBe('persist-child');
  });

  it('should handle concurrent updates safely', async () => {
    // Create a base session tree that will be extended concurrently
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Base session
    const baseData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'concurrent-base',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Base message' },
        cwd: '/test/project'
      }
    ];

    fs.writeFileSync(
      path.join(projectDir, 'concurrent-base.jsonl'),
      baseData.map(item => JSON.stringify(item)).join('\n')
    );

    // Initial request to set up base session
    await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    // Now create multiple branches concurrently
    const branchPromises = [];
    const branchCount = 5;

    for (let i = 0; i < branchCount; i++) {
      branchPromises.push((async () => {
        // Each branch extends the base session
        const branchData = [
          {
            type: 'user',
            uuid: 'msg-1',
            sessionId: `concurrent-branch-${i}`,
            timestamp: '2024-01-01T00:00:00Z',
            message: { role: 'user', content: 'Base message' },
            cwd: '/test/project'
          },
          {
            type: 'assistant',
            uuid: `msg-branch-${i}`,
            sessionId: `concurrent-branch-${i}`,
            parentUuid: 'msg-1',
            timestamp: `2024-01-01T00:0${i+1}:00Z`,
            message: {
              id: `msg_01Branch${i}`,
              type: 'message',
              role: 'assistant',
              model: 'claude-3-sonnet-20240229',
              content: [{ type: 'text', text: `Branch ${i} response` }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 5 }
            }
          }
        ];

        // Write file
        await fs.promises.writeFile(
          path.join(projectDir, `concurrent-branch-${i}.jsonl`),
          branchData.map(item => JSON.stringify(item)).join('\n')
        );

        // Make API request to trigger dependency calculation
        return request(server['app'])
          .get('/api/conversations')
          .expect(200);
      })());
    }

    // Execute all branch creations concurrently
    const responses = await Promise.all(branchPromises);

    // All responses should be successful
    expect(responses.length).toBe(branchCount);
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    // Final request to get the complete state
    const finalResponse = await request(server['app'])
      .get('/api/conversations')
      .expect(200);

    const finalConversations = finalResponse.body.conversations;
    
    // Find base and all branches
    const base = finalConversations.find((c: ConversationSummary) => c.sessionId === 'concurrent-base');
    const branches = [];
    for (let i = 0; i < branchCount; i++) {
      const branch = finalConversations.find((c: ConversationSummary) => c.sessionId === `concurrent-branch-${i}`);
      if (branch) branches.push(branch);
    }

    // Verify all sessions exist
    expect(base).toBeDefined();
    expect(branches.length).toBe(branchCount);

    // Verify the base session's leaf is one of the branches
    expect(base.leaf_session).toMatch(/^concurrent-branch-\d$/);

    // Verify all branches are their own leaves
    branches.forEach(branch => {
      expect(branch.leaf_session).toBe(branch.sessionId);
    });

    // Verify database consistency
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

    // Base should have all branches as children
    expect(dbContent.sessions['concurrent-base'].children_sessions.length).toBe(branchCount);
    
    // Each branch should have base as parent
    for (let i = 0; i < branchCount; i++) {
      const branchSession = dbContent.sessions[`concurrent-branch-${i}`];
      expect(branchSession).toBeDefined();
      expect(branchSession.parent_session).toBe('concurrent-base');
    }

    // Verify no data corruption - all sessions should have valid structure
    Object.values(dbContent.sessions).forEach((session: any) => {
      expect(session.session_id).toBeDefined();
      expect(Array.isArray(session.prefix_hashes)).toBe(true);
      expect(session.end_hash).toBeDefined();
      expect(session.leaf_session).toBeDefined();
      expect(Array.isArray(session.children_sessions)).toBe(true);
    });
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
        message: {
          id: 'msg_01Branch1',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Branch 1 response' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
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
        message: {
          id: 'msg_01Branch2',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Branch 2 response' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
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

  it('should verify hash calculations are deterministic and correct', async () => {
    // Test that hash calculations are deterministic
    const projectDir = path.join(testHomeDir, '.claude', 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Create session with known content
    const sessionData = [
      {
        type: 'user',
        uuid: 'msg-1',
        sessionId: 'hash-test',
        timestamp: '2024-01-01T00:00:00Z',
        message: { role: 'user', content: 'Test message for hashing' },
        cwd: '/test/project'
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        sessionId: 'hash-test',
        parentUuid: 'msg-1',
        timestamp: '2024-01-01T00:01:00Z',
        message: {
          id: 'msg_01HashTest',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Response for hash test' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
      },
      {
        type: 'summary',
        leafUuid: 'msg-2',
        summary: 'Hash test conversation'
      }
    ];

    fs.writeFileSync(
      path.join(projectDir, 'hash-test.jsonl'),
      sessionData.map(item => JSON.stringify(item)).join('\n')
    );

    // Make multiple API calls to verify hashes are deterministic
    const hashes = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        // For subsequent iterations, clear the database to force recalculation
        const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      }

      const response = await request(server['app'])
        .get('/api/conversations')
        .expect(200);

      const session = response.body.conversations.find((c: ConversationSummary) => c.sessionId === 'hash-test');
      expect(session).toBeDefined();
      hashes.push(session.hash);
    }

    // All hashes should be identical
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);

    // Verify the hash is not empty
    expect(hashes[0]).toBeTruthy();
    expect(hashes[0].length).toBe(64); // SHA256 produces 64-character hex string

    // Now verify incremental hashing by checking the database
    const dbPath = path.join(testHomeDir, '.ccui', 'session-deps.json');
    const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const sessionInfo = dbContent.sessions['hash-test'];

    // Should have 2 prefix hashes for 2 messages
    expect(sessionInfo.prefix_hashes).toHaveLength(2);
    
    // Each prefix hash should be a valid SHA256 hash
    sessionInfo.prefix_hashes.forEach((hash: string) => {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    // The second hash should be different from the first (incremental)
    expect(sessionInfo.prefix_hashes[0]).not.toBe(sessionInfo.prefix_hashes[1]);
    
    // The end_hash should be the last prefix hash
    expect(sessionInfo.end_hash).toBe(sessionInfo.prefix_hashes[1]);
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
        message: {
          id: 'msg_01Gap1',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-sonnet-20240229',
          content: [{ type: 'text', text: 'Response 1' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        }
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