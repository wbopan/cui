import { mock } from 'bun:test';

/**
 * Creates a complete mock of EventEmitter with all methods.
 * This prevents test failures when classes extending EventEmitter are mocked incompletely.
 * 
 * Bun's mock.module() is globally persistent, so incomplete mocks in one test
 * affect all subsequent tests. This utility provides a complete mock.
 */
export function createMockEventEmitter(): any {
  const listeners = new Map<string | symbol, Function[]>();
  
  return {
    // Core EventEmitter methods
    on: mock((event: string | symbol, listener: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(listener);
      return this;
    }),
    
    emit: mock((event: string | symbol, ...args: any[]) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach(listener => listener(...args));
      }
      return eventListeners ? eventListeners.length > 0 : false;
    }),
    
    removeAllListeners: mock((event?: string | symbol) => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
      return this;
    }),
    
    removeListener: mock((event: string | symbol, listener: Function) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(listener);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      }
      return this;
    }),
    
    off: mock((event: string | symbol, listener: Function) => {
      return this.removeListener(event, listener);
    }),
    
    once: mock((event: string | symbol, listener: Function) => {
      const onceWrapper = (...args: any[]) => {
        this.removeListener(event, onceWrapper);
        listener(...args);
      };
      return this.on(event, onceWrapper);
    }),
    
    addListener: mock((event: string | symbol, listener: Function) => {
      return this.on(event, listener);
    }),
    
    prependListener: mock((event: string | symbol, listener: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.unshift(listener);
      return this;
    }),
    
    prependOnceListener: mock((event: string | symbol, listener: Function) => {
      const onceWrapper = (...args: any[]) => {
        this.removeListener(event, onceWrapper);
        listener(...args);
      };
      return this.prependListener(event, onceWrapper);
    }),
    
    listeners: mock((event: string | symbol) => {
      return listeners.get(event) || [];
    }),
    
    rawListeners: mock((event: string | symbol) => {
      return listeners.get(event) || [];
    }),
    
    listenerCount: mock((event: string | symbol) => {
      const eventListeners = listeners.get(event);
      return eventListeners ? eventListeners.length : 0;
    }),
    
    eventNames: mock(() => {
      return Array.from(listeners.keys());
    }),
    
    setMaxListeners: mock((n: number) => {
      return this;
    }),
    
    getMaxListeners: mock(() => {
      return 10; // Node.js default
    })
  };
}

/**
 * Creates a complete mock for ConversationStatusManager that extends EventEmitter.
 * Includes all EventEmitter methods plus ConversationStatusManager-specific methods.
 */
export function createMockConversationStatusManager(): any {
  const eventEmitterMock = createMockEventEmitter();
  
  return {
    ...eventEmitterMock,
    
    // ConversationStatusManager specific methods
    registerActiveSession: mock(),
    unregisterActiveSession: mock(),
    getConversationContext: mock(),
    getConversationStatus: mock(),
    isSessionActive: mock(),
    getStreamingId: mock(),
    getSessionId: mock(),
    getActiveSessionIds: mock(),
    getActiveStreamingIds: mock(),
    clear: mock(),
    getStats: mock(),
    updateConversationContext: mock(),
    getAllActiveContexts: mock(),
    getActiveConversations: mock(),
    size: mock(() => 0)
  };
}