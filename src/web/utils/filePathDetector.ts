/**
 * Utility to detect and extract file paths from conversation messages
 */

export interface DetectedFile {
  path: string;
  filename: string;
  mentionedIn: string[]; // Array of message UUIDs where this file was mentioned
  toolUses: Array<{
    tool: string; // 'Write' | 'Edit' | 'Read' | etc.
    messageUuid: string;
  }>;
}

/**
 * Extract file paths from a message's content
 */
export function extractFilePathsFromMessage(
  message: {
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
  },
  conversationCwd?: string
): DetectedFile[] {
  const detectedFiles: Map<string, DetectedFile> = new Map();

  if (message.type !== 'assistant' && message.type !== 'user') {
    return [];
  }

  const content = message.message.content;
  if (!Array.isArray(content)) {
    return [];
  }

  for (const block of content) {
    // Extract paths from tool uses (Write, Edit, Read, etc.)
    if (block.type === 'tool_use' && block.name && block.input) {
      const toolName = block.name;
      const input = block.input as Record<string, unknown>;

      // Check for file_path in Write/Edit/Read tools
      if (input.file_path && typeof input.file_path === 'string') {
        const filePath = input.file_path;
        if (isValidAbsolutePath(filePath)) {
          addOrUpdateFile(detectedFiles, filePath, message.uuid, toolName);
        }
      }

      // Check for notebook_path in NotebookEdit tool
      if (input.notebook_path && typeof input.notebook_path === 'string') {
        const filePath = input.notebook_path;
        if (isValidAbsolutePath(filePath)) {
          addOrUpdateFile(detectedFiles, filePath, message.uuid, toolName);
        }
      }
    }

    // Extract paths from text content using regex
    if (block.type === 'text' && block.text) {
      const textPaths = extractPathsFromText(block.text, conversationCwd);
      for (const filePath of textPaths) {
        addOrUpdateFile(detectedFiles, filePath, message.uuid);
      }
    }
  }

  return Array.from(detectedFiles.values());
}

/**
 * Extract file paths from all messages in a conversation
 */
export function extractFilePathsFromConversation(
  messages: Array<{
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
    cwd?: string;
  }>
): DetectedFile[] {
  const allFiles: Map<string, DetectedFile> = new Map();

  const conversationCwd = messages[0]?.cwd;

  for (const message of messages) {
    const filesInMessage = extractFilePathsFromMessage(message, conversationCwd);

    for (const file of filesInMessage) {
      if (allFiles.has(file.path)) {
        // Merge with existing
        const existing = allFiles.get(file.path)!;
        existing.mentionedIn = [...new Set([...existing.mentionedIn, ...file.mentionedIn])];
        existing.toolUses = [...existing.toolUses, ...file.toolUses];
      } else {
        allFiles.set(file.path, file);
      }
    }
  }

  return Array.from(allFiles.values());
}

/**
 * Extract absolute file paths from text using regex
 */
function extractPathsFromText(text: string, conversationCwd?: string): string[] {
  const paths: Set<string> = new Set();

  // Track quoted ranges to avoid double-matching
  const quotedRanges: Array<[number, number]> = [];

  // Extract quoted paths first (supports spaces)
  // Matches: "/path/to/My File.txt" or '/path/to/My File.txt'
  const quotedPathRegex = /["']([/\\](?:[^"']+[/\\])*(?:[^"'/\\]+\.[\w]+|\.[\w]+|[A-Z_][A-Z_0-9]*))["']/g;
  let match;
  while ((match = quotedPathRegex.exec(text)) !== null) {
    const path = match[1].trim();
    if (path && !isUrlOrFalsePositive(path)) {
      paths.add(path);
      // Track the range of the entire quoted string
      quotedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  // Helper to check if index is within a quoted range
  const isInQuotedRange = (index: number): boolean => {
    return quotedRanges.some(([start, end]) => index >= start && index < end);
  };

  // Improved regex for Unix/Linux absolute paths (unquoted, no spaces)
  // Matches: /path/to/file.ext, /path/to/.gitignore, /path/to/README
  // Supports: brackets, hyphens, underscores, dots (but NOT spaces)
  const unixPathRegex = /\/(?:[^\s/]+\/)*(?:[^\s/]+\.[\w]+|\.[\w]+|[A-Z_][A-Z_0-9]*)(?=\s|$|[,;.!?)])/g;

  // Improved regex for Windows absolute paths: C:\path\to\file or C:/path/to/file
  const windowsPathRegex = /[A-Z]:[\\/](?:[^\s\\/]+[\\/])*(?:[^\s\\/]+\.[\w]+|\.[\w]+|[A-Z_][A-Z_0-9]*)(?=\s|$|[,;.!?)])/gi;

  // Extract Unix paths (skip if in quoted range)
  while ((match = unixPathRegex.exec(text)) !== null) {
    if (!isInQuotedRange(match.index)) {
      const path = match[0].trim();
      if (path && !isUrlOrFalsePositive(path)) {
        paths.add(path);
      }
    }
  }

  // Extract Windows paths (skip if in quoted range)
  while ((match = windowsPathRegex.exec(text)) !== null) {
    if (!isInQuotedRange(match.index)) {
      const path = match[0].trim();
      if (path && !isUrlOrFalsePositive(path)) {
        paths.add(path);
      }
    }
  }

  // Convert to array and filter by cwd if provided
  const pathArray = Array.from(paths);
  if (conversationCwd) {
    return pathArray.filter(p => p.startsWith(conversationCwd));
  }

  return pathArray;
}

/**
 * Filter out URLs and common false positives
 */
function isUrlOrFalsePositive(path: string): boolean {
  // Filter out URLs (http://, https://, file://)
  if (/^https?:\/\//.test(path) || /^file:\/\//.test(path)) {
    return true;
  }

  // Filter out version-like patterns (e.g., /1.0.0/, /v2.3.4/)
  if (/^\/v?\d+\.\d+(\.\d+)?/.test(path)) {
    return true;
  }

  // Filter out single-level paths that are likely false positives
  // (e.g., /usr, /bin) - but allow if they have extensions or start with dot
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length === 1 && !path.includes('.')) {
    return true;
  }

  return false;
}

/**
 * Check if a path is a valid absolute path
 */
function isValidAbsolutePath(path: string): boolean {
  // Unix absolute path
  if (path.startsWith('/')) {
    return true;
  }

  // Windows absolute path
  if (/^[A-Z]:[\\\/]/.test(path)) {
    return true;
  }

  return false;
}

/**
 * Add or update a file in the detected files map
 */
function addOrUpdateFile(
  files: Map<string, DetectedFile>,
  filePath: string,
  messageUuid: string,
  toolName?: string
): void {
  const filename = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

  if (files.has(filePath)) {
    const existing = files.get(filePath)!;
    if (!existing.mentionedIn.includes(messageUuid)) {
      existing.mentionedIn.push(messageUuid);
    }
    if (toolName) {
      existing.toolUses.push({ tool: toolName, messageUuid });
    }
  } else {
    files.set(filePath, {
      path: filePath,
      filename,
      mentionedIn: [messageUuid],
      toolUses: toolName ? [{ tool: toolName, messageUuid }] : []
    });
  }
}

/**
 * Get unique file paths (deduplicated)
 */
export function getUniqueFilePaths(files: DetectedFile[]): string[] {
  return [...new Set(files.map(f => f.path))];
}
