import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { MCPConfigGenerator } from '@/services/mcp-config-generator';
import { readFileSync, existsSync } from 'fs';

describe('MCPConfigGenerator', () => {
  let generator: MCPConfigGenerator;

  beforeEach(() => {
    // MCPConfigGenerator no longer uses ConfigService
    
    generator = new MCPConfigGenerator();
  });

  afterEach(() => {
    // Clean up any generated files
    generator.cleanup();
  });

  describe('generateConfig', () => {
    it('should generate MCP config file with correct structure', async () => {
      const port = 3001;
      const configPath = await generator.generateConfig(port);

      // Check file exists
      expect(existsSync(configPath)).toBe(true);

      // Read and parse the config
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Verify structure
      expect(config).toHaveProperty('mcpServers');
      expect(config.mcpServers).toHaveProperty('cui-permissions');
      
      const serverConfig = config.mcpServers['cui-permissions'];
      expect(serverConfig.command).toBe('node');
      expect(serverConfig.args).toHaveLength(1);
      expect(serverConfig.args[0]).toContain('mcp-server/index.js');
      
      // Check environment variables
      expect(serverConfig.env).toEqual({
        CUI_SERVER_URL: `http://localhost:${port}`,
        CUI_SERVER_PORT: String(port),
        LOG_LEVEL: expect.any(String)
      });
    });

    it('should generate unique config file paths', async () => {
      const generator1 = new MCPConfigGenerator();
      const generator2 = new MCPConfigGenerator();

      const path1 = await generator1.generateConfig(3001);
      const path2 = await generator2.generateConfig(3002);

      expect(path1).not.toBe(path2);

      // Clean up
      generator1.cleanup();
      generator2.cleanup();
    });

    it('should use provided port in environment variables', async () => {
      const port = 4567;
      const configPath = await generator.generateConfig(port);

      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      expect(config.mcpServers['cui-permissions'].env.CUI_SERVER_URL).toBe(`http://localhost:${port}`);
      expect(config.mcpServers['cui-permissions'].env.CUI_SERVER_PORT).toBe('4567');
    });
  });

  describe('getConfigPath', () => {
    it('should return the generated config path', async () => {
      const port = 3001;
      const generatedPath = await generator.generateConfig(port);
      const retrievedPath = generator.getConfigPath();

      expect(retrievedPath).toBe(generatedPath);
    });
  });

  describe('cleanup', () => {
    it('should remove the generated config file', async () => {
      const configPath = await generator.generateConfig(3001);
      
      expect(existsSync(configPath)).toBe(true);

      generator.cleanup();

      expect(existsSync(configPath)).toBe(false);
    });

    it('should handle cleanup when file does not exist', async () => {
      // Get path without generating file
      await generator.generateConfig(3001);
      const configPath = generator.getConfigPath();
      
      // Manually remove file
      generator.cleanup();

      // Try cleanup again - should not throw
      expect(() => generator.cleanup()).not.toThrow();
    });
  });
});