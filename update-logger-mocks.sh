#!/bin/bash

# Script to update all test files with incomplete logger mocks
# to use the complete mock implementation

echo "Updating test files with complete logger mock..."

# List of files that need updating (from our earlier grep)
files=(
  "tests/unit/claude/claude-history-reader.test.ts"
  "tests/unit/claude/claude-process-manager-git.test.ts"
  "tests/unit/mcp-server/polling.test.ts"
  "tests/unit/routes/conversation.routes.test.ts"
  "tests/unit/routes/filesystem.routes.test.ts"
  "tests/unit/routes/gemini.routes.test.ts"
  "tests/unit/routes/permission.routes.test.ts"
  "tests/unit/routes/preferences.routes.test.ts"
  "tests/unit/services/commands-service.test.ts"
  "tests/unit/services/conversation-cache.test.ts"
  "tests/unit/services/gemini-service.test.ts"
  "tests/unit/services/notification-service.bun.test.ts"
  "tests/unit/services/preferences-service.test.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Checking $file..."
    
    # Check if file already uses the new mock
    if grep -q "mock-logger" "$file"; then
      echo "  ✓ Already updated"
      continue
    fi
    
    # Check if file mocks the logger
    if grep -q "mock.module.*@/services/logger" "$file"; then
      echo "  → Needs update"
      
      # Create a backup
      cp "$file" "$file.bak"
      
      # Update the file to use the complete mock
      # This is complex to do with sed, so we'll need to do it file by file
      echo "  ! Manual update required for $file"
    else
      echo "  - No logger mock found"
    fi
  fi
done

echo ""
echo "Files that need manual update:"
for file in "${files[@]}"; do
  if [ -f "$file" ] && ! grep -q "mock-logger" "$file" && grep -q "mock.module.*@/services/logger" "$file"; then
    echo "  - $file"
  fi
done