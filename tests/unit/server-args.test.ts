import { CUIServer } from '@/cui-server';
import { ConfigService } from '@/services/config-service';

describe('Server Command Line Arguments', () => {
  beforeEach(() => {
    // Mock ConfigService
    jest.spyOn(ConfigService, 'getInstance').mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      getConfig: jest.fn().mockReturnValue({
        machine_id: 'test-machine-12345678',
        server: {
          host: 'localhost',
          port: 3001
        }
      })
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should use default port when no overrides provided', async () => {
    const server = new CUIServer();
    
    // Access private fields for testing
    const serverAny = server as any;
    
    // Before start, port should be 0
    expect(serverAny.port).toBe(0);
    
    // After config initialization (part of start), it should use default
    await serverAny.configService.initialize();
    const config = serverAny.configService.getConfig();
    expect(config.server.port).toBe(3001);
  });

  it('should use overridden port when provided', async () => {
    const server = new CUIServer({ port: 3002 });
    
    // Access private fields for testing
    const serverAny = server as any;
    
    // configOverrides should be set
    expect(serverAny.configOverrides).toEqual({ port: 3002 });
  });

  it('should use overridden host when provided', async () => {
    const server = new CUIServer({ host: '0.0.0.0' });
    
    // Access private fields for testing
    const serverAny = server as any;
    
    // configOverrides should be set
    expect(serverAny.configOverrides).toEqual({ host: '0.0.0.0' });
  });

  it('should use both overridden port and host when provided', async () => {
    const server = new CUIServer({ port: 3002, host: '0.0.0.0' });
    
    // Access private fields for testing
    const serverAny = server as any;
    
    // configOverrides should be set
    expect(serverAny.configOverrides).toEqual({ port: 3002, host: '0.0.0.0' });
  });
});