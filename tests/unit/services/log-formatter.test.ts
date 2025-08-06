// No imports needed - using Jest globals
import { LogFormatter } from '@/services/log-formatter';
import { Readable, Writable } from 'stream';

describe('LogFormatter', () => {
  let formatter: LogFormatter;
  let chunks: string[];

  beforeEach(() => {
    formatter = new LogFormatter();
    chunks = [];
  });

  // Helper function to test the formatter
  async function testFormatter(input: string | string[]): Promise<string[]> {
    const inputs = Array.isArray(input) ? input : [input];
    const readable = Readable.from(inputs);
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });

    readable.pipe(formatter).pipe(writable);

    return new Promise((resolve, reject) => {
      writable.on('finish', () => resolve(chunks));
      writable.on('error', reject);
    });
  }

  describe('basic log formatting', () => {
    it('should format a basic log with time, level, and msg', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Hello world'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/^\x1b\[90m\d{2}:\d{2}:\d{2} (AM|PM)\x1b\[0m Hello world\n$/);
    });

    it('should handle numeric timestamps', async () => {
      const log = {
        level: 30,
        time: 1705317045123,
        msg: 'Numeric timestamp test'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/^\x1b\[90m\d{2}:\d{2}:\d{2} (AM|PM)\x1b\[0m Numeric timestamp test\n$/);
    });

    it('should format 12-hour time correctly', async () => {
      // Test formatting for various times throughout the day
      // We'll create specific timestamps and verify the formatting logic
      
      // Helper to create a date with specific hour
      const createDateWithHour = (hour: number) => {
        const date = new Date('2024-01-15T00:00:00.000Z');
        date.setUTCHours(hour, 30, 45, 123);
        return date;
      };
      
      // Test midnight (00:xx should become 12:xx AM)
      const midnight = {
        level: 30,
        time: createDateWithHour(0).toISOString(),
        msg: 'Midnight test'
      };
      
      const result = await testFormatter(JSON.stringify(midnight));
      // Verify it contains AM/PM format
      expect(result[0]).toMatch(/^\x1b\[90m\d{2}:\d{2}:\d{2} (AM|PM)\x1b\[0m/);
      
      // Test that hour formatting follows 12-hour format rules
      // by checking specific hours and their expected format
      const testCases = [
        { hour: 0, expectedHour: '12', period: 'AM' },  // midnight
        { hour: 1, expectedHour: '01', period: 'AM' },  // 1 AM
        { hour: 11, expectedHour: '11', period: 'AM' }, // 11 AM
        { hour: 12, expectedHour: '12', period: 'PM' }, // noon
        { hour: 13, expectedHour: '01', period: 'PM' }, // 1 PM
        { hour: 23, expectedHour: '11', period: 'PM' }  // 11 PM
      ];
      
      // Verify the formatting logic without depending on timezone
      for (const testCase of testCases) {
        const log = {
          level: 30,
          time: createDateWithHour(testCase.hour).getTime(),
          msg: `Test ${testCase.hour}:00`
        };
        
        const res = await testFormatter(JSON.stringify(log));
        // Check that it has the proper time format
        expect(res[0]).toMatch(/^\x1b\[90m\d{2}:\d{2}:\d{2} (AM|PM)\x1b\[0m/);
        
        // Extract the formatted time to verify AM/PM
        const match = res[0].match(/(\d{2}):(\d{2}):(\d{2}) (AM|PM)/);
        expect(match).toBeTruthy();
        
        if (match) {
          const formattedHour = match[1];
          const period = match[4];
          
          // For local time checks, we verify the formatting follows 12-hour rules
          const hour = parseInt(formattedHour, 10);
          expect(hour).toBeGreaterThanOrEqual(1);
          expect(hour).toBeLessThanOrEqual(12);
          expect(['AM', 'PM']).toContain(period);
        }
      }
    });
  });

  describe('component field handling', () => {
    it('should format log with component field in bold blue brackets', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Component test',
        component: 'ServerModule'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toMatch(/\x1b\[1m\x1b\[34m\[ServerModule\]\x1b\[0m Component test/);
    });

    it('should handle logs without component field', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'No component'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      // Check that there's no component field (look for the blue color code before brackets)
      expect(result[0]).not.toContain('\x1b[34m[');
      expect(result[0]).not.toContain(']\x1b[0m');
    });
  });

  describe('context fields handling', () => {
    it('should format string context fields with quotes', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Context test',
        requestId: 'req-123',
        sessionId: 'sess-456'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('requestId="req-123"');
      expect(result[0]).toContain('sessionId="sess-456"');
    });

    it('should format number context fields without quotes', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Number context',
        count: 42,
        duration: 123.45
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('count=42');
      expect(result[0]).toContain('duration=123.45');
    });

    it('should format boolean context fields without quotes', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Boolean context',
        success: true,
        failed: false
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('success=true');
      expect(result[0]).toContain('failed=false');
    });

    it('should format object context fields as JSON', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Object context',
        metadata: { foo: 'bar', count: 123 },
        tags: ['tag1', 'tag2']
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('metadata={"foo":"bar","count":123}');
      expect(result[0]).toContain('tags=["tag1","tag2"]');
    });

    it('should exclude pino internal fields', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Internal fields test',
        pid: 12345,
        hostname: 'test-host',
        v: 1,
        customField: 'should appear'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).not.toContain('pid=');
      expect(result[0]).not.toContain('hostname=');
      expect(result[0]).not.toContain('v=');
      expect(result[0]).toContain('customField="should appear"');
    });

    it('should handle null and undefined values', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Null test',
        nullField: null,
        undefinedField: undefined,
        validField: 'valid'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).not.toContain('nullField');
      expect(result[0]).not.toContain('undefinedField');
      expect(result[0]).toContain('validField="valid"');
    });
  });

  describe('error handling', () => {
    it('should format err field with message', async () => {
      const log = {
        level: 50,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Error occurred',
        err: {
          message: 'Something went wrong',
          stack: 'Error: Something went wrong\n    at test.js:10:5'
        }
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('err="Something went wrong"');
      expect(result[0]).toContain('Error: Something went wrong\n    at test.js:10:5');
    });

    it('should format error field with message', async () => {
      const log = {
        level: 50,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Error occurred',
        error: {
          message: 'Another error',
          stack: 'Error: Another error\n    at test.js:20:10'
        }
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('error="Another error"');
      // Stack trace is only printed for 'err' field, not 'error'
      expect(result[0]).not.toContain('Error: Another error\n    at test.js:20:10');
    });

    it('should handle error without stack trace', async () => {
      const log = {
        level: 50,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Error without stack',
        err: {
          message: 'No stack available'
        }
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('err="No stack available"');
      // The result includes a newline at the end, so we check the actual content
      expect(result[0].endsWith('\n')).toBe(true);
      expect(result[0].slice(0, -1).includes('\n')).toBe(false); // No stack trace in the content
    });

    it('should handle error as plain object', async () => {
      const log = {
        level: 50,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Plain error object',
        err: { code: 'ERR_001', details: 'Some details' }
      };
      
      const result = await testFormatter(JSON.stringify(log));
      expect(result[0]).toContain('err={"code":"ERR_001","details":"Some details"}');
    });
  });

  describe('invalid input handling', () => {
    it('should pass through non-JSON lines as-is', async () => {
      const plainText = 'This is not JSON';
      const result = await testFormatter(plainText);
      expect(result[0]).toBe(plainText);
    });

    it('should pass through invalid JSON as-is', async () => {
      const invalidJson = '{ invalid json }';
      const result = await testFormatter(invalidJson);
      expect(result[0]).toBe(invalidJson);
    });

    it('should handle empty lines', async () => {
      const result = await testFormatter('');
      expect(result).toHaveLength(0);
    });

    it('should handle whitespace-only lines', async () => {
      const result = await testFormatter('   \n   ');
      expect(result).toHaveLength(0);
    });

    it('should handle multiple lines with mixed valid and invalid JSON', async () => {
      const lines = [
        JSON.stringify({ level: 30, time: '2024-01-15T10:30:45.123Z', msg: 'Valid line 1' }),
        'Plain text line',
        JSON.stringify({ level: 30, time: '2024-01-15T10:30:46.123Z', msg: 'Valid line 2' }),
        '{ broken json',
        '',
        JSON.stringify({ level: 30, time: '2024-01-15T10:30:47.123Z', msg: 'Valid line 3' })
      ];
      
      const result = await testFormatter(lines);
      expect(result).toHaveLength(5); // 3 valid JSON + 2 invalid (empty line doesn't produce output but the others do)
      expect(result[0]).toContain('Valid line 1');
      expect(result[1]).toBe('Plain text line');
      expect(result[2]).toContain('Valid line 2');
      expect(result[3]).toBe('{ broken json');
      expect(result[4]).toContain('Valid line 3');
    });
  });

  describe('complex scenarios', () => {
    it('should handle logs with all features combined', async () => {
      const log = {
        level: 40,
        time: '2024-01-15T14:30:45.123Z',
        msg: 'Complex log entry',
        component: 'API',
        requestId: 'req-789',
        duration: 1234,
        success: true,
        metadata: { endpoint: '/api/test' },
        err: {
          message: 'Partial failure',
          stack: 'Error: Partial failure\n    at handler.js:50:15\n    at async.js:10:5'
        }
      };
      
      const result = await testFormatter(JSON.stringify(log));
      // The time in the log is UTC, so it will be converted to local time
      // We can't predict the exact local time, so just check the format
      expect(result[0]).toMatch(/^\x1b\[90m\d{2}:\d{2}:\d{2} (AM|PM)\x1b\[0m/);
      expect(result[0]).toContain('\x1b[1m\x1b[34m[API]\x1b[0m');
      expect(result[0]).toContain('Complex log entry');
      expect(result[0]).toContain('requestId="req-789"');
      expect(result[0]).toContain('duration=1234');
      expect(result[0]).toContain('success=true');
      expect(result[0]).toContain('metadata={"endpoint":"/api/test"}');
      expect(result[0]).toContain('err="Partial failure"');
      expect(result[0]).toContain('Error: Partial failure\n    at handler.js:50:15\n    at async.js:10:5');
    });

    it('should maintain order of context fields', async () => {
      const log = {
        level: 30,
        time: '2024-01-15T10:30:45.123Z',
        msg: 'Order test',
        zebra: 'last',
        alpha: 'first',
        middle: 'center'
      };
      
      const result = await testFormatter(JSON.stringify(log));
      const contextPart = result[0].split('Order test')[1];
      const zebraIndex = contextPart.indexOf('zebra=');
      const alphaIndex = contextPart.indexOf('alpha=');
      const middleIndex = contextPart.indexOf('middle=');
      
      // Fields should appear in the order they were in the object
      expect(zebraIndex).toBeLessThan(alphaIndex);
      expect(alphaIndex).toBeLessThan(middleIndex);
    });
  });

  describe('stream behavior', () => {
    it('should handle multiple chunks in sequence', async () => {
      const logs = [
        { level: 30, time: '2024-01-15T10:30:45.123Z', msg: 'First' },
        { level: 30, time: '2024-01-15T10:30:46.123Z', msg: 'Second' },
        { level: 30, time: '2024-01-15T10:30:47.123Z', msg: 'Third' }
      ];
      
      const result = await testFormatter(logs.map(l => JSON.stringify(l)));
      expect(result).toHaveLength(3);
      expect(result[0]).toContain('First');
      expect(result[1]).toContain('Second');
      expect(result[2]).toContain('Third');
    });

    it('should work with stream piping', async () => {
      const log = { level: 30, time: '2024-01-15T10:30:45.123Z', msg: 'Stream test' };
      const readable = new Readable({
        read() {
          this.push(JSON.stringify(log));
          this.push(null);
        }
      });

      const chunks: string[] = [];
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });

      const formatter = new LogFormatter();
      readable.pipe(formatter).pipe(writable);

      await new Promise((resolve) => writable.on('finish', resolve));
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('Stream test');
    });
  });
});