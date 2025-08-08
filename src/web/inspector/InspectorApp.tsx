import React, { useState, useEffect, useRef } from 'react';
import LogMonitor from './LogMonitor';
import { api } from '../chat/services/api';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Textarea } from '@/web/chat/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/web/chat/components/ui/select';
import { Checkbox } from '@/web/chat/components/ui/checkbox';
import { Label } from '@/web/chat/components/ui/label';
import { cn } from '@/web/chat/lib/utils';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'json-viewer': any;
    }
  }
}

function InspectorApp() {
  const [currentStream, setCurrentStream] = useState<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    status: true,
    config: true,
    start: true,
    stop: true,
    list: true,
    rename: true,
    permissions: true,
    permissionDecision: true,
    listDir: true,
    readFile: true,
    workingDirs: true,
    commands: true,
    bulkOperations: true,
    geminiHealth: true,
    geminiTranscribe: true,
    geminiSummarize: true,
    notifications: true,
  });

  // Form states
  const [workingDir, setWorkingDir] = useState('/tmp');
  const [initialPrompt, setInitialPrompt] = useState('Hello');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [claudeExecutablePath, setClaudeExecutablePath] = useState('');
  const [permissionMode, setPermissionMode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [streamingId, setStreamingId] = useState('');
  const [stopStreamingId, setStopStreamingId] = useState('');
  const [detailSessionId, setDetailSessionId] = useState('');
  const [sidebarConversationsLimit, setSidebarConversationsLimit] = useState('20');
  const [sidebarConversationsOffset, setSidebarConversationsOffset] = useState('0');
  const [sidebarConversationsProjectPath, setSidebarConversationsProjectPath] = useState('');
  const [permissionsStreamingId, setPermissionsStreamingId] = useState('');
  const [permissionsStatus, setPermissionsStatus] = useState('');
  const [listPath, setListPath] = useState('');
  const [listRecursive, setListRecursive] = useState(false);
  const [listRespectGitignore, setListRespectGitignore] = useState(false);
  const [readPath, setReadPath] = useState('');
  const [logMonitorVisible, setLogMonitorVisible] = useState(false);
  
  // Update session states
  const [renameSessionId, setRenameSessionId] = useState('');
  const [renameCustomName, setRenameCustomName] = useState('');
  const [sessionPinned, setSessionPinned] = useState(false);
  const [sessionArchived, setSessionArchived] = useState(false);
  const [continuationSessionId, setContinuationSessionId] = useState('');
  const [initialCommitHead, setInitialCommitHead] = useState('');
  const [sessionPermissionMode, setSessionPermissionMode] = useState('');
  
  // Permission decision states
  const [permissionRequestId, setPermissionRequestId] = useState('');
  const [permissionDecisionBody, setPermissionDecisionBody] = useState(JSON.stringify({
    action: 'approve',
    modifiedInput: {},
    denyReason: ''
  }, null, 2));

  // Result states
  const [results, setResults] = useState<Record<string, any>>({});
  
  // Working directories state
  const [workingDirectories, setWorkingDirectories] = useState<any[]>([]);
  const [streamResult, setStreamResult] = useState<JSX.Element[]>([]);
  
  // Commands state
  const [commandsWorkingDirectory, setCommandsWorkingDirectory] = useState('');
  
  // Config state
  const [configUpdateBody, setConfigUpdateBody] = useState('{}');
  
  // Gemini API states
  const [geminiAudioFile, setGeminiAudioFile] = useState<File | null>(null);
  const [geminiAudioBase64, setGeminiAudioBase64] = useState('');
  const [geminiMimeType, setGeminiMimeType] = useState('audio/wav');
  const [geminiTextToSummarize, setGeminiTextToSummarize] = useState('');

  // Notifications state
  const [notifTitle, setNotifTitle] = useState('CUI Test');
  const [notifMessage, setNotifMessage] = useState('This is a test notification');
  const [notifStatus, setNotifStatus] = useState<any>(null);

  const streamResultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAvailableSessions();
  }, []);

  const showJson = (resultId: string, data: any) => {
    setResults(prev => ({ ...prev, [resultId]: data }));
  };

  const loadAvailableSessions = async () => {
    try {
      const data = await api.getConversations({ limit: 100 });
      setAvailableSessions(data.conversations || []);
    } catch (e) {
      // Silently fail
    }
  };

  const getWorkingDirectories = async () => {
    try {
      const data = await api.getWorkingDirectories();
      showJson('workingDirsResult', data);
      if (data.directories) {
        setWorkingDirectories(data.directories);
      }
    } catch (e: any) {
      showJson('workingDirsResult', { error: e.message });
    }
  };

  const getCommands = async () => {
    try {
      const data = await api.getCommands(commandsWorkingDirectory || undefined);
      showJson('commandsResult', data);
    } catch (e: any) {
      showJson('commandsResult', { error: e.message });
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const getNotificationStatus = async () => {
    try {
      const res = await api.fetchWithAuth('/api/notifications/status');
      const data = await res.json();
      setNotifStatus(data);
      showJson('notificationsStatus', data);
    } catch (e: any) {
      showJson('notificationsStatus', { error: e.message });
    }
  };

  const registerPush = async () => {
    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showJson('notificationsRegister', { error: 'Notification permission denied' });
        return;
      }
      // Ensure SW ready
      const registration = await navigator.serviceWorker.ready;
      // Fetch VAPID public key
      const statusRes = await api.fetchWithAuth('/api/notifications/status');
      const status = await statusRes.json();
      if (!status.publicKey) {
        showJson('notificationsRegister', { error: 'Server missing VAPID public key' });
        return;
      }
      // Subscribe
      const existing = await registration.pushManager.getSubscription();
      let subscription = existing;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.publicKey),
        });
      }
      // Register with backend
      const res = await api.fetchWithAuth('/api/notifications/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
      const data = await res.json();
      showJson('notificationsRegister', data);
    } catch (e: any) {
      showJson('notificationsRegister', { error: e.message });
    }
  };

  const unregisterPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        showJson('notificationsUnregister', { error: 'No active subscription' });
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const res = await api.fetchWithAuth('/api/notifications/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      const data = await res.json();
      showJson('notificationsUnregister', data);
    } catch (e: any) {
      showJson('notificationsUnregister', { error: e.message });
    }
  };

  const sendTestNotification = async () => {
    try {
      const res = await api.fetchWithAuth('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: notifTitle, message: notifMessage }),
      });
      const data = await res.json();
      showJson('notificationsTest', data);
    } catch (e: any) {
      showJson('notificationsTest', { error: e.message });
    }
  };

  const getConfig = async () => {
    try {
      const response = await api.fetchWithAuth('/api/config');
      const data = await response.json();
      showJson('configGetResult', data);
      
      // Set the update body to current config for easy editing
      setConfigUpdateBody(JSON.stringify(data, null, 2));
    } catch (e: any) {
      showJson('configGetResult', { error: e.message });
    }
  };

  const updateConfig = async () => {
    try {
      let body;
      try {
        body = JSON.parse(configUpdateBody);
      } catch (e) {
        showJson('configUpdateResult', { error: 'Invalid JSON' });
        return;
      }

      const response = await api.fetchWithAuth('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      showJson('configUpdateResult', data);
    } catch (e: any) {
      showJson('configUpdateResult', { error: e.message });
    }
  };

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getSystemStatus = async () => {
    try {
      const data = await api.getSystemStatus();
      showJson('statusResult', data);
    } catch (e: any) {
      showJson('statusResult', { error: e.message });
    }
  };

  const listConversationsSidebar = async () => {
    try {
      const data = await api.getConversations({
        limit: sidebarConversationsLimit ? parseInt(sidebarConversationsLimit) : undefined,
        offset: sidebarConversationsOffset ? parseInt(sidebarConversationsOffset) : undefined,
        projectPath: sidebarConversationsProjectPath || undefined
      });
      showJson('sidebarConversationsResult', data);

      if (data.conversations) {
        setAvailableSessions(data.conversations);
      }
    } catch (e: any) {
      showJson('sidebarConversationsResult', { error: e.message });
    }
  };

  const startConversation = async () => {
    try {
      const body: any = {
        workingDirectory: workingDir,
        initialPrompt: initialPrompt
      };

      if (model && model !== 'default-model') body.model = model;
      if (systemPrompt) body.systemPrompt = systemPrompt;
      if (claudeExecutablePath) body.claudeExecutablePath = claudeExecutablePath;
      if (permissionMode && permissionMode !== 'default-mode') body.permissionMode = permissionMode;

      const data = await api.startConversation(body);
      showJson('startResult', data);

      if (data.streamingId) {
        setStreamingId(data.streamingId);
        setStopStreamingId(data.streamingId);
        startStream(data.streamingId);
        loadAvailableSessions();
      }
    } catch (e: any) {
      showJson('startResult', { error: e.message });
    }
  };


  const startStream = async (id?: string) => {
    const streamId = id || streamingId;
    if (!streamId) {
      setStreamResult([<span key="error" className="text-red-400">Please enter a streaming ID</span>]);
      return;
    }

    setStreamResult([<span key="connecting" className="text-green-400">Connecting to stream...</span>]);

    try {
      const response = await api.fetchWithAuth(api.getStreamUrl(streamId));
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      setCurrentStream(reader);
      let buffer = '';
      let lineCount = 0;
      let hasReceivedFirstMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setStreamResult(prev => [...prev, <span key="ended" className="text-neutral-500">[Stream ended]</span>]);
          break;
        }

        const decoded = decoder.decode(value, { stream: true });
        buffer += decoded;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        const newLines: JSX.Element[] = [];
        
        for (const line of lines) {
          if (line.trim()) {
            // Parse SSE format: remove "data: " prefix
            let jsonLine = line;
            if (line.startsWith('data: ')) {
              jsonLine = line.substring(6);
            }
            
            // Skip SSE comments (lines starting with :)
            if (line.startsWith(':')) {
              continue;
            }
            
            lineCount++;
            const newLine = (
              <div key={`line-${lineCount}`} className="my-0.5 py-0.5 border-b border-dotted border-neutral-700">
                <span className="text-neutral-500">{lineCount}:</span> {jsonLine}
              </div>
            );
            newLines.push(newLine);
          }
        }

        if (newLines.length > 0) {
          // Clear the "Connecting..." message on first real data
          if (!hasReceivedFirstMessage) {
            hasReceivedFirstMessage = true;
            setStreamResult(newLines);
          } else {
            setStreamResult(prev => [...prev, ...newLines]);
          }
        }
      }
    } catch (e: any) {
      setStreamResult(prev => [...prev, <span key="error" className="text-red-400">Error: {e.message}</span>]);
    }
  };

  const stopStream = () => {
    if (currentStream) {
      currentStream.cancel();
      setCurrentStream(null);
      setStreamResult(prev => [...prev, <span key="stopped" className="text-yellow-300">[Stream stopped by user]</span>]);
    }
  };

  const clearStream = () => {
    setStreamResult([]);
  };

  const stopConversation = async () => {
    try {
      const data = await api.stopConversation(stopStreamingId);
      showJson('stopResult', data);
    } catch (e: any) {
      showJson('stopResult', { error: e.message });
    }
  };

  const getConversationDetails = async () => {
    try {
      const data = await api.getConversationDetails(detailSessionId);
      showJson('detailsResult', data);
    } catch (e: any) {
      showJson('detailsResult', { error: e.message });
    }
  };

  const listPermissions = async () => {
    try {
      const data = await api.getPermissions({
        streamingId: permissionsStreamingId || undefined,
        status: (permissionsStatus === 'all' ? undefined : permissionsStatus) as 'pending' | 'approved' | 'denied' | undefined
      });
      showJson('permissionsResult', data);
    } catch (e: any) {
      showJson('permissionsResult', { error: e.message });
    }
  };

  const listDirectory = async () => {
    try {
      if (!listPath) {
        showJson('listResult', { error: 'Path is required' });
        return;
      }

      const data = await api.listDirectory({
        path: listPath,
        recursive: listRecursive,
        respectGitignore: listRespectGitignore
      });
      showJson('listResult', data);
    } catch (e: any) {
      showJson('listResult', { error: e.message });
    }
  };

  const readFile = async () => {
    try {
      if (!readPath) {
        showJson('readResult', { error: 'Path is required' });
        return;
      }

      const data = await api.readFile(readPath);
      showJson('readResult', data);
    } catch (e: any) {
      showJson('readResult', { error: e.message });
    }
  };

  const renameSession = async () => {
    try {
      if (!renameSessionId) {
        showJson('renameResult', { error: 'Session ID is required' });
        return;
      }

      // Use the new update endpoint with all fields
      const updateData: any = {};
      
      // Only include fields that have values or are explicitly set
      if (renameCustomName.trim() !== '') updateData.customName = renameCustomName.trim();
      updateData.pinned = sessionPinned;
      updateData.archived = sessionArchived;
      if (continuationSessionId.trim() !== '') updateData.continuationSessionId = continuationSessionId.trim();
      if (initialCommitHead.trim() !== '') updateData.initialCommitHead = initialCommitHead.trim();
      if (sessionPermissionMode.trim() !== '' && sessionPermissionMode !== 'keep-current') updateData.permissionMode = sessionPermissionMode.trim();
      
      const data = await api.updateSession(renameSessionId, updateData);
      showJson('renameResult', data);
      
      // Refresh available sessions to show updated names
      if (data.success) {
        loadAvailableSessions();
      }
    } catch (e: any) {
      showJson('renameResult', { error: e.message });
    }
  };
  
  const archiveAllSessions = async () => {
    try {
      const data = await api.archiveAllSessions();
      showJson('archiveAllResult', data);
      
      // Refresh available sessions to show updated archive status
      if (data.success) {
        loadAvailableSessions();
      }
    } catch (e: any) {
      showJson('archiveAllResult', { error: e.message });
    }
  };
  
  const makePermissionDecision = async () => {
    try {
      if (!permissionRequestId) {
        showJson('permissionDecisionResult', { error: 'Request ID is required' });
        return;
      }

      let body;
      try {
        body = JSON.parse(permissionDecisionBody);
      } catch (e) {
        showJson('permissionDecisionResult', { error: 'Invalid JSON body' });
        return;
      }

      const data = await api.sendPermissionDecision(permissionRequestId, body);
      showJson('permissionDecisionResult', data);
    } catch (e: any) {
      showJson('permissionDecisionResult', { error: e.message });
    }
  };

  const getGeminiHealth = async () => {
    try {
      const response = await api.fetchWithAuth('/api/gemini/health');
      const data = await response.json();
      showJson('geminiHealthResult', data);
    } catch (e: any) {
      showJson('geminiHealthResult', { error: e.message });
    }
  };

  const transcribeAudio = async () => {
    try {
      let body: any = {};
      
      if (geminiAudioFile) {
        // Use file upload
        const formData = new FormData();
        formData.append('audio', geminiAudioFile);
        
        const response = await api.fetchWithAuth('/api/gemini/transcribe', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        showJson('geminiTranscribeResult', data);
      } else if (geminiAudioBase64) {
        // Use base64
        const response = await api.fetchWithAuth('/api/gemini/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            audio: geminiAudioBase64,
            mimeType: geminiMimeType
          })
        });
        const data = await response.json();
        showJson('geminiTranscribeResult', data);
      } else {
        showJson('geminiTranscribeResult', { error: 'Please provide an audio file or base64 data' });
      }
    } catch (e: any) {
      showJson('geminiTranscribeResult', { error: e.message });
    }
  };

  const summarizeText = async () => {
    try {
      if (!geminiTextToSummarize) {
        showJson('geminiSummarizeResult', { error: 'Please provide text to summarize' });
        return;
      }

      const response = await api.fetchWithAuth('/api/gemini/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: geminiTextToSummarize
        })
      });
      const data = await response.json();
      showJson('geminiSummarizeResult', data);
    } catch (e: any) {
      showJson('geminiSummarizeResult', { error: e.message });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setGeminiAudioFile(e.target.files[0]);
      setGeminiAudioBase64(''); // Clear base64 when file is selected
    }
  };

  const copyJsonToClipboard = async (data: any, buttonRef: HTMLButtonElement) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      
      const originalText = buttonRef.textContent;
      buttonRef.textContent = 'Copied!';
      buttonRef.classList.add('!bg-green-600');
      
      setTimeout(() => {
        buttonRef.textContent = originalText;
        buttonRef.classList.remove('!bg-green-600');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyStreamToClipboard = async (buttonRef: HTMLButtonElement) => {
    try {
      const content = streamResult
        .filter(el => el.type === 'div')
        .map(el => el.props.children[2])
        .join('\n');
      
      await navigator.clipboard.writeText(content);
      
      const originalText = buttonRef.textContent;
      buttonRef.textContent = 'Copied!';
      buttonRef.classList.add('!bg-green-600');
      
      setTimeout(() => {
        buttonRef.textContent = originalText;
        buttonRef.classList.remove('!bg-green-600');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const JsonViewer = ({ data, resultId }: { data: any, resultId: string }) => (
    <div className="relative">
      <Button
        className="absolute top-1 right-1 z-10 h-auto py-1 px-2.5 text-xs bg-neutral-600 hover:bg-neutral-700"
        onClick={(e) => copyJsonToClipboard(data, e.currentTarget)}
        aria-label="Copy JSON to clipboard"
      >
        Copy JSON
      </Button>
      <json-viewer data={JSON.stringify(data)}></json-viewer>
    </div>
  );

  return (
    <div className="flex w-full h-screen min-h-0 font-mono bg-neutral-100 fixed top-0 left-0 right-0 bottom-0">
      {/* Sidebar */}
      <div className="w-[450px] bg-neutral-200 overflow-y-auto border-r-2 border-neutral-300 p-5 box-border min-h-0">
        <h1 className="text-neutral-800 mt-0 mb-4">CUI Raw JSON Interface</h1>
        
        {/* System Status */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.status && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('status')}
            aria-label="Toggle System Status section"
          >
            GET /api/system/status
          </div>
          <div className={cn("overflow-hidden", collapsed.status && "hidden")}>
            <Button onClick={getSystemStatus} className="bg-neutral-800 hover:bg-neutral-700">Get Status</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.statusResult && <JsonViewer data={results.statusResult} resultId="statusResult" />}
            </div>
            {results.statusResult && !results.statusResult.error && (
              <div className="mt-2.5 text-xs text-neutral-600">
                <div><strong>Claude Version:</strong> {results.statusResult.claudeVersion}</div>
                <div><strong>Claude Path:</strong> {results.statusResult.claudePath}</div>
                <div><strong>Config Path:</strong> {results.statusResult.configPath}</div>
                <div><strong>Active Conversations:</strong> {results.statusResult.activeConversations}</div>
                <div><strong>Machine ID:</strong> {results.statusResult.machineId}</div>
              </div>
            )}
          </div>
        </div>

        {/* Config */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.config && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('config')}
            aria-label="Toggle Config section"
          >
            GET/PUT /api/config
          </div>
          <div className={cn("overflow-hidden", collapsed.config && "hidden")}>
            <Button onClick={getConfig} className="bg-neutral-800 hover:bg-neutral-700">Get Config</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.configGetResult && <JsonViewer data={results.configGetResult} resultId="configGetResult" />}
            </div>
            
            <div className="mt-4 border-t border-neutral-300 pt-4">
              <h4 className="m-0 mb-2.5 text-sm">Update Config</h4>
              
              <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
                <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="configUpdateBody">
                  Config JSON <span className="text-red-500">*</span>
                </Label>
                <Textarea 
                  id="configUpdateBody"
                  value={configUpdateBody} 
                  onChange={(e) => setConfigUpdateBody(e.target.value)} 
                  rows={15} 
                  placeholder={JSON.stringify({
                    interface: {
                      colorScheme: 'system',
                      language: 'en',
                      notifications: {
                        enabled: false,
                        ntfyUrl: 'https://ntfy.sh'
                      }
                    }
                  }, null, 2)}
                  className="font-mono text-xs"
                />
                <div className="text-xs text-neutral-600 mt-0.5">
                  Enter partial config to update only specific fields
                </div>
              </div>
              
              <Button onClick={updateConfig} className="bg-neutral-800 hover:bg-neutral-700">Update Config</Button>
              <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
                {results.configUpdateResult && <JsonViewer data={results.configUpdateResult} resultId="configUpdateResult" />}
              </div>
            </div>
          </div>
        </div>

        {/* Working Directories */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.workingDirs && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('workingDirs')}
            aria-label="Toggle Working Directories section"
          >
            GET /api/working-directories
          </div>
          <div className={cn("overflow-hidden", collapsed.workingDirs && "hidden")}>
            <Button onClick={getWorkingDirectories} className="bg-neutral-800 hover:bg-neutral-700">Get Working Directories</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.workingDirsResult && <JsonViewer data={results.workingDirsResult} resultId="workingDirsResult" />}
            </div>
            {workingDirectories.length > 0 && (
              <div className="mt-2.5">
                <h4 className="my-1">Quick Select:</h4>
                {workingDirectories.map((dir: any, index: number) => (
                  <div key={index} className="mb-1">
                    <Button 
                      className="text-xs py-0.5 px-1 mr-1 h-auto bg-neutral-800 hover:bg-neutral-700"
                      onClick={() => {
                        setWorkingDir(dir.path);
                        setListPath(dir.path);
                      }}
                      title={dir.path}
                    >
                      {dir.shortname}
                    </Button>
                    <span className="text-[11px] text-neutral-600">
                      ({dir.conversationCount} convs, {new Date(dir.lastDate).toLocaleDateString()})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Commands API */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.commands && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('commands')}
            aria-label="Toggle Commands API section"
          >
            GET /api/system/commands
          </div>
          <div className={cn("overflow-hidden", collapsed.commands && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="commandsWorkingDir">
                Working Directory <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Input id="commandsWorkingDir" type="text" value={commandsWorkingDirectory} onChange={(e) => setCommandsWorkingDirectory(e.target.value)} placeholder="/path/to/working/directory" className="font-mono" />
            </div>
            <Button onClick={getCommands} className="bg-neutral-800 hover:bg-neutral-700">Get Commands</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.commandsResult && <JsonViewer data={results.commandsResult} resultId="commandsResult" />}
            </div>
          </div>
        </div>
        
        {/* Start Conversation */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.start && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('start')}
            aria-label="Toggle Start Conversation section"
          >
            POST /api/conversations/start
          </div>
          <div className={cn("overflow-hidden", collapsed.start && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="workingDir">
                Working Directory <span className="text-red-500">*</span>
              </Label>
              <Input id="workingDir" type="text" value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} placeholder="/Users/..." className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="initialPrompt">
                Initial Prompt <span className="text-red-500">*</span>
              </Label>
              <Textarea id="initialPrompt" value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} rows={3} placeholder="Your prompt here..." className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="model">
                Model <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model" className="font-mono">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default-model">Default</SelectItem>
                  <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                  <SelectItem value="claude-3-sonnet-20240229">Claude 3 Sonnet</SelectItem>
                  <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                  <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="systemPrompt">
                System Prompt <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Textarea id="systemPrompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={2} placeholder="System prompt..." className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="claudeExecutablePath">
                Claude Executable Path <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Input id="claudeExecutablePath" type="text" value={claudeExecutablePath} onChange={(e) => setClaudeExecutablePath(e.target.value)} placeholder="/usr/local/bin/claude" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="permissionMode">
                Permission Mode <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Select value={permissionMode} onValueChange={setPermissionMode}>
                <SelectTrigger id="permissionMode" className="font-mono">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default-mode">Default</SelectItem>
                  <SelectItem value="default">default</SelectItem>
                  <SelectItem value="acceptEdits">acceptEdits</SelectItem>
                  <SelectItem value="bypassPermissions">bypassPermissions</SelectItem>
                  <SelectItem value="plan">plan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startConversation} className="bg-neutral-800 hover:bg-neutral-700">Start Conversation</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.startResult && <JsonViewer data={results.startResult} resultId="startResult" />}
            </div>
          </div>
        </div>
        
        {/* Stop Conversation */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.stop && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('stop')}
            aria-label="Toggle Stop Conversation section"
          >
            POST /api/conversations/:streamingId/stop
          </div>
          <div className={cn("overflow-hidden", collapsed.stop && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="stopStreamingId">
                Streaming ID <span className="text-red-500">*</span>
              </Label>
              <Input id="stopStreamingId" type="text" value={stopStreamingId} onChange={(e) => setStopStreamingId(e.target.value)} placeholder="streaming-id" className="font-mono" />
            </div>
            <Button onClick={stopConversation} className="bg-neutral-800 hover:bg-neutral-700">Stop Conversation</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.stopResult && <JsonViewer data={results.stopResult} resultId="stopResult" />}
            </div>
          </div>
        </div>
        
        {/* List Conversations */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.list && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('list')}
            aria-label="Toggle List Conversations section"
          >
            GET /api/conversations
          </div>
          <div className={cn("overflow-hidden", collapsed.list && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="conversationsLimit">
                    Limit <span className="text-neutral-400 text-[10px]">(optional)</span>
                  </Label>
                  <Input id="conversationsLimit" type="number" value={sidebarConversationsLimit} onChange={(e) => setSidebarConversationsLimit(e.target.value)} placeholder="20" className="font-mono" />
                </div>
                <div className="flex-1">
                  <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="conversationsOffset">
                    Offset <span className="text-neutral-400 text-[10px]">(optional)</span>
                  </Label>
                  <Input id="conversationsOffset" type="number" value={sidebarConversationsOffset} onChange={(e) => setSidebarConversationsOffset(e.target.value)} placeholder="0" className="font-mono" />
                </div>
                <div className="flex-1">
                  <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="conversationsProjectPath">
                    Project Path <span className="text-neutral-400 text-[10px]">(optional)</span>
                  </Label>
                  <Input id="conversationsProjectPath" type="text" value={sidebarConversationsProjectPath} onChange={(e) => setSidebarConversationsProjectPath(e.target.value)} placeholder="/path/to/project" className="font-mono" />
                </div>
              </div>
            </div>
            <Button onClick={listConversationsSidebar} className="bg-neutral-800 hover:bg-neutral-700">List Conversations</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.sidebarConversationsResult && <JsonViewer data={results.sidebarConversationsResult} resultId="sidebarConversationsResult" />}
            </div>
          </div>
        </div>
        
        {/* Update Session (includes rename) */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.rename && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('rename')}
            aria-label="Toggle Update Session section"
          >
            PUT /api/conversations/:sessionId/update
          </div>
          <div className={cn("overflow-hidden", collapsed.rename && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="renameSessionId">
                Session ID <span className="text-red-500">*</span>
              </Label>
              <select 
                value={renameSessionId} 
                onChange={(e) => setRenameSessionId(e.target.value)} 
                className="font-mono block my-1 p-2 w-full box-border border border-neutral-300 rounded bg-white"
              >
                <option value="">Select a session...</option>
                {availableSessions.map(session => {
                  const summary = session.summary || 'No summary';
                  const customName = session.sessionInfo?.custom_name || '';
                  const sessionFlags = [];
                  if (session.sessionInfo?.pinned) sessionFlags.push('📌');
                  if (session.sessionInfo?.archived) sessionFlags.push('📦');
                  if (session.sessionInfo?.continuation_session_id) sessionFlags.push('🔗');
                  if (session.sessionInfo?.initial_commit_head) sessionFlags.push('🔀');
                  if (session.sessionInfo?.permission_mode && session.sessionInfo.permission_mode !== 'default') sessionFlags.push(`🔒${session.sessionInfo.permission_mode}`);
                  const flagsStr = sessionFlags.length > 0 ? ` ${sessionFlags.join('')}` : '';
                  const displayName = customName ? `[${customName}] ${summary}` : summary;
                  const date = new Date(session.updatedAt).toLocaleString();
                  const metrics = session.toolMetrics;
                  const metricsStr = metrics ? ` [📝${metrics.editCount} ✏️${metrics.writeCount} +${metrics.linesAdded} -${metrics.linesRemoved}]` : '';
                  return (
                    <option key={session.sessionId} value={session.sessionId} title={`${session.sessionId}\n${summary}\nPath: ${session.projectPath}\nUpdated: ${date}\n\nSession Info:\n${JSON.stringify(session.sessionInfo, null, 2)}${metrics ? `\n\nTool Metrics:\nEdits: ${metrics.editCount}\nWrites: ${metrics.writeCount}\nLines Added: ${metrics.linesAdded}\nLines Removed: ${metrics.linesRemoved}` : ''}`}>
                      {session.sessionId.substring(0, 8)}... - {displayName.substring(0, 50)}...{flagsStr}{metricsStr} ({date})
                    </option>
                  );
                })}
              </select>
              <Input type="text" value={renameSessionId} onChange={(e) => setRenameSessionId(e.target.value)} placeholder="claude-session-id or select from dropdown" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="renameCustomName">
                Custom Name <span className="text-neutral-400 text-[10px]">(empty to clear)</span>
              </Label>
              <Input id="renameCustomName" type="text" value={renameCustomName} onChange={(e) => setRenameCustomName(e.target.value)} placeholder="My Project Discussion" maxLength={200} className="font-mono" />
              <div className="text-xs text-neutral-600 mt-0.5">
                {renameCustomName.length}/200 characters
              </div>
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="sessionPinned" checked={sessionPinned} onCheckedChange={(checked) => setSessionPinned(checked as boolean)} />
                  <Label htmlFor="sessionPinned" className="text-sm cursor-pointer">Pinned</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sessionArchived" checked={sessionArchived} onCheckedChange={(checked) => setSessionArchived(checked as boolean)} />
                  <Label htmlFor="sessionArchived" className="text-sm cursor-pointer">Archived</Label>
                </div>
              </div>
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="continuationSessionId">
                Continuation Session ID <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Input id="continuationSessionId" type="text" value={continuationSessionId} onChange={(e) => setContinuationSessionId(e.target.value)} placeholder="claude-session-id" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="initialCommitHead">
                Initial Commit HEAD <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Input id="initialCommitHead" type="text" value={initialCommitHead} onChange={(e) => setInitialCommitHead(e.target.value)} placeholder="git commit hash" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="sessionPermissionMode">
                Permission Mode <span className="text-neutral-400 text-[10px]">(optional)</span>
              </Label>
              <Select value={sessionPermissionMode} onValueChange={setSessionPermissionMode}>
                <SelectTrigger id="sessionPermissionMode" className="font-mono">
                  <SelectValue placeholder="Keep current" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep-current">Keep current</SelectItem>
                  <SelectItem value="default">default</SelectItem>
                  <SelectItem value="acceptEdits">acceptEdits</SelectItem>
                  <SelectItem value="bypassPermissions">bypassPermissions</SelectItem>
                  <SelectItem value="plan">plan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={renameSession} className="bg-neutral-800 hover:bg-neutral-700">Update Session</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.renameResult && <JsonViewer data={results.renameResult} resultId="renameResult" />}
            </div>
          </div>
        </div>
        
        {/* List Permissions */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.permissions && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('permissions')}
            aria-label="Toggle List Permissions section"
          >
            GET /api/permissions
          </div>
          <div className={cn("overflow-hidden", collapsed.permissions && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="permissionsStreamingId">
                    Streaming ID <span className="text-neutral-400 text-[10px]">(optional)</span>
                  </Label>
                  <Input id="permissionsStreamingId" type="text" value={permissionsStreamingId} onChange={(e) => setPermissionsStreamingId(e.target.value)} placeholder="streaming-id" className="font-mono" />
                </div>
                <div className="flex-1">
                  <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="permissionsStatus">
                    Status <span className="text-neutral-400 text-[10px]">(optional)</span>
                  </Label>
                  <Select value={permissionsStatus} onValueChange={setPermissionsStatus}>
                    <SelectTrigger id="permissionsStatus" className="font-mono">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="denied">Denied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button onClick={listPermissions} className="bg-neutral-800 hover:bg-neutral-700">List Permissions</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.permissionsResult && <JsonViewer data={results.permissionsResult} resultId="permissionsResult" />}
            </div>
          </div>
        </div>
        
        {/* Permission Decision */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.permissionDecision && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('permissionDecision')}
            aria-label="Toggle Permission Decision section"
          >
            POST /api/permissions/:requestId/decision
          </div>
          <div className={cn("overflow-hidden", collapsed.permissionDecision && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="permissionRequestId">
                Request ID <span className="text-red-500">*</span>
              </Label>
              <Input id="permissionRequestId" type="text" value={permissionRequestId} onChange={(e) => setPermissionRequestId(e.target.value)} placeholder="permission-request-id" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="permissionDecisionBody">
                Request Body <span className="text-red-500">*</span>
              </Label>
              <Textarea 
                id="permissionDecisionBody"
                value={permissionDecisionBody} 
                onChange={(e) => setPermissionDecisionBody(e.target.value)} 
                rows={10} 
                placeholder={JSON.stringify({
                  action: 'approve',
                  modifiedInput: {},
                  denyReason: ''
                }, null, 2)}
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={makePermissionDecision} className="bg-neutral-800 hover:bg-neutral-700">Make Decision</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.permissionDecisionResult && <JsonViewer data={results.permissionDecisionResult} resultId="permissionDecisionResult" />}
            </div>
          </div>
        </div>

        {/* List Directory */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.listDir && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('listDir')}
            aria-label="Toggle List Directory section"
          >
            GET /api/filesystem/list
          </div>
          <div className={cn("overflow-hidden", collapsed.listDir && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="listPath">
                Path <span className="text-red-500">*</span>
              </Label>
              <Input id="listPath" type="text" value={listPath} onChange={(e) => setListPath(e.target.value)} placeholder="/absolute/path/to/directory" className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="listRecursive" checked={listRecursive} onCheckedChange={(checked) => setListRecursive(checked as boolean)} />
                  <Label htmlFor="listRecursive" className="text-sm cursor-pointer">Recursive</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="listRespectGitignore" checked={listRespectGitignore} onCheckedChange={(checked) => setListRespectGitignore(checked as boolean)} />
                  <Label htmlFor="listRespectGitignore" className="text-sm cursor-pointer">Respect .gitignore</Label>
                </div>
              </div>
            </div>
            <Button onClick={listDirectory} className="bg-neutral-800 hover:bg-neutral-700">List Directory</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.listResult && <JsonViewer data={results.listResult} resultId="listResult" />}
            </div>
          </div>
        </div>

        {/* Read File */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.readFile && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('readFile')}
            aria-label="Toggle Read File section"
          >
            GET /api/filesystem/read
          </div>
          <div className={cn("overflow-hidden", collapsed.readFile && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="readPath">
                Path <span className="text-red-500">*</span>
              </Label>
              <Input id="readPath" type="text" value={readPath} onChange={(e) => setReadPath(e.target.value)} placeholder="/absolute/path/to/file.txt" className="font-mono" />
            </div>
            <Button onClick={readFile} className="bg-neutral-800 hover:bg-neutral-700">Read File</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.readResult && <JsonViewer data={results.readResult} resultId="readResult" />}
            </div>
          </div>
        </div>

        {/* Bulk Operations */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.bulkOperations && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('bulkOperations')}
            aria-label="Toggle Bulk Operations section"
          >
            Bulk Operations
          </div>
          <div className={cn("overflow-hidden", collapsed.bulkOperations && "hidden")}>
            <div className="mb-2.5">
              <h4 className="my-1">Archive All Sessions</h4>
              <p className="text-xs text-neutral-600 my-1">
                Archive all non-archived sessions at once. This action cannot be undone.
              </p>
              <Button onClick={archiveAllSessions} className="bg-red-600 hover:bg-red-700">Archive All Sessions</Button>
              <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
                {results.archiveAllResult && <JsonViewer data={results.archiveAllResult} resultId="archiveAllResult" />}
              </div>
            </div>
          </div>
        </div>

        {/* Gemini Health Check */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.geminiHealth && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('geminiHealth')}
            aria-label="Toggle Gemini Health Check section"
          >
            GET /api/gemini/health
          </div>
          <div className={cn("overflow-hidden", collapsed.geminiHealth && "hidden")}>
            <Button onClick={getGeminiHealth} className="bg-neutral-800 hover:bg-neutral-700">Check Gemini Health</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.geminiHealthResult && <JsonViewer data={results.geminiHealthResult} resultId="geminiHealthResult" />}
            </div>
          </div>
        </div>

        {/* Gemini Transcribe */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.geminiTranscribe && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('geminiTranscribe')}
            aria-label="Toggle Gemini Transcribe section"
          >
            POST /api/gemini/transcribe
          </div>
          <div className={cn("overflow-hidden", collapsed.geminiTranscribe && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="audioFile">Audio File Upload</Label>
              <Input id="audioFile" type="file" accept="audio/*" onChange={handleFileChange} className="font-mono" />
              {geminiAudioFile && <div className="text-xs text-neutral-600 mt-0.5">Selected: {geminiAudioFile.name}</div>}
            </div>
            <div className="my-2.5 text-center">
              <span className="text-neutral-600">— OR —</span>
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="audioBase64">Base64 Audio Data</Label>
              <Textarea 
                id="audioBase64"
                value={geminiAudioBase64} 
                onChange={(e) => {
                  setGeminiAudioBase64(e.target.value);
                  setGeminiAudioFile(null); // Clear file when base64 is entered
                }} 
                rows={4} 
                placeholder="Base64 encoded audio data..."
                className="font-mono text-xs"
              />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="mimeType">
                MIME Type <span className="text-neutral-400 text-[10px]">(for base64)</span>
              </Label>
              <Select value={geminiMimeType} onValueChange={setGeminiMimeType}>
                <SelectTrigger id="mimeType" className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio/wav">audio/wav</SelectItem>
                  <SelectItem value="audio/mp3">audio/mp3</SelectItem>
                  <SelectItem value="audio/mpeg">audio/mpeg</SelectItem>
                  <SelectItem value="audio/ogg">audio/ogg</SelectItem>
                  <SelectItem value="audio/webm">audio/webm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={transcribeAudio} className="bg-neutral-800 hover:bg-neutral-700">Transcribe Audio</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.geminiTranscribeResult && <JsonViewer data={results.geminiTranscribeResult} resultId="geminiTranscribeResult" />}
            </div>
          </div>
        </div>

        {/* Gemini Summarize */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.geminiSummarize && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('geminiSummarize')}
            aria-label="Toggle Gemini Summarize section"
          >
            POST /api/gemini/summarize
          </div>
          <div className={cn("overflow-hidden", collapsed.geminiSummarize && "hidden")}>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="textToSummarize">
                Text to Summarize <span className="text-red-500">*</span>
              </Label>
              <Textarea 
                id="textToSummarize"
                value={geminiTextToSummarize} 
                onChange={(e) => setGeminiTextToSummarize(e.target.value)} 
                rows={8} 
                placeholder="Enter text to summarize..."
                className="font-mono"
              />
              <div className="text-xs text-neutral-600 mt-0.5">
                {geminiTextToSummarize.length} characters
              </div>
            </div>
            <Button onClick={summarizeText} className="bg-neutral-800 hover:bg-neutral-700">Summarize Text</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.geminiSummarizeResult && <JsonViewer data={results.geminiSummarizeResult} resultId="geminiSummarizeResult" />}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div 
            className={cn(
              "font-bold text-blue-600 text-sm mb-4 cursor-pointer select-none",
              "before:content-['▼_'] before:inline-block before:transition-transform",
              collapsed.notifications && "before:-rotate-90"
            )}
            onClick={() => toggleCollapse('notifications')}
            aria-label="Toggle Notifications section"
          >
            /api/notifications (status/register/unregister/test)
          </div>
          <div className={cn("overflow-hidden", collapsed.notifications && "hidden")}>
            <div className="flex flex-col gap-2 mb-2">
              <Button onClick={getNotificationStatus} className="bg-neutral-800 hover:bg-neutral-700 w-full">Get Status</Button>
              <Button onClick={registerPush} className="bg-neutral-800 hover:bg-neutral-700 w-full">Register Push</Button>
              <Button onClick={unregisterPush} className="bg-neutral-800 hover:bg-neutral-700 w-full">Unregister Push</Button>
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="notifTitle">Test Title</Label>
              <Input id="notifTitle" type="text" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} className="font-mono" />
            </div>
            <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
              <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="notifMessage">Test Message</Label>
              <Input id="notifMessage" type="text" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} className="font-mono" />
            </div>
            <Button onClick={sendTestNotification} className="bg-neutral-800 hover:bg-neutral-700 w-full">Send Test Notification</Button>
            <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
              {results.notificationsStatus && <JsonViewer data={results.notificationsStatus} resultId="notificationsStatus" />}
              {results.notificationsRegister && <JsonViewer data={results.notificationsRegister} resultId="notificationsRegister" />}
              {results.notificationsUnregister && <JsonViewer data={results.notificationsUnregister} resultId="notificationsUnregister" />}
              {results.notificationsTest && <JsonViewer data={results.notificationsTest} resultId="notificationsTest" />}
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-0 box-border min-h-0">
          {/* Get Conversation Details */}
          <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div className="font-bold text-blue-600 text-sm mb-4">GET /api/conversations/:sessionId</div>
          <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
            <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="detailSessionId">
              Session ID <span className="text-red-500">*</span>
            </Label>
            <select 
              value={detailSessionId} 
              onChange={(e) => setDetailSessionId(e.target.value)} 
              className="font-mono block my-1 p-2 w-full box-border border border-neutral-300 rounded bg-white mb-1"
            >
              <option value="">Select a session...</option>
              {availableSessions.map(session => {
                const summary = session.summary || 'No summary';
                const customName = session.sessionInfo?.custom_name || '';
                const displayName = customName ? `[${customName}] ${summary}` : summary;
                const date = new Date(session.updatedAt).toLocaleString();
                const metrics = session.toolMetrics;
                const metricsStr = metrics ? ` [📝${metrics.editCount} ✏️${metrics.writeCount} +${metrics.linesAdded} -${metrics.linesRemoved}]` : '';
                return (
                  <option key={session.sessionId} value={session.sessionId} title={`${session.sessionId}\n${summary}\nPath: ${session.projectPath}\nUpdated: ${date}\n\nSession Info:\n${JSON.stringify(session.sessionInfo, null, 2)}${metrics ? `\n\nTool Metrics:\nEdits: ${metrics.editCount}\nWrites: ${metrics.writeCount}\nLines Added: ${metrics.linesAdded}\nLines Removed: ${metrics.linesRemoved}` : ''}`}>
                    {session.sessionId.substring(0, 8)}... - {displayName.substring(0, 50)}...{metricsStr} ({date})
                  </option>
                );
              })}
            </select>
            <Input type="text" value={detailSessionId} onChange={(e) => setDetailSessionId(e.target.value)} placeholder="claude-session-id or select from dropdown" className="font-mono" />
          </div>
          <Button onClick={getConversationDetails} className="bg-neutral-800 hover:bg-neutral-700">Get Details</Button>
          <div className="max-h-96 overflow-auto border border-neutral-300 rounded bg-neutral-50 p-2.5 mt-2.5">
            {results.detailsResult && <JsonViewer data={results.detailsResult} resultId="detailsResult" />}
          </div>
        </div>
        
        {/* Stream */}
        <div className="bg-white border-t border-b border-neutral-300 p-4 mb-0">
          <div className="font-bold text-blue-600 text-sm mb-4">GET /api/stream/:streamingId</div>
          <div className="my-2.5 p-2.5 bg-neutral-50 rounded">
            <Label className="font-bold text-neutral-600 text-xs uppercase mb-1" htmlFor="streamingId">
              Streaming ID <span className="text-red-500">*</span>
            </Label>
            <Input id="streamingId" type="text" value={streamingId} onChange={(e) => setStreamingId(e.target.value)} placeholder="streaming-id" className="font-mono" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => startStream()} className="bg-neutral-800 hover:bg-neutral-700">Start Stream</Button>
            <Button onClick={stopStream} className="bg-neutral-800 hover:bg-neutral-700">Stop Stream</Button>
            <Button onClick={clearStream} className="bg-neutral-800 hover:bg-neutral-700">Clear</Button>
            <Button onClick={(e) => copyStreamToClipboard(e.currentTarget)} className="bg-neutral-800 hover:bg-neutral-700">Copy Stream</Button>
          </div>
          <div className="bg-neutral-900 text-neutral-300 p-2.5 rounded mt-2.5 max-h-96 overflow-auto text-xs leading-relaxed" ref={streamResultRef}>
            {streamResult}
          </div>
        </div>
        </div>
        <LogMonitor 
          isVisible={logMonitorVisible}
          onToggle={() => setLogMonitorVisible(!logMonitorVisible)}
        />
      </div>
    </div>
  );
}

export default InspectorApp;