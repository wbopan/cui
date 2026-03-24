import { useState, useEffect } from 'react';
import type { ChatMessage } from '../types';
import type { SwarmState, AgentInfo } from '../components/SwarmOrchestration/SwarmOrchestrationPanel';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

// Claude-flow tool names that trigger swarm visualization
const SWARM_TOOLS = [
  'swarm_init',
  'agent_spawn',
  'task_orchestrate',
  'swarm_coordinate',
  'hive_mind_spawn',
];

const AGENT_TOOLS = [
  'agent_spawn',
  'agent_status',
  'agent_assign',
];

const MEMORY_TOOLS = [
  'memory_store',
  'memory_search',
  'memory_retrieve',
  'memory_query',
];

/**
 * Hook to track and visualize claude-flow swarm orchestration
 */
export function useSwarmOrchestration(messages: ChatMessage[]): SwarmState {
  const [swarmState, setSwarmState] = useState<SwarmState>({
    isActive: false,
    totalAgents: 0,
    activeAgents: 0,
    agents: [],
  });

  // Process messages to extract swarm orchestration state
  useEffect(() => {
    let isActive = false;
    const agents = new Map<string, AgentInfo>();
    let currentOperation: string | undefined;

    // Process messages in order to build up swarm state
    for (const message of messages) {
      if (message.type !== 'assistant') continue;

      const content = Array.isArray(message.content)
        ? message.content
        : typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : [];

      for (const block of content) {
        if (block.type === 'tool_use') {
          const toolUse = block as ToolUseBlock;

          // Check if this is a swarm initialization
          if (toolUse.name === 'swarm_init' || toolUse.name === 'hive_mind_spawn') {
            isActive = true;
            currentOperation = toolUse.input.task as string || 'Initializing swarm';
          }

          // Check for agent spawning
          if (toolUse.name === 'agent_spawn') {
            const agentId = toolUse.id;
            const agentName = toolUse.input.agent_type as string || 'Agent';
            const agentRole = toolUse.input.role as string || toolUse.input.agent_type as string || 'Worker';

            agents.set(agentId, {
              id: agentId,
              name: agentName,
              role: agentRole,
              status: 'active',
              currentTask: toolUse.input.task as string,
            });
          }

          // Check for task orchestration
          if (toolUse.name === 'task_orchestrate') {
            currentOperation = `Orchestrating: ${toolUse.input.task as string || 'multiple tasks'}`;

            // Update agent tasks if specified
            if (toolUse.input.agents && Array.isArray(toolUse.input.agents)) {
              (toolUse.input.agents as any[]).forEach((agentTask: any) => {
                const agentId = agentTask.agent_id || agentTask.id;
                if (agents.has(agentId)) {
                  const agent = agents.get(agentId)!;
                  agents.set(agentId, {
                    ...agent,
                    currentTask: agentTask.task,
                    status: 'active',
                  });
                }
              });
            }
          }

          // Detect swarm completion
          if (toolUse.name === 'swarm_complete' || toolUse.name === 'task_complete') {
            // Mark agents as completed
            agents.forEach((agent, id) => {
              if (agent.status === 'active') {
                agents.set(id, { ...agent, status: 'completed' });
              }
            });
          }
        }
      }
    }

    // Calculate active agents
    const agentsList = Array.from(agents.values());
    const activeAgents = agentsList.filter(a => a.status === 'active').length;

    setSwarmState({
      isActive,
      totalAgents: agents.size,
      activeAgents,
      currentOperation,
      agents: agentsList,
    });
  }, [messages]);

  return swarmState;
}

/**
 * Helper to detect if a tool is a claude-flow orchestration tool
 */
export function isClaudeFlowTool(toolName: string): boolean {
  return (
    SWARM_TOOLS.includes(toolName) ||
    AGENT_TOOLS.includes(toolName) ||
    MEMORY_TOOLS.includes(toolName) ||
    toolName.startsWith('swarm_') ||
    toolName.startsWith('agent_') ||
    toolName.startsWith('memory_') ||
    toolName.startsWith('neural_') ||
    toolName.startsWith('github_') ||
    toolName.startsWith('mcp__claude-flow__')
  );
}

/**
 * Get a friendly label for claude-flow tools
 */
export function getClaudeFlowToolLabel(toolName: string): string {
  // Remove MCP prefix if present
  const cleanName = toolName.replace('mcp__claude-flow__', '');

  // Convert snake_case to Title Case
  return cleanName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
