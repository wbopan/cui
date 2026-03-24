import React, { useState } from 'react';
import { Users, Code, FileSearch, GitBranch, Shield, BookOpen, Wrench } from 'lucide-react';

export interface SwarmTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  agentCount: number;
  agents: Array<{
    type: string;
    role: string;
    task: string;
  }>;
  estimatedDuration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
}

const SWARM_TEMPLATES: SwarmTemplate[] = [
  {
    id: 'full-stack',
    name: 'Full-Stack Development',
    description: 'Complete feature development with backend, frontend, testing, and documentation',
    icon: <Code size={16} />,
    agentCount: 4,
    agents: [
      { type: 'backend-developer', role: 'Backend Developer', task: 'Implement API endpoints and business logic' },
      { type: 'frontend-developer', role: 'Frontend Developer', task: 'Build UI components and user experience' },
      { type: 'test-engineer', role: 'Test Engineer', task: 'Write unit and integration tests' },
      { type: 'tech-writer', role: 'Technical Writer', task: 'Create API documentation and user guides' },
    ],
    estimatedDuration: '15-30 min',
    difficulty: 'intermediate',
    tags: ['development', 'full-stack', 'testing', 'documentation'],
  },
  {
    id: 'code-review',
    name: 'Code Review Swarm',
    description: 'Comprehensive code analysis for security, performance, and best practices',
    icon: <FileSearch size={16} />,
    agentCount: 3,
    agents: [
      { type: 'security-analyst', role: 'Security Analyst', task: 'Identify security vulnerabilities and risks' },
      { type: 'performance-engineer', role: 'Performance Engineer', task: 'Find performance bottlenecks and optimizations' },
      { type: 'code-quality-reviewer', role: 'Code Quality Reviewer', task: 'Check code style and best practices' },
    ],
    estimatedDuration: '10-20 min',
    difficulty: 'beginner',
    tags: ['review', 'security', 'performance', 'quality'],
  },
  {
    id: 'migration',
    name: 'Migration & Refactor',
    description: 'Systematic code migration or refactoring with analysis and testing',
    icon: <GitBranch size={16} />,
    agentCount: 4,
    agents: [
      { type: 'code-analyzer', role: 'Code Analyzer', task: 'Analyze existing codebase and dependencies' },
      { type: 'refactor-engineer', role: 'Refactor Engineer', task: 'Migrate and refactor code systematically' },
      { type: 'test-engineer', role: 'Test Engineer', task: 'Ensure functionality preserved' },
      { type: 'migration-validator', role: 'Migration Validator', task: 'Validate migration completeness' },
    ],
    estimatedDuration: '20-40 min',
    difficulty: 'advanced',
    tags: ['migration', 'refactoring', 'testing', 'analysis'],
  },
  {
    id: 'documentation',
    name: 'Documentation Suite',
    description: 'Generate comprehensive documentation: API docs, README, examples',
    icon: <BookOpen size={16} />,
    agentCount: 3,
    agents: [
      { type: 'api-documenter', role: 'API Documenter', task: 'Generate API reference documentation' },
      { type: 'readme-writer', role: 'README Writer', task: 'Create comprehensive README with examples' },
      { type: 'example-creator', role: 'Example Creator', task: 'Build code examples and tutorials' },
    ],
    estimatedDuration: '10-15 min',
    difficulty: 'beginner',
    tags: ['documentation', 'examples', 'readme'],
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Deep security analysis with vulnerability scanning and remediation',
    icon: <Shield size={16} />,
    agentCount: 3,
    agents: [
      { type: 'vulnerability-scanner', role: 'Vulnerability Scanner', task: 'Scan for known vulnerabilities' },
      { type: 'security-architect', role: 'Security Architect', task: 'Review security architecture and design' },
      { type: 'penetration-tester', role: 'Penetration Tester', task: 'Test for security weaknesses' },
    ],
    estimatedDuration: '15-25 min',
    difficulty: 'advanced',
    tags: ['security', 'audit', 'vulnerabilities'],
  },
  {
    id: 'bug-fix',
    name: 'Bug Investigation',
    description: 'Systematic bug investigation, diagnosis, fix, and testing',
    icon: <Wrench size={16} />,
    agentCount: 3,
    agents: [
      { type: 'bug-investigator', role: 'Bug Investigator', task: 'Analyze and reproduce the bug' },
      { type: 'fix-engineer', role: 'Fix Engineer', task: 'Implement the bug fix' },
      { type: 'regression-tester', role: 'Regression Tester', task: 'Test fix and check for regressions' },
    ],
    estimatedDuration: '10-20 min',
    difficulty: 'intermediate',
    tags: ['debugging', 'testing', 'bug-fix'],
  },
];

interface SwarmTemplateSelectorProps {
  onSelectTemplate: (template: SwarmTemplate, customPrompt?: string) => void;
  disabled?: boolean;
}

export function SwarmTemplateSelector({ onSelectTemplate, disabled }: SwarmTemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<SwarmTemplate | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleTemplateClick = (template: SwarmTemplate) => {
    setSelectedTemplate(template);
    setShowDetails(true);
  };

  const handleInitialize = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate, customPrompt || undefined);
      setShowDetails(false);
      setSelectedTemplate(null);
      setCustomPrompt('');
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'text-green-600 bg-green-50 border-green-200';
      case 'intermediate': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'advanced': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="w-full">
      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {SWARM_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => handleTemplateClick(template)}
            disabled={disabled}
            className={`
              p-4 border rounded-lg text-left transition-all
              hover:border-blue-500 hover:shadow-md
              disabled:opacity-50 disabled:cursor-not-allowed
              ${selectedTemplate?.id === template.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}
            `}
          >
            <div className="flex items-start gap-3 mb-2">
              <div className="p-2 bg-blue-100 text-blue-600 rounded">
                {template.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {template.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users size={12} />
              <span>{template.agentCount} agents</span>
              <span>•</span>
              <span>{template.estimatedDuration}</span>
            </div>

            <div className="mt-2">
              <span className={`text-xs px-2 py-0.5 rounded border ${getDifficultyColor(template.difficulty)}`}>
                {template.difficulty}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Details Modal */}
      {showDetails && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    {selectedTemplate.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedTemplate.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Agents</div>
                  <div className="text-lg font-semibold">{selectedTemplate.agentCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                  <div className="text-lg font-semibold">{selectedTemplate.estimatedDuration}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Difficulty</div>
                  <div className={`text-sm font-semibold capitalize ${
                    selectedTemplate.difficulty === 'beginner' ? 'text-green-600' :
                    selectedTemplate.difficulty === 'intermediate' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {selectedTemplate.difficulty}
                  </div>
                </div>
              </div>

              {/* Agents */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3">Swarm Composition</h3>
                <div className="space-y-2">
                  {selectedTemplate.agents.map((agent, index) => (
                    <div key={index} className="p-3 border border-gray-200 dark:border-zinc-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-purple-500" />
                        <span className="font-medium text-sm">{agent.role}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-5">{agent.task}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <h3 className="font-semibold mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-zinc-800 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div className="mb-6">
                <label className="block font-semibold mb-2">
                  Custom Instructions (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Add specific requirements or context for this swarm..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This will be added to the swarm initialization prompt
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleInitialize}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Initialize Swarm
                </button>
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
