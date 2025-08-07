import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { JsonLinesParser } from '@/services/json-lines-parser';
import { Readable } from 'stream';

describe('JsonLinesParser', () => {
  let parser: JsonLinesParser;

  beforeEach(() => {
    parser = new JsonLinesParser();
  });

  describe('parsing valid JSONL', () => {
    it('should parse single line JSON', () => {
      return new Promise<void>((resolve) => {
        const input = '{"type":"test","value":123}\n';
        const expected = { type: 'test', value: 123 };

        parser.on('data', (data) => {
          expect(data).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should parse multiple lines of JSON', () => {
      return new Promise<void>((resolve) => {
        const input = '{"line":1}\n{"line":2}\n{"line":3}\n';
        const expected = [
          { line: 1 },
          { line: 2 },
          { line: 3 }
        ];
        const results: any[] = [];

        parser.on('data', (data) => {
          results.push(data);
        });

        parser.on('end', () => {
          expect(results).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should handle incomplete lines across chunks', () => {
      return new Promise<void>((resolve) => {
        const chunk1 = '{"type":"par';
        const chunk2 = 'tial","val';
        const chunk3 = 'ue":42}\n';
        const expected = { type: 'partial', value: 42 };

        parser.on('data', (data) => {
          expect(data).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(chunk1));
        parser.write(Buffer.from(chunk2));
        parser.write(Buffer.from(chunk3));
        parser.end();
      });
    });

    it('should skip empty lines', () => {
      return new Promise<void>((resolve) => {
        const input = '{"line":1}\n\n\n{"line":2}\n';
        const results: any[] = [];

        parser.on('data', (data) => {
          results.push(data);
        });

        parser.on('end', () => {
          expect(results).toEqual([{ line: 1 }, { line: 2 }]);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should handle data without trailing newline in flush', () => {
      return new Promise<void>((resolve) => {
        const input = '{"type":"no-newline"}';
        const expected = { type: 'no-newline' };

        parser.on('data', (data) => {
          expect(data).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });
  });

  describe('error handling', () => {
    it('should emit error for invalid JSON', () => {
      return new Promise<void>((resolve) => {
        const input = '{"invalid": json}\n';

        parser.on('error', (error) => {
          expect(error.message).toContain('Invalid JSON');
          resolve();
        });

        parser.write(Buffer.from(input));
      });
    });

    it('should continue parsing after invalid line', () => {
      return new Promise<void>((resolve) => {
        const input = '{"valid":1}\n{invalid json}\n{"valid":2}\n';
        const results: any[] = [];
        let errorCount = 0;

        parser.on('data', (data) => {
          results.push(data);
        });

        parser.on('error', () => {
          errorCount++;
        });

        parser.on('end', () => {
          expect(results).toEqual([{ valid: 1 }, { valid: 2 }]);
          expect(errorCount).toBe(1);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should emit error for invalid JSON in flush', () => {
      return new Promise<void>((resolve) => {
        const input = '{"incomplete": ';

        parser.on('error', (error) => {
          expect(error.message).toContain('Invalid JSON');
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });
  });

  describe('stream integration', () => {
    it('should work with readable streams', () => {
      return new Promise<void>((resolve) => {
        const input = new Readable();
        const lines = [
          '{"id":1,"name":"Alice"}\n',
          '{"id":2,"name":"Bob"}\n',
          '{"id":3,"name":"Charlie"}\n'
        ];
        const results: any[] = [];

        input
          .pipe(parser)
          .on('data', (data) => {
            results.push(data);
          })
          .on('end', () => {
            expect(results).toHaveLength(3);
            expect(results[0]).toEqual({ id: 1, name: 'Alice' });
            expect(results[1]).toEqual({ id: 2, name: 'Bob' });
            expect(results[2]).toEqual({ id: 3, name: 'Charlie' });
            resolve();
          });

        lines.forEach(line => input.push(line));
        input.push(null);
      });
    });
  });

  describe('utility methods', () => {
    it('should reset buffer state', () => {
      parser.write(Buffer.from('{"partial":'));
      expect(parser.getBuffer()).toBe('{"partial":');
      
      parser.reset();
      expect(parser.getBuffer()).toBe('');
    });

    it('should return current buffer content', () => {
      expect(parser.getBuffer()).toBe('');
      
      parser.write(Buffer.from('{"incomplete"'));
      expect(parser.getBuffer()).toBe('{"incomplete"');
    });
  });

  describe('edge cases', () => {
    it('should handle very large JSON objects', () => {
      return new Promise<void>((resolve) => {
        const largeObject = {
          data: Array(1000).fill(0).map((_, i) => ({
            id: i,
            value: `value_${i}`,
            nested: { a: i, b: i * 2 }
          }))
        };
        const input = JSON.stringify(largeObject) + '\n';

        parser.on('data', (data) => {
          expect(data).toEqual(largeObject);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should handle Unicode characters correctly', () => {
      return new Promise<void>((resolve) => {
        const input = '{"text":"Hello 世界 🌍"}\n';
        const expected = { text: 'Hello 世界 🌍' };

        parser.on('data', (data) => {
          expect(data).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });

    it('should handle escaped characters in JSON', () => {
      return new Promise<void>((resolve) => {
        const input = '{"text":"Line 1\\nLine 2\\tTabbed","path":"C:\\\\Users\\\\test"}\n';
        const expected = {
          text: 'Line 1\nLine 2\tTabbed',
          path: 'C:\\Users\\test'
        };

        parser.on('data', (data) => {
          expect(data).toEqual(expected);
          resolve();
        });

        parser.write(Buffer.from(input));
        parser.end();
      });
    });
  });
});