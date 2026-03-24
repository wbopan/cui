import React from 'react';
import { Activity, AlertCircle, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import type { SwarmState } from '../SwarmOrchestration/SwarmOrchestrationPanel';

export interface SwarmHealth {
  score: number; // 0-100
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  metrics: {
    agentResponseRate: number; // 0-100
    errorRate: number; // 0-100
    avgResponseTime: number; // milliseconds
    resourceUsage: number; // 0-100
  };
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    message: string;
    timestamp: string;
  }>;
  trend: 'improving' | 'stable' | 'declining';
}

interface SwarmHealthMonitorProps {
  swarmState: SwarmState;
  health?: SwarmHealth;
  compact?: boolean;
}

// Calculate health from swarm state (simplified algorithm)
function calculateHealth(swarmState: SwarmState): SwarmHealth {
  if (!swarmState.isActive) {
    return {
      score: 0,
      status: 'offline',
      metrics: {
        agentResponseRate: 0,
        errorRate: 0,
        avgResponseTime: 0,
        resourceUsage: 0,
      },
      issues: [],
      trend: 'stable',
    };
  }

  const { totalAgents, activeAgents, agents } = swarmState;

  // Calculate metrics
  const agentResponseRate = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 100;
  const completedAgents = agents.filter(a => a.status === 'completed').length;
  const errorRate = 0; // Would need error tracking
  const avgResponseTime = 150; // Would need actual timing data
  const resourceUsage = (activeAgents / Math.max(totalAgents, 1)) * 80; // Simplified

  // Calculate overall health score (0-100)
  let score = 100;

  // Deduct for low agent response rate
  if (agentResponseRate < 50) score -= 30;
  else if (agentResponseRate < 75) score -= 15;

  // Deduct for high error rate
  score -= errorRate * 0.5;

  // Deduct for slow response times
  if (avgResponseTime > 500) score -= 20;
  else if (avgResponseTime > 300) score -= 10;

  // Ensure score is in range
  score = Math.max(0, Math.min(100, score));

  // Determine status
  let status: SwarmHealth['status'];
  if (score >= 80) status = 'healthy';
  else if (score >= 60) status = 'warning';
  else status = 'critical';

  // Generate issues
  const issues: SwarmHealth['issues'] = [];
  if (agentResponseRate < 75) {
    issues.push({
      severity: agentResponseRate < 50 ? 'high' : 'medium',
      message: `Low agent response rate: ${agentResponseRate.toFixed(0)}%`,
      timestamp: new Date().toISOString(),
    });
  }
  if (avgResponseTime > 300) {
    issues.push({
      severity: avgResponseTime > 500 ? 'high' : 'medium',
      message: `High response time: ${avgResponseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    score,
    status,
    metrics: {
      agentResponseRate,
      errorRate,
      avgResponseTime,
      resourceUsage,
    },
    issues,
    trend: 'stable', // Would need historical data
  };
}

export function SwarmHealthMonitor({ swarmState, health: providedHealth, compact }: SwarmHealthMonitorProps) {
  const health = providedHealth || calculateHealth(swarmState);

  if (!swarmState.isActive) {
    return null;
  }

  const getStatusColor = (status: SwarmHealth['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'offline': return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: SwarmHealth['status']) => {
    switch (status) {
      case 'healthy': return <CheckCircle size={16} className="text-green-600" />;
      case 'warning': return <AlertCircle size={16} className="text-yellow-600" />;
      case 'critical': return <XCircle size={16} className="text-red-600" />;
      case 'offline': return <Activity size={16} className="text-gray-600" />;
    }
  };

  const getTrendIcon = (trend: SwarmHealth['trend']) => {
    switch (trend) {
      case 'improving': return <TrendingUp size={14} className="text-green-600" />;
      case 'declining': return <TrendingDown size={14} className="text-red-600" />;
      case 'stable': return <Activity size={14} className="text-gray-600" />;
    }
  };

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${getStatusColor(health.status)}`}>
        {getStatusIcon(health.status)}
        <span className="text-sm font-medium capitalize">{health.status}</span>
        <span className="text-sm">•</span>
        <span className="text-sm font-semibold">{health.score}</span>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="text-blue-500" size={18} />
          <h3 className="font-semibold">Swarm Health</h3>
        </div>
        <div className="flex items-center gap-2">
          {getTrendIcon(health.trend)}
          <div className={`px-3 py-1 rounded-full border text-sm font-medium capitalize ${getStatusColor(health.status)}`}>
            {getStatusIcon(health.status)}
            <span className="ml-1">{health.status}</span>
          </div>
        </div>
      </div>

      {/* Health Score */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Overall Health</span>
          <span className="text-2xl font-bold">{health.score}/100</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              health.score >= 80 ? 'bg-green-500' :
              health.score >= 60 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${health.score}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded">
          <div className="text-xs text-muted-foreground">Response Rate</div>
          <div className="text-lg font-semibold">
            {health.metrics.agentResponseRate.toFixed(0)}%
          </div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded">
          <div className="text-xs text-muted-foreground">Error Rate</div>
          <div className="text-lg font-semibold">
            {health.metrics.errorRate.toFixed(1)}%
          </div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded">
          <div className="text-xs text-muted-foreground">Avg Response</div>
          <div className="text-lg font-semibold">
            {health.metrics.avgResponseTime}ms
          </div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded">
          <div className="text-xs text-muted-foreground">Resource Use</div>
          <div className="text-lg font-semibold">
            {health.metrics.resourceUsage.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Issues */}
      {health.issues.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Active Issues</h4>
          <div className="space-y-2">
            {health.issues.map((issue, index) => (
              <div
                key={index}
                className={`p-2 rounded border text-sm ${
                  issue.severity === 'high' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200' :
                  issue.severity === 'medium' ? 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200' :
                  'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{issue.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Issues Message */}
      {health.issues.length === 0 && health.status === 'healthy' && (
        <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-800 dark:text-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} />
            <span>All systems operational</span>
          </div>
        </div>
      )}
    </div>
  );
}
