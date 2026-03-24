# Claude-Flow Integration Guide

## Overview

CUI now integrates with [claude-flow](https://github.com/ruvnet/claude-flow), an enterprise-grade AI orchestration platform that enables multi-agent swarms, advanced memory systems, and sophisticated task coordination.

## What's Integrated

### MCP Server Integration

Claude-flow runs as an MCP (Model Context Protocol) server, giving Claude access to 100+ orchestration tools:

- **Swarm Coordination**: Initialize and manage multi-agent swarms
- **Agent Management**: Spawn, coordinate, and monitor specialized agents
- **Memory Systems**: AgentDB vector search and ReasoningBank persistent storage
- **Neural Patterns**: Train and deploy neural coordination patterns
- **GitHub Integration**: Repository analysis, PR management, issue tracking
- **Performance Tools**: Benchmarking, bottleneck analysis, optimization

### UI Visualization

The UI now displays orchestration activity in real-time:

1. **Swarm Orchestration Panel**: Shows active swarms, agent count, and current operations
2. **Agent Cards**: Individual agent status, roles, and current tasks
3. **Tool Icons**: Color-coded icons for different types of claude-flow tools:
   - 🔵 Blue (Users icon): Swarm coordination tools
   - 🟣 Purple (Brain icon): Agent management tools
   - 🟢 Green (Database icon): Memory operations
   - 🟡 Yellow (Zap icon): Neural patterns and task orchestration

## Installation

### 1. Install Dependencies

```bash
npm install
```

The integration is already configured in `package.json` with `claude-flow@^2.7.0-alpha.10`.

### 2. Build the Project

```bash
npm run build
```

### 3. Start the Server

```bash
npm run dev
# or for production
npm start
```

Claude-flow will automatically be available as an MCP server when conversations start.

## Usage Examples

### Basic Swarm Initialization

In any CUI conversation, you can now ask Claude to use swarm capabilities:

```
User: "Initialize a development swarm to refactor the authentication system"
```

Claude will use the `swarm_init` tool, and the UI will display:
- Swarm orchestration panel at the top
- Agent cards showing which agents are active
- Real-time updates as agents work

### Multi-Agent Task Distribution

```
User: "Spawn specialized agents to: 1) analyze code quality, 2) write tests, and 3) update documentation"
```

Claude will spawn multiple agents using `agent_spawn`, and you'll see:
- Each agent displayed in the orchestration panel
- Their individual status and current tasks
- Color-coded tool calls in the message stream

### Memory-Backed Analysis

```
User: "Search our knowledge base for similar authentication implementations"
```

Claude will use `memory_search` to query AgentDB/ReasoningBank, showing green database icons in the tool calls.

### Complex Orchestration

```
User: "Coordinate a swarm to implement user authentication with the following requirements: OAuth support, JWT tokens, and role-based access control. Use separate agents for backend, frontend, and testing."
```

This will trigger:
- Swarm initialization
- Multiple agent spawns
- Task orchestration across agents
- Real-time UI updates showing progress

## Architecture

### Backend Changes

1. **`src/services/mcp-config-generator.ts`**: Added claude-flow MCP server configuration
2. **MCP Config**: Dynamically generates config including claude-flow at runtime

### Frontend Changes

1. **`src/web/chat/components/SwarmOrchestration/SwarmOrchestrationPanel.tsx`**:
   - New component for visualizing swarm state
   - Shows active agents, current operations, agent status

2. **`src/web/chat/hooks/useSwarmOrchestration.ts`**:
   - Hook that processes conversation messages
   - Detects claude-flow tool usage
   - Builds swarm state from tool calls

3. **`src/web/chat/components/MessageList/MessageItem.tsx`**:
   - Enhanced to recognize claude-flow tools
   - Color-coded icons for different tool types

4. **`src/web/chat/components/ConversationView/ConversationView.tsx`**:
   - Integrated SwarmOrchestrationPanel
   - Displays panel when swarm is active

## Tool Categories

### Swarm Coordination Tools
- `swarm_init`: Initialize a new swarm
- `hive_mind_spawn`: Spawn a persistent hive-mind session
- `task_orchestrate`: Distribute tasks across agents

### Agent Management Tools
- `agent_spawn`: Spawn a new specialized agent
- `agent_status`: Check agent status
- `agent_assign`: Assign tasks to specific agents

### Memory Tools
- `memory_store`: Store information with semantic indexing
- `memory_search`: Vector search across stored knowledge
- `memory_retrieve`: Fetch stored information
- `memory_query`: Pattern-based queries

### Neural Pattern Tools
- `neural_train`: Train coordination patterns
- `neural_status`: Check neural system status
- `neural_patterns`: List available patterns

## How It Works

### Message Flow

```
User Input
    ↓
Claude Code CLI
    ↓
MCP Server (claude-flow)
    ↓
Tool Execution (swarm_init, agent_spawn, etc.)
    ↓
Stream Events to CUI
    ↓
useSwarmOrchestration Hook
    ↓
SwarmOrchestrationPanel Render
```

### State Tracking

The `useSwarmOrchestration` hook processes messages to build swarm state:

1. Detects `swarm_init` or `hive_mind_spawn` → Sets `isActive: true`
2. Detects `agent_spawn` → Adds agent to state with role and task
3. Detects `task_orchestrate` → Updates current operation and agent tasks
4. Detects completion tools → Marks agents as completed

### UI Updates

- **Real-time**: Updates as new messages stream in
- **Persistent**: Swarm state rebuilds when viewing conversation history
- **Responsive**: Panel shows/hides based on swarm activity

## Customization

### Adding New Tool Icons

Edit `src/web/chat/components/MessageList/MessageItem.tsx`:

```typescript
function getToolIcon(toolName: string) {
  const cleanName = toolName.replace(/^mcp__claude-flow__/, '');

  // Add custom tool detection
  if (cleanName.startsWith('your_tool_prefix_')) {
    return <YourIcon size={15} className="text-your-color" />;
  }

  // ... existing code
}
```

### Customizing Swarm Panel

Edit `src/web/chat/components/SwarmOrchestration/SwarmOrchestrationPanel.tsx`:

- Change colors, layout, or animations
- Add additional agent information
- Customize agent card display

### Extending Hook Logic

Edit `src/web/chat/hooks/useSwarmOrchestration.ts`:

- Add detection for custom tools
- Modify agent state tracking
- Add new swarm metadata

## Troubleshooting

### Swarm Panel Not Showing

1. Check that claude-flow tools are being used (look for tool calls in messages)
2. Verify MCP server is running (check console logs)
3. Ensure `useSwarmOrchestration` hook is processing messages

### Tool Icons Not Colored

1. Verify tool names match patterns in `getToolIcon()`
2. Check that lucide-react icons are imported
3. Ensure Tailwind classes are not purged

### MCP Server Connection Issues

1. Check that claude-flow is installed: `npm list claude-flow`
2. Verify MCP config is generated: Look for logs mentioning "MCP config generated"
3. Check that `npx claude-flow@alpha mcp start` works independently

## Performance Considerations

- **Memory**: Swarm state is rebuilt from messages on each render (memoized by React)
- **Scaling**: UI can display up to ~50 agents comfortably; beyond that, consider pagination
- **Network**: MCP communication is local, minimal overhead

## Future Enhancements

Potential improvements for deeper integration:

1. **Swarm History View**: Timeline of agent activities
2. **Agent Communication**: Show inter-agent messages
3. **Performance Metrics**: Track swarm efficiency, token usage per agent
4. **Swarm Templates**: Pre-configured swarm patterns for common tasks
5. **Agent Specialization**: Visual indicators for agent expertise areas
6. **Memory Visualization**: Show knowledge graph from ReasoningBank

## Contributing

To extend this integration:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/swarm-enhancement`
3. Make changes following existing patterns
4. Test with actual claude-flow usage
5. Submit pull request

## License

This integration maintains CUI's Apache-2.0 license. Claude-flow is used under its respective license.

## Resources

- [Claude-flow GitHub](https://github.com/ruvnet/claude-flow)
- [MCP Documentation](https://modelcontextprotocol.io)
- [CUI Documentation](https://github.com/bmpixel/cui)

## Support

For issues with:
- **CUI integration**: Open issue on CUI repository
- **Claude-flow functionality**: Open issue on claude-flow repository
- **MCP protocol**: Refer to MCP documentation
