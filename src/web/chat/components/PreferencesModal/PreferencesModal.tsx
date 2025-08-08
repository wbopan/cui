import React, { useEffect, useState } from 'react';
import { Settings, Bell, Shield, Mic, X, Cpu } from 'lucide-react';
import { api } from '../../services/api';
import type { Preferences, GeminiHealthResponse } from '../../types';
import type { CUIConfig } from '../../../../types/config';
import { ModelProviderTab } from './ModelProviderTab';
import { Dialog } from '../Dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface Props {
  onClose: () => void;
}

export function PreferencesModal({ onClose }: Props) {
  const [prefs, setPrefs] = useState<Preferences>({
    colorScheme: 'system',
    language: 'auto-detect'
  });
  const [archiveStatus, setArchiveStatus] = useState<string>('');
  const [machineId, setMachineId] = useState<string>('');
  const [geminiHealth, setGeminiHealth] = useState<GeminiHealthResponse | null>(null);
  const [geminiHealthLoading, setGeminiHealthLoading] = useState(false);
  const [fullConfig, setFullConfig] = useState<CUIConfig | null>(null);

  useEffect(() => {
    api.getConfig().then(cfg => setPrefs(cfg.interface)).catch(() => { });
    api.getSystemStatus().then(status => setMachineId(status.machineId)).catch(() => { });
    api.getConfig().then(setFullConfig).catch(() => { });
  }, []);

  const update = async (updates: Partial<Preferences>) => {
    const updatedConfig = await api.updateConfig({ interface: updates });
    setPrefs(updatedConfig.interface);
    if (updates.colorScheme) {
      // For system theme, we need to determine the actual theme
      if (updates.colorScheme === 'system') {
        const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', systemTheme);
      } else {
        document.documentElement.setAttribute('data-theme', updates.colorScheme);
      }
    }
  };

  const handleCheckGeminiHealth = async () => {
    setGeminiHealthLoading(true);
    try {
      const health = await api.getGeminiHealth();
      setGeminiHealth(health);
    } catch (error) {
      setGeminiHealth({ status: 'unhealthy', message: 'Failed to fetch status', apiKeyValid: false });
    } finally {
      setGeminiHealthLoading(false);
    }
  };

  const handleConfigUpdate = async (updates: Partial<CUIConfig>) => {
    try {
      const updatedConfig = await api.updateConfig(updates);
      setFullConfig(updatedConfig);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleArchiveAll = async () => {
    if (!confirm('Are you sure you want to archive all sessions? This action cannot be undone.')) {
      return;
    }

    try {
      setArchiveStatus('Archiving...');
      const data = await api.archiveAllSessions();

      if (data.success) {
        setArchiveStatus(data.message || 'Successfully archived sessions');
        setTimeout(() => setArchiveStatus(''), 3000);
      } else {
        setArchiveStatus(`Error: ${data.error || 'Failed to archive sessions'}`);
      }
    } catch (error) {
      setArchiveStatus(`Error: ${error instanceof Error ? error.message : 'Failed to archive sessions'}`);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} title="">
      <div className="flex flex-col h-[600px] -m-6 w-[calc(100%+48px)]">
        <header className="flex justify-between items-center px-5 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
          <h2 className="text-lg font-normal m-0 text-neutral-900 dark:text-neutral-100">Settings</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <Tabs defaultValue="general" className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="bg-neutral-50 dark:bg-neutral-900/50 border-r border-neutral-200 dark:border-neutral-800 min-w-[180px] max-w-[210px] flex flex-col h-full">
              <TabsList className="flex flex-col h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="general"
                  className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-none bg-transparent text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:font-medium relative data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-0 data-[state=active]:before:bottom-0 data-[state=active]:before:w-[3px] data-[state=active]:before:bg-blue-500"
                  aria-label="General settings"
                >
                  <Settings className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">General</span>
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-none bg-transparent text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:font-medium relative data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-0 data-[state=active]:before:bottom-0 data-[state=active]:before:w-[3px] data-[state=active]:before:bg-blue-500"
                  aria-label="Notification settings"
                >
                  <Bell className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Notifications</span>
                </TabsTrigger>
                <TabsTrigger
                  value="dataControls"
                  className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-none bg-transparent text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:font-medium relative data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-0 data-[state=active]:before:bottom-0 data-[state=active]:before:w-[3px] data-[state=active]:before:bg-blue-500"
                  aria-label="Data control settings"
                >
                  <Shield className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Data controls</span>
                </TabsTrigger>
                <TabsTrigger
                  value="voiceInput"
                  className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-none bg-transparent text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:font-medium relative data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-0 data-[state=active]:before:bottom-0 data-[state=active]:before:w-[3px] data-[state=active]:before:bg-blue-500"
                  aria-label="Voice input settings"
                >
                  <Mic className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Voice Input</span>
                </TabsTrigger>
                <TabsTrigger
                  value="modelProvider"
                  className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-none bg-transparent text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:font-medium relative data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-0 data-[state=active]:before:bottom-0 data-[state=active]:before:w-[3px] data-[state=active]:before:bg-blue-500"
                  aria-label="Model provider settings"
                >
                  <Cpu className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Model Provider</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-900">
              <TabsContent value="general" className="px-6 pb-6 overflow-y-auto flex-1 mt-0">
                <div className="flex items-center justify-between min-h-[60px] py-2">
                  <Label htmlFor="theme-select" className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">
                    Theme
                  </Label>
                  <Select
                    value={prefs.colorScheme}
                    onValueChange={(value) => update({ colorScheme: value as 'light' | 'dark' | 'system' })}
                  >
                    <SelectTrigger
                      id="theme-select"
                      className="w-[120px] h-9 bg-white dark:bg-neutral-900 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:bg-neutral-100 dark:focus:bg-neutral-800"
                      aria-label="Select theme"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="px-6 pb-6 overflow-y-auto flex-1 mt-0">
                <div className="py-4 border-b border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between min-h-[60px] py-2">
                    <div className="flex-1 flex flex-col gap-1 mr-4">
                      <Label htmlFor="notifications-switch" className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">
                        Enable Push Notifications
                      </Label>
                    </div>
                    <Switch
                      id="notifications-switch"
                      checked={prefs.notifications?.enabled || false}
                      onCheckedChange={(checked) => update({
                        notifications: {
                          ...prefs.notifications,
                          enabled: checked
                        }
                      })}
                      aria-label="Toggle push notifications"
                    />
                  </div>
                </div>

                <div className="py-4 border-b border-neutral-200 dark:border-neutral-800">
                  <p className="text-sm my-3">
                    To receive push notifications, subscribe to the following <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" className="font-semibold">ntfy</a> topic:
                  </p>
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md font-mono text-sm border border-neutral-200 dark:border-neutral-700">
                    {machineId ? `cui-${machineId}` : 'Loading...'}
                  </div>
                </div>

                <div className="py-4">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Advanced</h3>
                  <div className="flex items-center justify-between min-h-[60px] py-2">
                    <Label htmlFor="ntfy-url" className="flex-1 flex flex-col gap-1 mr-4 text-sm text-neutral-900 dark:text-neutral-100 font-normal">
                      Ntfy Server URL
                    </Label>
                    <Input
                      id="ntfy-url"
                      type="url"
                      className="min-w-[200px] bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400"
                      value={prefs.notifications?.ntfyUrl || ''}
                      placeholder="https://ntfy.sh"
                      onChange={(e) => update({
                        notifications: {
                          ...prefs.notifications,
                          enabled: prefs.notifications?.enabled || false,
                          ntfyUrl: e.target.value || undefined
                        }
                      })}
                      aria-label="Ntfy server URL"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dataControls" className="px-6 pb-6 overflow-y-auto flex-1 mt-0">
                <div className="py-4">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Session Management</h3>
                  <Button
                    onClick={handleArchiveAll}
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    aria-label="Archive all sessions"
                  >
                    Archive All Sessions
                  </Button>
                  {archiveStatus && (
                    <div className={`mt-4 p-3 rounded-md text-sm font-medium ${archiveStatus.startsWith('Error')
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                      }`}>
                      {archiveStatus}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="voiceInput" className="px-6 pb-6 overflow-y-auto flex-1 mt-0">
                <div className="py-4">
                  <div className="flex items-center justify-between min-h-[60px] py-2">
                    <Label className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">
                      Gemini API Status
                    </Label>
                    <div className="text-sm">
                      {geminiHealthLoading ? (
                        'Loading...'
                      ) : geminiHealth ? (
                        geminiHealth.status === 'healthy' ? (
                          <span className="text-green-600 dark:text-green-400">Success</span>
                        ) : (
                          <span className="text-neutral-500 dark:text-neutral-400">Error</span>
                        )
                      ) : (
                        <Button
                          onClick={handleCheckGeminiHealth}
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 font-normal hover:underline"
                          aria-label="Check Gemini API status"
                        >
                          Check Status
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {geminiHealth?.status === 'unhealthy' && (
                  <div className="py-4">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Enable Voice Input</h3>

                    <p className="text-sm my-3">
                      To enable Gemini-powered voice input, you need to configure a Google API key:
                    </p>

                    <div className="flex items-center justify-between min-h-[60px] py-2">
                      <Label className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">1. Get a API key</Label>
                      <p className="text-sm">
                        Visit <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          https://aistudio.google.com/apikey
                        </a> to generate your free API key.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 py-2">
                      <Label className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">2. Configure API Environment Variable</Label>

                      <div className="mt-3">
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md font-mono text-sm border border-neutral-200 dark:border-neutral-700">
                          export GOOGLE_API_KEY="your-api-key"
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 py-2">
                      <Label className="text-sm text-neutral-900 dark:text-neutral-100 font-normal">Or Edit ~/.cui/config.json</Label>

                      <div className="mt-3">
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md font-mono text-sm border border-neutral-200 dark:border-neutral-700">
                          {`{ "gemini": { "apiKey": "your-api-key" } }`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="italic mt-3 text-sm text-neutral-500 dark:text-neutral-400">
                  i. When using Gemini voice input, your audio data will be sent to Google for processing. Free Tier API Key allows Google to train on your data. <br />
                  ii. On iOS Safari, you need HTTPS to use voice input.
                </div>
              </TabsContent>

              <TabsContent value="modelProvider" className="flex-1 overflow-hidden mt-0">
                <ModelProviderTab config={fullConfig} onUpdate={handleConfigUpdate} />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </Dialog>
  );
}