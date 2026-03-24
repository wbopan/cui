# Swarm Orchestration UI Mockup

## Full Conversation View with Active Swarm

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📝 Authentication Refactoring                                    📌 🔍┃
┃ Dec 10 • my-project • abc123d • +234 -45                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 👥 Swarm Orchestration Active              ⚡ 4 / 4 agents active  ┃
┃                                                                     ┃
┃ ⚡ Operation: Orchestrating: refactor authentication system        ┃
┃                                                                     ┃
┃ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐          ┃
┃ │ 🟢 🧠          │ │ 🟢 🧠          │ │ 🟢 🧠          │          ┃
┃ │ Backend Dev    │ │ Frontend Dev   │ │ Test Engineer  │          ┃
┃ │ Backend        │ │ Frontend       │ │ Testing        │          ┃
┃ │ OAuth endpoints│ │ Login UI comp. │ │ E2E test suite │          ┃
┃ └────────────────┘ └────────────────┘ └────────────────┘          ┃
┃                                                                     ┃
┃ ┌────────────────┐                                                 ┃
┃ │ 🔵 🧠          │                                                 ┃
┃ │ Tech Writer    │                                                 ┃
┃ │ Documentation  │                                                 ┃
┃ │ API docs       │                                                 ┃
┃ └────────────────┘                                                 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

╭─────────────────────────────────────────────────────────────────────╮
│ 💬 Messages                                                         │
│                                                                     │
│ 👤 User                                                             │
│ Initialize a development swarm to refactor the authentication      │
│ system with OAuth support                                          │
│                                                                     │
│ 🤖 Assistant                                                        │
│ I'll initialize a development swarm to refactor your               │
│ authentication system with OAuth 2.0 support.                      │
│                                                                     │
│ ╭─────────────────────────────────────────────────────────────────╮│
│ │ 🔵 swarm_init                                                   ││
│ │ ↓ Initializing swarm with hierarchical topology...             ││
│ │ ✓ Swarm initialized successfully                               ││
│ ╰─────────────────────────────────────────────────────────────────╯│
│                                                                     │
│ ╭─────────────────────────────────────────────────────────────────╮│
│ │ 🟣 agent_spawn                                                  ││
│ │ ↓ Spawning backend developer agent...                          ││
│ │ ✓ Agent backend-dev-001 spawned                                ││
│ │   Role: Backend Developer                                      ││
│ │   Task: Implement OAuth 2.0 endpoints                          ││
│ ╰─────────────────────────────────────────────────────────────────╯│
│                                                                     │
│ ╭─────────────────────────────────────────────────────────────────╮│
│ │ 🟣 agent_spawn                                                  ││
│ │ ↓ Spawning frontend developer agent...                         ││
│ │ ✓ Agent frontend-dev-001 spawned                               ││
│ │   Role: Frontend Developer                                     ││
│ │   Task: Build OAuth login UI                                   ││
│ ╰─────────────────────────────────────────────────────────────────╯│
│                                                                     │
│ ╭─────────────────────────────────────────────────────────────────╮│
│ │ 🟢 memory_search                                                ││
│ │ ↓ Searching knowledge base for OAuth implementations...        ││
│ │ ✓ Found 3 relevant patterns                                    ││
│ │   - OAuth 2.0 with JWT tokens (confidence: 0.94)               ││
│ │   - Refresh token rotation (confidence: 0.89)                  ││
│ │   - PKCE flow for SPAs (confidence: 0.87)                      ││
│ ╰─────────────────────────────────────────────────────────────────╯│
│                                                                     │
│ ╭─────────────────────────────────────────────────────────────────╮│
│ │ 🟡 task_orchestrate                                             ││
│ │ ↓ Coordinating tasks across agents...                          ││
│ │ ✓ Tasks distributed:                                           ││
│ │   • backend-dev-001: Create OAuth endpoints                    ││
│ │   • frontend-dev-001: Build login components                   ││
│ │   • test-eng-001: Write integration tests                      ││
│ │   • tech-writer-001: Document API                              ││
│ ╰─────────────────────────────────────────────────────────────────╯│
│                                                                     │
│ The swarm is now working on your authentication refactor.         │
│ Each agent is working in parallel on their assigned tasks.        │
│                                                                     │
│ 🟢 Backend agent is creating /auth/oauth/authorize endpoint       │
│ 🟢 Frontend agent is building LoginButton component               │
│ 🟢 Test agent is writing e2e OAuth flow tests                     │
│ 🔵 Documentation agent is updating API docs                       │
│                                                                     │
╰─────────────────────────────────────────────────────────────────────╯

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Continue the conversation...                                     ⬆️┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## Agent Card States

### Active Agent
```
┌────────────────┐
│ 🟢 🧠          │ ← Green pulsing dot (active)
│ Backend Dev    │ ← Agent name
│ Backend        │ ← Role
│ Refactoring... │ ← Current task
└────────────────┘
```

### Idle Agent
```
┌────────────────┐
│ ⚪ 🧠          │ ← Gray dot (idle)
│ QA Engineer    │
│ Testing        │
│ Waiting...     │
└────────────────┘
```

### Completed Agent
```
┌────────────────┐
│ 🔵 🧠          │ ← Blue dot (completed)
│ Tech Writer    │
│ Documentation  │
│ ✓ Docs updated │
└────────────────┘
```

---

## Tool Call Visualizations

### Swarm Initialization
```
╭─────────────────────────────────────────────────╮
│ 🔵 swarm_init                                  │ ← Blue icon
│ ↓ Initializing swarm...                       │
│ ✓ Swarm initialized with 4 agent slots        │
│   Topology: hierarchical                       │
│   Coordination: enabled                        │
╰─────────────────────────────────────────────────╯
```

### Agent Spawn
```
╭─────────────────────────────────────────────────╮
│ 🟣 agent_spawn                                 │ ← Purple icon
│ ↓ Spawning specialized agent...               │
│ ✓ Agent backend-dev-001 ready                 │
│   Type: Backend Developer                      │
│   Capabilities: API design, OAuth, security    │
╰─────────────────────────────────────────────────╯
```

### Memory Operation
```
╭─────────────────────────────────────────────────╮
│ 🟢 memory_search                               │ ← Green icon
│ ↓ Querying AgentDB...                         │
│ ✓ Found 5 relevant entries                    │
│   - OAuth best practices (score: 0.95)        │
│   - Security considerations (score: 0.92)     │
│   - Token management (score: 0.88)            │
╰─────────────────────────────────────────────────╯
```

### Task Orchestration
```
╭─────────────────────────────────────────────────╮
│ 🟡 task_orchestrate                            │ ← Yellow icon
│ ↓ Distributing work across swarm...           │
│ ✓ Tasks assigned to 4 agents                  │
│   Estimated completion: 15 minutes             │
│   Parallel execution enabled                   │
╰─────────────────────────────────────────────────╯
```

---

## Responsive Layout

### Desktop (Wide)
```
┌─────────────────────────────────────────────────────┐
│ [Orchestration Panel - Full Width]                 │
│ [Agent][Agent][Agent][Agent]                        │
└─────────────────────────────────────────────────────┘
```

### Tablet (Medium)
```
┌────────────────────────────┐
│ [Orchestration Panel]      │
│ [Agent][Agent]             │
│ [Agent][Agent]             │
└────────────────────────────┘
```

### Mobile (Narrow)
```
┌──────────────┐
│ [Panel]      │
│ [Agent]      │
│ [Agent]      │
│ [Agent]      │
└──────────────┘
```

---

## Color Scheme

### Status Colors
- **Active**: `bg-green-500/10 border-green-500/50 text-green-600`
- **Idle**: `bg-gray-500/10 border-gray-500/50 text-gray-600`
- **Completed**: `bg-blue-500/10 border-blue-500/50 text-blue-600`

### Tool Colors
- **Swarm (Blue)**: `text-blue-500` - Users icon
- **Agent (Purple)**: `text-purple-500` - Brain icon
- **Memory (Green)**: `text-green-500` - Database icon
- **Neural (Yellow)**: `text-yellow-500` - Zap icon

### Panel Theme
- **Background**: `bg-blue-500/5 border-blue-500/30`
- **Header**: `text-blue-600 dark:text-blue-400`
- **Active indicator**: `text-green-500 animate-pulse`

---

## Animation Effects

### Panel Entry
```css
animate-in fade-in duration-300
```

### Agent Card Entry
```css
animate-in slide-in-from-bottom duration-200
stagger-children
```

### Status Pulse
```css
.active-dot {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Tool Call Expand
```css
transition: all 0.2s ease-in-out
hover:bg-muted/50
```

---

## Interaction States

### Hover Effects
```
Agent Card:
  - Slightly elevated shadow
  - Border brightens
  - Cursor: pointer

Tool Call:
  - Background lightens
  - Border appears
  - Shows "copy" icon
```

### Click Actions
```
Agent Card:
  - Could expand to show detailed logs
  - Could filter messages to that agent
  - Could show agent metrics

Tool Call:
  - Expands/collapses details
  - Copy tool input
  - View in inspector
```

---

## Empty States

### No Active Swarm
```
[Orchestration Panel does not render at all]
```

### Swarm Initializing
```
┌─────────────────────────────────────────┐
│ 👥 Swarm Orchestration Initializing... │
│                                         │
│ ⚡ Preparing agent coordination...     │
│                                         │
│ [Spinner animation]                     │
└─────────────────────────────────────────┘
```

### All Agents Completed
```
┌─────────────────────────────────────────┐
│ 👥 Swarm Completed ✓          0 / 4 active│
│                                         │
│ ✓ All tasks completed successfully     │
│                                         │
│ [All agents show blue completed state] │
└─────────────────────────────────────────┘
```

---

## Real-World Example Flow

### Initial State (No Swarm)
```
[Header]
[Messages]
[Composer]
```

### User Asks for Swarm
```
User: "Initialize a swarm to implement OAuth"
```

### Swarm Panel Appears
```
[Header]
[Orchestration Panel - Initializing]
[Messages]
[Composer]
```

### Agents Spawn
```
[Header]
[Orchestration Panel]
  → 🟢 Backend Dev (active)
  → 🟢 Frontend Dev (active)
  → ⚪ Test Engineer (idle)
  → ⚪ Tech Writer (idle)
[Messages]
[Composer]
```

### Work Completes
```
[Header]
[Orchestration Panel]
  → 🔵 Backend Dev (completed)
  → 🔵 Frontend Dev (completed)
  → 🔵 Test Engineer (completed)
  → 🔵 Tech Writer (completed)
[Messages]
[Composer]
```

---

## Technical Implementation

The UI updates automatically based on message content:

```typescript
// Hook processes messages
const swarmState = useSwarmOrchestration(messages);

// Component conditionally renders
{swarmState.isActive && (
  <SwarmOrchestrationPanel swarmState={swarmState} />
)}

// State derives from tool calls in messages
useEffect(() => {
  messages.forEach(msg => {
    if (msg.content.some(block =>
      block.type === 'tool_use' &&
      block.name.includes('swarm_init')
    )) {
      setSwarmActive(true);
    }
  });
}, [messages]);
```

No additional state management needed - everything derives from the conversation history! 🎉

---

## Accessibility

- **ARIA labels**: All interactive elements labeled
- **Keyboard navigation**: Tab through agent cards
- **Screen reader**: Announces swarm status changes
- **High contrast**: Colors meet WCAG AAA standards
- **Reduced motion**: Respects prefers-reduced-motion

---

## Summary

The UI provides:
✅ Real-time swarm visualization
✅ Individual agent status tracking
✅ Color-coded tool identification
✅ Responsive, animated interface
✅ Seamless integration with existing UI
✅ Accessible and performant

**Total lines of UI code added**: ~300
**New components**: 3 (Panel, Hook, Icon enhancement)
**Breaking changes**: 0 (fully additive)
