# Contributing to CUI (Common Agent UI)

Thank you for your interest in contributing to CUI! This guide will help you get started with contributing to our project.

## Table of Contents

- [Project Overview](#project-overview)
- [Development Setup](#development-setup)
- [Testing Requirements](#testing-requirements)
- [Contribution Guidelines](#contribution-guidelines)
- [Submitting Changes](#submitting-changes)

## Project Overview

CUI is a web interface for the Claude CLI tool, consisting of:
- TypeScript Express backend that manages Claude CLI processes
- React frontend with ultra clean minimalistic design
- Single-port architecture (port 3001)
- Real-time streaming of Claude responses via newline-delimited JSON
- MCP (Model Context Protocol) integration for permission management

### Architecture

#### Backend Services (`src/services/`)
- **ClaudeProcessManager**: Spawns and manages Claude CLI processes
- **StreamManager**: Handles HTTP streaming connections for real-time updates
- **ClaudeHistoryReader**: Reads conversation history from ~/.claude directory
- **CUIMCPServer**: MCP server for handling tool permission requests
- **SessionInfoService**: Manages extended session metadata

#### Frontend (`src/web/`)
- **chat/**: Main chat application components
- **console/**: Console/log viewer components  
- **api/**: API client using fetch for backend communication
- **styles/**: CSS modules with ultra clean minimalistic design

#### API Routes (`src/routes/`)
- Conversations API: Start, list, get, continue, stop conversations
- Streaming API: Real-time conversation updates
- Permissions API: MCP permission approval/denial
- System API: Status and available models

## Development Setup

### Prerequisites
- Node.js 20.x or 22.x
- npm (comes with Node.js)
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/PanBananowy/ccui.git
   cd ccui
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Build the project (required before first test run):
   ```bash
   npm run build
   ```

4. Start development server:
   ```bash
   npm run dev  # Backend + frontend on port 3001
   ```

### Essential Commands

```bash
npm run dev          # Start dev server
npm run build        # Build both frontend and backend
npm run test         # Run all tests
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint checking
```

### Development Gotchas

- Before running tests for the first time, run `npm run build` to build the MCP executable
- Do not run `npm run dev` to verify frontend updates during testing
- Enable debug logs with: `LOG_LEVEL=debug npm run dev`

## Testing Requirements

### Running Tests

```bash
npm run test                # Run all tests
npm run unit-tests          # Run unit tests only
npm run integration-tests   # Run integration tests only
npm run test:coverage       # Generate coverage report
npm run test:watch          # Watch mode for TDD
npm run test:debug          # Verbose output for debugging
```

### Test Coverage Requirements

All pull requests must meet the following coverage thresholds:
- **Lines**: 75%
- **Functions**: 80%
- **Branches**: 60%
- **Statements**: 75%

The CI pipeline will automatically check these thresholds. To verify locally:
```bash
npm run test:coverage
```

### Writing Tests

- Write comprehensive unit tests for all new features
- Include integration tests for API endpoints
- Mock external dependencies appropriately
- Follow existing test patterns in the codebase
- Use descriptive test names that explain the behavior being tested

## Contribution Guidelines

### Code Style

1. **TypeScript Best Practices**:
   - Use strict typing - avoid `any`, `undefined`, `unknown` types
   - Follow existing type patterns in the codebase
   - Utilize Zod schemas for runtime validation

2. **Coding Standards**:
   - Follow the project's ESLint configuration
   - Use path aliases (e.g., `@/services/...`) for imports
   - Ensure proper cleanup of event listeners in streaming logic
   - Never expose or log secrets/keys

3. **Key Patterns to Follow**:
   - **Streaming Architecture**: Use newline-delimited JSON (not SSE)
   - **Process Management**: Each conversation = separate Claude CLI process
   - **Error Handling**: Use custom error types with proper HTTP status codes
   - **Frontend**: Use React Router v6 for navigation

### Creating Issues

When creating an issue, please include:
- Clear description of the problem or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- System information (OS, Node version)
- Relevant logs or error messages

Use appropriate labels:
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers

### Pull Request Process

1. **Before Creating a PR**:
   - Create an issue first to discuss the change
   - Fork the repository and create a feature branch
   - Ensure all tests pass: `npm run test`
   - Run linting: `npm run lint`
   - Run type checking: `npm run typecheck`
   - Add/update tests for your changes
   - Update documentation if needed

2. **PR Format**:
   ```markdown
   ## Description
   Brief description of changes

   ## Related Issue
   Fixes #(issue number)

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Coverage requirements met
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   ```

3. **After Creating a PR**:
   - Ensure CI pipeline passes
   - Respond to review feedback promptly
   - Keep PR up to date with main branch

## Submitting Changes

1. **Small, Focused Changes**: Keep PRs small and focused on a single issue
2. **Commit Messages**: Use clear, descriptive commit messages
3. **Testing**: All new features must include tests
4. **Documentation**: Update relevant documentation
5. **Breaking Changes**: Discuss in an issue first

### Important Implementation Notes

- MCP permission requests must be handled synchronously
- Process spawn arguments are built dynamically based on options
- Ensure proper cleanup when modifying streaming logic
- Test with different Node.js versions (20.x and 22.x)

## Getting Help

- Check existing issues and PRs first
- Ask questions in issue discussions
- Review the CLAUDE.md file for project-specific guidance
- Enable debug logging for troubleshooting

Thank you for contributing to CUI! Your efforts help make this project better for everyone.