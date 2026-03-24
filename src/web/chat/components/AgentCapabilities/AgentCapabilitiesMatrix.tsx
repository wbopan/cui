import React, { useState } from 'react';
import { Star, Code, Database, TestTube, FileText, Shield, Paintbrush, Search } from 'lucide-react';
import type { AgentInfo } from '../SwarmOrchestration/SwarmOrchestrationPanel';

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'development' | 'testing' | 'analysis' | 'documentation' | 'security' | 'design';
}

export interface AgentWithCapabilities extends AgentInfo {
  capabilities: Array<{
    capabilityId: string;
    rating: number; // 0-5 stars
    tools: string[];
  }>;
  specialization?: string;
}

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'backend',
    name: 'Backend Development',
    description: 'API design, database integration, business logic',
    icon: <Code size={14} />,
    category: 'development',
  },
  {
    id: 'frontend',
    name: 'Frontend Development',
    description: 'UI components, state management, user experience',
    icon: <Paintbrush size={14} />,
    category: 'development',
  },
  {
    id: 'database',
    name: 'Database Management',
    description: 'Schema design, queries, optimization',
    icon: <Database size={14} />,
    category: 'development',
  },
  {
    id: 'testing',
    name: 'Testing & QA',
    description: 'Unit tests, integration tests, e2e tests',
    icon: <TestTube size={14} />,
    category: 'testing',
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'API docs, guides, README files',
    icon: <FileText size={14} />,
    category: 'documentation',
  },
  {
    id: 'security',
    name: 'Security Analysis',
    description: 'Vulnerability scanning, security best practices',
    icon: <Shield size={14} />,
    category: 'security',
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Code quality, best practices, optimization',
    icon: <Search size={14} />,
    category: 'analysis',
  },
];

interface AgentCapabilitiesMatrixProps {
  agents: AgentWithCapabilities[];
  compact?: boolean;
}

export function AgentCapabilitiesMatrix({ agents, compact }: AgentCapabilitiesMatrixProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={12}
        className={i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
      />
    ));
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (rating >= 3) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    if (rating >= 2) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  };

  const getAgentCapability = (agent: AgentWithCapabilities, capabilityId: string) => {
    return agent.capabilities.find(c => c.capabilityId === capabilityId);
  };

  if (compact) {
    return (
      <div className="space-y-3">
        {agents.map(agent => (
          <div key={agent.id} className="p-3 border border-gray-200 dark:border-zinc-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">{agent.name}</div>
              {agent.specialization && (
                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                  {agent.specialization}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities
                .filter(c => c.rating >= 3)
                .map(capability => {
                  const cap = CAPABILITIES.find(c => c.id === capability.capabilityId);
                  return cap ? (
                    <div
                      key={capability.capabilityId}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded"
                    >
                      {cap.icon}
                      <span>{cap.name}</span>
                    </div>
                  ) : null;
                })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
        <h3 className="font-semibold mb-1">Agent Capabilities Matrix</h3>
        <p className="text-sm text-muted-foreground">
          Overview of agent skills and specializations
        </p>
      </div>

      {/* Legend */}
      <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-700 flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">Rating:</span>
        <div className="flex items-center gap-1">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <span className="ml-1">Expert</span>
        </div>
        <div className="flex items-center gap-1">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="text-gray-300" />
          <Star size={12} className="text-gray-300" />
          <span className="ml-1">Proficient</span>
        </div>
        <div className="flex items-center gap-1">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <Star size={12} className="text-gray-300" />
          <Star size={12} className="text-gray-300" />
          <Star size={12} className="text-gray-300" />
          <Star size={12} className="text-gray-300" />
          <span className="ml-1">Basic</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 dark:bg-zinc-800 z-10">
                Agent
              </th>
              {CAPABILITIES.map(capability => (
                <th
                  key={capability.id}
                  className={`px-3 py-3 text-center font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors ${
                    selectedCapability === capability.id ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                  }`}
                  onClick={() => setSelectedCapability(selectedCapability === capability.id ? null : capability.id)}
                >
                  <div className="flex flex-col items-center gap-1">
                    {capability.icon}
                    <span className="text-xs">{capability.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-zinc-700">
            {agents.map(agent => (
              <tr
                key={agent.id}
                className={`hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors ${
                  selectedAgent === agent.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
              >
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10">
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.role}</div>
                    {agent.specialization && (
                      <div className="text-xs mt-1 px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded inline-block">
                        {agent.specialization}
                      </div>
                    )}
                  </div>
                </td>
                {CAPABILITIES.map(capability => {
                  const agentCap = getAgentCapability(agent, capability.id);
                  return (
                    <td
                      key={capability.id}
                      className={`px-3 py-3 text-center ${
                        selectedCapability === capability.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      {agentCap ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex gap-0.5">
                            {getRatingStars(agentCap.rating)}
                          </div>
                          {agentCap.tools.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {agentCap.tools.length} tools
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Details */}
      {(selectedAgent || selectedCapability) && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800">
          {selectedAgent && (
            <div className="mb-2">
              <span className="font-medium">
                Selected Agent: {agents.find(a => a.id === selectedAgent)?.name}
              </span>
            </div>
          )}
          {selectedCapability && (
            <div>
              <span className="font-medium">
                Selected Capability: {CAPABILITIES.find(c => c.id === selectedCapability)?.name}
              </span>
              <p className="text-sm text-muted-foreground mt-1">
                {CAPABILITIES.find(c => c.id === selectedCapability)?.description}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to convert basic AgentInfo to AgentWithCapabilities
export function inferAgentCapabilities(agent: AgentInfo): AgentWithCapabilities {
  const capabilities: AgentWithCapabilities['capabilities'] = [];

  // Infer capabilities from role
  const roleLower = agent.role.toLowerCase();

  if (roleLower.includes('backend')) {
    capabilities.push(
      { capabilityId: 'backend', rating: 5, tools: ['Edit', 'Write', 'Bash'] },
      { capabilityId: 'database', rating: 4, tools: ['Edit', 'Read'] },
      { capabilityId: 'testing', rating: 3, tools: ['Bash'] }
    );
  } else if (roleLower.includes('frontend')) {
    capabilities.push(
      { capabilityId: 'frontend', rating: 5, tools: ['Edit', 'Write'] },
      { capabilityId: 'testing', rating: 3, tools: ['Bash'] },
      { capabilityId: 'documentation', rating: 2, tools: ['Write'] }
    );
  } else if (roleLower.includes('test')) {
    capabilities.push(
      { capabilityId: 'testing', rating: 5, tools: ['Bash', 'Read', 'Write'] },
      { capabilityId: 'code-review', rating: 4, tools: ['Read', 'Grep'] },
      { capabilityId: 'backend', rating: 2, tools: ['Read'] }
    );
  } else if (roleLower.includes('doc') || roleLower.includes('writer')) {
    capabilities.push(
      { capabilityId: 'documentation', rating: 5, tools: ['Write', 'Read'] },
      { capabilityId: 'code-review', rating: 2, tools: ['Read'] }
    );
  } else if (roleLower.includes('security')) {
    capabilities.push(
      { capabilityId: 'security', rating: 5, tools: ['Read', 'Grep', 'Bash'] },
      { capabilityId: 'code-review', rating: 4, tools: ['Read', 'Grep'] },
      { capabilityId: 'testing', rating: 3, tools: ['Bash'] }
    );
  } else {
    // Generic agent
    capabilities.push(
      { capabilityId: 'backend', rating: 3, tools: ['Edit', 'Read'] },
      { capabilityId: 'frontend', rating: 3, tools: ['Edit', 'Read'] },
      { capabilityId: 'testing', rating: 2, tools: ['Bash'] }
    );
  }

  return {
    ...agent,
    capabilities,
    specialization: roleLower.includes('backend') ? 'Backend' :
                    roleLower.includes('frontend') ? 'Frontend' :
                    roleLower.includes('test') ? 'Testing' :
                    roleLower.includes('security') ? 'Security' :
                    undefined,
  };
}
