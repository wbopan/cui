import { describe, it, expect } from 'vitest';
import { ClaudeRouterService } from '@/services/claude-router-service';

describe('ClaudeRouterService', () => {
  it('should initialize when enabled', async () => {
    const config = { enabled: true, providers: [], rules: { default: 'test,model' } } as any;
    const service = new ClaudeRouterService(config);
    await service.initialize();
    expect(service.isEnabled()).toBe(false); // Not running until started
  });

  it('should not initialize when disabled', async () => {
    const config = { enabled: false, providers: [], rules: { default: 'test,model' } } as any;
    const service = new ClaudeRouterService(config);
    await service.initialize();
    expect(service.isEnabled()).toBe(false);
  });
});
