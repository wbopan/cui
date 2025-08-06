import { storage } from '@/web/chat/utils/storage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

(global as any).localStorage = localStorageMock;

describe('storage utility', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return defaultValue when key does not exist', () => {
      const result = storage.get('non-existent', 'default');
      expect(result).toBe('default');
    });

    it('should return parsed value when key exists', () => {
      localStorageMock.setItem('test-key', JSON.stringify({ foo: 'bar' }));
      const result = storage.get('test-key', null);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return defaultValue when stored value is invalid JSON', () => {
      localStorageMock.setItem('test-key', 'invalid json');
      const result = storage.get('test-key', 'default');
      expect(result).toBe('default');
    });

    it('should return defaultValue when localStorage throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      
      const result = storage.get('test-key', 'default');
      expect(result).toBe('default');
    });
  });

  describe('set', () => {
    it('should store stringified value', () => {
      storage.set('test-key', { foo: 'bar' });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', '{"foo":"bar"}');
    });

    it('should handle storage errors silently', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage quota exceeded');
      });
      
      // Should not throw
      expect(() => storage.set('test-key', 'value')).not.toThrow();
    });
  });

  describe('remove', () => {
    it('should remove item from localStorage', () => {
      localStorageMock.setItem('test-key', 'value');
      storage.remove('test-key');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('should handle removal errors silently', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      
      // Should not throw
      expect(() => storage.remove('test-key')).not.toThrow();
    });
  });
});