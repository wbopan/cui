import type {
  ConversationSummary,
  StartConversationRequest,
  StartConversationResponse,
  ConversationDetailsResponse,
  ApiError,
  WorkingDirectoriesResponse,
  PermissionRequest,
  PermissionDecisionRequest,
  PermissionDecisionResponse,
  FileSystemListQuery,
  FileSystemListResponse,
  CommandsResponse,
} from '../types';
import { getAuthToken } from '../../hooks/useAuth';
type GeminiHealthResponse = { status: 'healthy' | 'unhealthy'; message: string; apiKeyValid: boolean };

class ApiService {
  private baseUrl = '';

  private async apiCall<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`;
    const method = options?.method || 'GET';
    
    // Log request
    console.log(`[API] ${method} ${fullUrl}`, options?.body ? JSON.parse(options.body as string) : '');
    
    // Get auth token for Bearer authorization
    const authToken = getAuthToken();
    const headers = new Headers(options?.headers as HeadersInit);
    headers.set('Content-Type', 'application/json');
    
    // Add Bearer token if available
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    
    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });

      const data = await response.json();
      
      // Log response
      console.log(`[API Response] ${fullUrl}:`, data);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error((data as ApiError).error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      // console.error(`[API Error] ${fullUrl}:`, error);
      throw error;
    }
  }

  async getConversations(params?: {
    limit?: number;
    offset?: number;
    projectPath?: string;
    hasContinuation?: boolean;
    archived?: boolean;
    pinned?: boolean;
  }): Promise<{ conversations: ConversationSummary[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.projectPath) searchParams.append('projectPath', params.projectPath);
    if (params?.hasContinuation !== undefined) searchParams.append('hasContinuation', params.hasContinuation.toString());
    if (params?.archived !== undefined) searchParams.append('archived', params.archived.toString());
    if (params?.pinned !== undefined) searchParams.append('pinned', params.pinned.toString());
    searchParams.append('sortBy', 'updated');
    searchParams.append('order', 'desc');

    return this.apiCall(`/api/conversations?${searchParams}`);
  }

  async getConversationDetails(sessionId: string): Promise<ConversationDetailsResponse> {
    return this.apiCall(`/api/conversations/${sessionId}`);
  }

  async startConversation(request: StartConversationRequest): Promise<StartConversationResponse> {
    return this.apiCall('/api/conversations/start', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }


  async stopConversation(streamingId: string): Promise<{ success: boolean }> {
    return this.apiCall(`/api/conversations/${streamingId}/stop`, {
      method: 'POST',
    });
  }

  getStreamUrl(streamingId: string): string {
    return `/api/stream/${streamingId}`;
  }

  async getWorkingDirectories(): Promise<WorkingDirectoriesResponse> {
    return this.apiCall('/api/working-directories');
  }

  async getPermissions(params?: { 
    streamingId?: string; 
    status?: 'pending' | 'approved' | 'denied' 
  }): Promise<{ permissions: PermissionRequest[] }> {
    const searchParams = new URLSearchParams();
    if (params?.streamingId) searchParams.append('streamingId', params.streamingId);
    if (params?.status) searchParams.append('status', params.status);
    
    return this.apiCall(`/api/permissions?${searchParams}`);
  }

  async sendPermissionDecision(
    requestId: string,
    decision: PermissionDecisionRequest
  ): Promise<PermissionDecisionResponse> {
    return this.apiCall(`/api/permissions/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify(decision),
    });
  }

  async updateSession(
    sessionId: string,
    updates: {
      customName?: string;
      pinned?: boolean;
      archived?: boolean;
      continuationSessionId?: string;
      initialCommitHead?: string;
    }
  ): Promise<{ success: boolean; sessionId: string; updatedFields: Record<string, unknown> }> {
    return this.apiCall(`/api/conversations/${sessionId}/update`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async listDirectory(params: FileSystemListQuery): Promise<FileSystemListResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('path', params.path);
    if (params.recursive !== undefined) searchParams.append('recursive', params.recursive.toString());
    if (params.respectGitignore !== undefined) searchParams.append('respectGitignore', params.respectGitignore.toString());
    
    return this.apiCall(`/api/filesystem/list?${searchParams}`);
  }

  async getCommands(workingDirectory?: string): Promise<CommandsResponse> {
    const searchParams = new URLSearchParams();
    if (workingDirectory) {
      searchParams.append('workingDirectory', workingDirectory);
    }
    
    return this.apiCall(`/api/system/commands?${searchParams}`);
  }

  async getSystemStatus(): Promise<any> {
    return this.apiCall('/api/system/status');
  }

  async getRecentLogs(limit?: number): Promise<{ logs: string[] }> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.append('limit', limit.toString());
    return this.apiCall(`/api/logs/recent?${searchParams}`);
  }

  getLogStreamUrl(): string {
    return '/api/logs/stream';
  }

  async readFile(path: string): Promise<{ content: string }> {
    const searchParams = new URLSearchParams();
    searchParams.append('path', path);
    return this.apiCall(`/api/filesystem/read?${searchParams}`);
  }

  async archiveAllSessions(): Promise<{ success: boolean; archivedCount: number; message?: string; error?: string }> {
    return this.apiCall('/api/conversations/archive-all', {
      method: 'POST',
    });
  }

  async transcribeAudio(audioBase64: string, mimeType: string): Promise<{ text: string }> {
    return this.apiCall('/api/gemini/transcribe', {
      method: 'POST',
      body: JSON.stringify({
        audio: audioBase64,
        mimeType: mimeType
      }),
    });
  }

  async getGeminiHealth(): Promise<GeminiHealthResponse> {
    return this.apiCall<GeminiHealthResponse>('/api/gemini/health');
  }

  async getConfig(): Promise<any> {
    return this.apiCall('/api/config');
  }

  async updateConfig(updates: Partial<any>): Promise<any> {
    return this.apiCall('/api/config', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getWebPushStatus(): Promise<{ enabled: boolean; subscriptionCount: number; hasPublicKey: boolean; publicKey?: string }> {
    return this.apiCall('/api/notifications/status');
  }

  async registerWebPush(subscription: PushSubscription): Promise<{ success: boolean }> {
    return this.apiCall('/api/notifications/register', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  async unregisterWebPush(endpoint: string): Promise<{ success: boolean }> {
    return this.apiCall('/api/notifications/unregister', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  }

  async sendTestNotification(): Promise<{ success: boolean; sent: number; failed: number }> {
    return this.apiCall('/api/notifications/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // For endpoints that need direct fetch with auth (like SSE streams)
  async fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
    const authToken = getAuthToken();
    const headers: Record<string, string> = {
      ...options?.headers as Record<string, string>,
    };
    
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    
    return fetch(url, {
      ...options,
      headers,
    });
  }
}

export const api = new ApiService();