import { Response } from 'express';
import { StreamEvent } from '@/types/index.js';
import { EventEmitter } from 'events';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';

/**
 * Manages streaming connections to multiple clients
 */
export class StreamManager extends EventEmitter {
  private clients: Map<string, Set<Response>> = new Map();
  private logger: Logger;
  private heartbeatInterval?: NodeJS.Timeout;
  
  // Send heartbeat every 30 seconds to keep connections alive
  private readonly HEARTBEAT_INTERVAL_MS = 30000;

  constructor() {
    super();
    this.logger = createLogger('StreamManager');
  }

  /**
   * Add a client to receive stream updates
   */
  addClient(streamingId: string, res: Response): void {
    this.logger.debug('Adding client to stream', { streamingId });
    
    // Configure response for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Initialize client set if needed
    if (!this.clients.has(streamingId)) {
      this.clients.set(streamingId, new Set());
    }
    
    // Add this client to the session
    this.clients.get(streamingId)!.add(res);
    
    this.logger.debug('Client added successfully', { 
      streamingId, 
      totalClients: this.clients.get(streamingId)!.size 
    });
    
    // Send initial connection confirmation
    const connectionMessage: StreamEvent = {
      type: 'connected',
      streaming_id: streamingId,
      timestamp: new Date().toISOString()
    };
    
    this.logger.debug('Sending initial SSE connection confirmation', { 
      streamingId,
      clientCount: this.clients.get(streamingId)!.size
    });
    
    this.sendSSEEvent(res, connectionMessage);
    
    // Start heartbeat if this is the first client
    this.startHeartbeat();
    
    // Clean up when client disconnects
    res.on('close', () => {
      this.removeClient(streamingId, res);
    });

    res.on('error', (error) => {
      this.logger.error('Stream error for session', error, { streamingId });
      this.removeClient(streamingId, res);
    });
  }

  /**
   * Remove a client connection
   */
  removeClient(streamingId: string, res: Response): void {
    const clients = this.clients.get(streamingId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(streamingId);
      }
    }
    this.emit('client-disconnected', { streamingId });
    
    // Stop heartbeat if no clients remain
    if (this.getTotalClientCount() === 0) {
      this.stopHeartbeat();
    }
  }

  /**
   * Broadcast an event to all clients watching a session
   */
  broadcast(streamingId: string, event: StreamEvent): void {
    this.logger.debug('Broadcasting event to clients', { 
      streamingId, 
      eventType: event?.type,
      eventSubtype: 'subtype' in event ? event.subtype : undefined 
    });
    
    const clients = this.clients.get(streamingId);
    if (!clients || clients.size === 0) {
      this.logger.debug('No clients found for streaming session, dropping message', { streamingId });
      return;
    }
    
    this.logger.debug('Found clients for broadcast', { 
      streamingId, 
      clientCount: clients.size 
    });
    
    const deadClients: Response[] = [];
    
    for (const client of clients) {
      try {
        this.sendSSEEvent(client, event);
        this.logger.debug('Successfully sent SSE event to client', { 
          streamingId, 
          eventType: event?.type,
          eventSubtype: 'subtype' in event ? event.subtype : undefined 
        });
      } catch (error) {
        this.logger.error('Failed to send SSE event to client', error, { streamingId });
        deadClients.push(client);
      }
    }
    
    // Clean up dead clients
    deadClients.forEach(client => this.removeClient(streamingId, client));
  }

  /**
   * Send an SSE event to a specific client
   */
  private sendSSEEvent(res: Response, message: StreamEvent, eventType?: string): void {
    if (res.writableEnded || res.destroyed) {
      throw new Error('Response is no longer writable');
    }
    
    let sseData = '';
    if (eventType) {
      sseData += `event: ${eventType}\n`;
    }
    sseData += `data: ${JSON.stringify(message)}\n\n`;
    
    // Log SSE event data
    this.logger.debug('Sending SSE event', {
      eventType,
      messageType: message?.type,
      messageSubtype: 'subtype' in message ? message.subtype : undefined,
      streamingId: 'streamingId' in message ? message.streamingId : 'streaming_id' in message ? message.streaming_id : undefined,
      sseDataLength: sseData.length
    });
    
    res.write(sseData);
  }

  /**
   * Send SSE heartbeat (comment) to keep connection alive
   */
  private sendHeartbeat(res: Response): void {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': heartbeat\n\n');
    }
  }

  /**
   * Get number of clients connected to a session
   */
  getClientCount(streamingId: string): number {
    return this.clients.get(streamingId)?.size || 0;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Close all connections for a session
   */
  closeSession(streamingId: string): void {
    const clients = this.clients.get(streamingId);
    if (!clients) return;
    
    const closeEvent: StreamEvent = {
      type: 'closed',
      streamingId: streamingId,
      timestamp: new Date().toISOString()
    };
    
    // Create array to avoid modifying set while iterating
    const clientsArray = Array.from(clients);
    
    this.logger.debug('Closing SSE session, sending close events to all clients', { 
      streamingId,
      clientCount: clientsArray.length 
    });
    
    for (const client of clientsArray) {
      try {
        this.sendSSEEvent(client, closeEvent);
        this.logger.debug('Sent SSE close event to client', { streamingId });
        client.end();
      } catch (error) {
        this.logger.error('Error closing SSE client connection', error, { streamingId });
      }
    }
    
    // Remove the entire session
    this.clients.delete(streamingId);
    
    // Stop heartbeat if no clients remain
    if (this.getTotalClientCount() === 0) {
      this.stopHeartbeat();
    }
  }

  /**
   * Get total number of clients across all sessions
   */
  getTotalClientCount(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  /**
   * Disconnect all clients from all sessions
   */
  disconnectAll(): void {
    for (const streamingId of this.clients.keys()) {
      this.closeSession(streamingId);
    }
    this.stopHeartbeat();
  }

  /**
   * Start periodic heartbeat to keep SSE connections alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return; // Already running
    }
    
    this.heartbeatInterval = setInterval(() => {
      this.logger.debug('Sending heartbeat to all clients');
      
      for (const clients of this.clients.values()) {
        for (const client of clients) {
          try {
            this.sendHeartbeat(client);
          } catch (error) {
            this.logger.debug('Failed to send heartbeat to client', { error });
          }
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop periodic heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
      this.logger.debug('Stopped heartbeat');
    }
  }
}