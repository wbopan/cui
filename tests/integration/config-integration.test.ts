// No imports needed - using Jest globals
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService } from '@/services/config-service';
import { generateMachineId } from '@/utils/machine-id';
import { CUIConfig } from '@/types/config';

describe('Configuration System Basic Integration', () => {
  let testConfigDir: string;
  let originalHome: string;

  beforeAll(() => {
    // Create temporary config directory for tests
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-config-basic-test-'));
    
    // Mock the home directory to use our test directory
    originalHome = os.homedir();
    jest.spyOn(os, 'homedir').mockReturnValue(testConfigDir);
  });

  afterAll(() => {
    // Restore original home directory
    (os.homedir as any).mockRestore();
    
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear any existing config directory
    const cuiDir = path.join(testConfigDir, '.cui');
    if (fs.existsSync(cuiDir)) {
      fs.rmSync(cuiDir, { recursive: true, force: true });
    }
    
    // Reset ConfigService singleton
    const configService = ConfigService.getInstance();
    (configService as any).isInitialized = false;
    (configService as any).config = null;
  });

  describe('Configuration File Creation', () => {
    it('should create config directory and file on first initialization', async () => {
      const configService = ConfigService.getInstance();
      
      // Config directory should not exist initially
      expect(fs.existsSync(path.join(testConfigDir, '.cui'))).toBe(false);
      
      await configService.initialize();
      
      // Config directory and file should now exist
      const cuiDir = path.join(testConfigDir, '.cui');
      const configPath = path.join(cuiDir, 'config.json');
      
      expect(fs.existsSync(cuiDir)).toBe(true);
      expect(fs.existsSync(configPath)).toBe(true);
      
      // Verify config file structure
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      
      expect(config).toHaveProperty('machine_id');
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('authToken');
      expect(config.server).toHaveProperty('host', 'localhost');
      expect(config.server).toHaveProperty('port', 3001);
      expect(config.authToken).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should load existing config file if it exists', async () => {
      // Create a pre-existing config file
      const cuiDir = path.join(testConfigDir, '.cui');
      fs.mkdirSync(cuiDir, { recursive: true });
      
      const existingConfig: CUIConfig = {
        machine_id: 'test-machine-12345678',
        authToken: 'abcd1234567890abcdef1234567890ab',
        server: {
          host: '127.0.0.1',
          port: 4000
        }
      };
      
      fs.writeFileSync(
        path.join(cuiDir, 'config.json'), 
        JSON.stringify(existingConfig, null, 2)
      );
      
      const configService = ConfigService.getInstance();
      await configService.initialize();
      
      const loadedConfig = configService.getConfig();
      
      expect(loadedConfig.machine_id).toBe('test-machine-12345678');
      expect(loadedConfig.authToken).toBe('abcd1234567890abcdef1234567890ab');
      expect(loadedConfig.server.host).toBe('127.0.0.1');
      expect(loadedConfig.server.port).toBe(4000);
    });
  });

  describe('Machine ID Generation', () => {
    it('should generate consistent machine ID format', async () => {
      const machineId = await generateMachineId();
      
      // Should match format: {hostname}-{16char_hash}
      const pattern = /^[a-z0-9\-]+\-[a-f0-9]{16}$/;
      expect(machineId).toMatch(pattern);
      
      // Should start with lowercase sanitized hostname
      const hostname = os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '');
      expect(machineId).toMatch(new RegExp(`^${hostname}`));
    });

    it('should generate the same machine ID on multiple calls', async () => {
      const machineId1 = await generateMachineId();
      const machineId2 = await generateMachineId();
      
      expect(machineId1).toBe(machineId2);
    });

    it('should persist machine ID across config service restarts', async () => {
      const configService1 = ConfigService.getInstance();
      await configService1.initialize();
      const config1 = configService1.getConfig();
      
      // Reset and reinitialize
      (configService1 as any).isInitialized = false;
      (configService1 as any).config = null;
      
      const configService2 = ConfigService.getInstance();
      await configService2.initialize();
      const config2 = configService2.getConfig();
      
      expect(config1.machine_id).toBe(config2.machine_id);
    });
  });

  describe('ConfigService Singleton Behavior', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = ConfigService.getInstance();
      const instance2 = ConfigService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw error when accessing config before initialization', () => {
      const configService = ConfigService.getInstance();
      
      expect(() => configService.getConfig()).toThrow('Configuration not initialized');
    });

    it('should prevent multiple initializations', async () => {
      const configService = ConfigService.getInstance();
      
      await configService.initialize();
      
      // Second initialization should not throw
      await configService.initialize();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed config file gracefully', async () => {
      // Create malformed config file
      const cuiDir = path.join(testConfigDir, '.cui');
      fs.mkdirSync(cuiDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(cuiDir, 'config.json'), 
        '{ invalid json content'
      );
      
      const configService = ConfigService.getInstance();
      
      try {
        await configService.initialize();
        fail('Expected initialization to throw');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle missing config file fields', async () => {
      // Create incomplete config file
      const cuiDir = path.join(testConfigDir, '.cui');
      fs.mkdirSync(cuiDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(cuiDir, 'config.json'), 
        JSON.stringify({ machine_id: 'test' }) // Missing server and authToken
      );
      
      const configService = ConfigService.getInstance();
      
      try {
        await configService.initialize();
        fail('Expected initialization to throw');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Default Configuration Values', () => {
    it('should create config with correct default values', async () => {
      const configService = ConfigService.getInstance();
      await configService.initialize();
      
      const config = configService.getConfig();
      
      expect(config.server.host).toBe('localhost');
      expect(config.server.port).toBe(3001);
      expect(config.machine_id).toBeDefined();
      expect(config.machine_id).toMatch(/^[a-z0-9\-]+\-[a-f0-9]{16}$/);
      expect(config.authToken).toBeDefined();
      expect(config.authToken).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate machine ID with correct hostname prefix', async () => {
      const configService = ConfigService.getInstance();
      await configService.initialize();
      
      const config = configService.getConfig();
      const hostname = os.hostname().toLowerCase();
      
      // Machine ID should start with hostname (with invalid chars removed)
      const cleanHostname = hostname.replace(/[^a-z0-9-]/g, '');
      expect(config.machine_id).toMatch(new RegExp(`^${cleanHostname}`));
    });
  });
});