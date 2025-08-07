import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from './logger.js';

export interface Command {
  name: string;
  type: 'builtin' | 'custom';
  description?: string;
}

const logger = createLogger('CommandsService');

/**
 * Get hardcoded builtin commands
 */
export function getBuiltinCommands(): Command[] {
  return [
    { name: '/add-dir', type: 'builtin', description: 'Add a new working directory' },
    { name: '/clear', type: 'builtin', description: 'Clear conversation history and free up context' },
    { name: '/compact', type: 'builtin', description: 'Clear conversation history but keep a summary in context' },
    { name: '/init', type: 'builtin', description: 'Initialize a new CLAUDE.md file with codebase documentation' },
    { name: '/model', type: 'builtin', description: 'Set the AI model for Claude Code' },
    { name: '/permissions', type: 'builtin', description: 'Manage allow & deny tool permission rules' }
  ];
}

/**
 * Get custom commands from .claude/commands/ directories
 */
export function getCustomCommands(workingDirectory?: string): Command[] {
  const commands: Map<string, Command> = new Map();
  
  // Always check global directory
  const globalDir = path.join(os.homedir(), '.claude', 'commands');
  try {
    if (fs.existsSync(globalDir)) {
      const files = fs.readdirSync(globalDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const commandName = '/' + file.slice(0, -3); // Remove .md extension
          commands.set(commandName, { name: commandName, type: 'custom' });
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to read global commands directory', { 
      error: error instanceof Error ? error.message : String(error),
      path: globalDir 
    });
  }
  
  // Check local directory if provided
  if (workingDirectory) {
    const localDir = path.join(workingDirectory, '.claude', 'commands');
    try {
      if (fs.existsSync(localDir)) {
        const files = fs.readdirSync(localDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const commandName = '/' + file.slice(0, -3); // Remove .md extension
            // Local commands override global ones
            commands.set(commandName, { name: commandName, type: 'custom' });
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to read local commands directory', { 
        error: error instanceof Error ? error.message : String(error),
        path: localDir 
      });
    }
  }
  
  return Array.from(commands.values());
}

/**
 * Get all available commands (builtin + custom)
 */
export function getAvailableCommands(workingDirectory?: string): Command[] {
  const builtin = getBuiltinCommands();
  const custom = getCustomCommands(workingDirectory);
  
  // Merge arrays
  return [...builtin, ...custom];
}