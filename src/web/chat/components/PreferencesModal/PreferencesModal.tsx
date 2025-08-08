import React, { useEffect, useState } from 'react';
import { Settings, Bell, Shield, Mic, X, Cpu } from 'lucide-react';
import { api } from '../../services/api';
import type { Preferences, GeminiHealthResponse } from '../../types';
import type { CUIConfig } from '../../../../types/config';
import { ModelProviderTab } from './ModelProviderTab';
import { NotificationTab } from './NotificationTab';
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
  const [activeTab, setActiveTab] = useState<string>('general');

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
        if (systemTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        document.documentElement.setAttribute('data-theme', updates.colorScheme);
        if (updates.colorScheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
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

  const handleClose = () => {
    // Save provider config if we're on that tab
    if (activeTab === 'modelProvider') {
      // The ModelProviderTab will auto-save when it becomes inactive
    }
    onClose();
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
    <Dialog open={true} onClose={handleClose} title="">
      <div className="flex flex-col h-[calc(100vh-64px)] w-[calc(100vw-64px)] -m-6">
        <header className="flex justify-between items-center px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
          <h2 className="text-lg font-normal m-0 text-neutral-900 dark:text-neutral-100">Settings</h2>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <Tabs 
          defaultValue="general" 
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* Minimal sidebar: remove bg/shadow/highlight bar, use subtle text and outline cues */}
            <div className="border-r border-neutral-200 dark:border-neutral-800 min-w-[200px] max-w-[240px] flex flex-col h-full">
              <TabsList className="flex flex-col h-auto p-2 pl-6 gap-1 bg-transparent">
                <TabsTrigger
                  value="general"
                  className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-transparent text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 data-[state=active]:bg-neutral-100 dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-100 data-[state=active]:font-medium"
                  aria-label="General settings"
                >
                  <Settings className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">General</span>
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-transparent text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 data-[state=active]:bg-neutral-100 dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-100 data-[state=active]:font-medium"
                  aria-label="Notification settings"
                >
                  <Bell className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Notifications</span>
                </TabsTrigger>
                <TabsTrigger
                  value="dataControls"
                  className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-transparent text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 data-[state=active]:bg-neutral-100 dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-100 data-[state=active]:font-medium"
                  aria-label="Data control settings"
                >
                  <Shield className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Data controls</span>
                </TabsTrigger>
                <TabsTrigger
                  value="voiceInput"
                  className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-transparent text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 data-[state=active]:bg-neutral-100 dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-100 data-[state=active]:font-medium"
                  aria-label="Voice input settings"
                >
                  <Mic className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Voice Input</span>
                </TabsTrigger>
                <TabsTrigger
                  value="modelProvider"
                  className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md bg-transparent text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60 data-[state=active]:bg-neutral-100 dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-100 data-[state=active]:font-medium"
                  aria-label="Model provider settings"
                >
                  <Cpu className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-left">Model Provider</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-900">
              <TabsContent value="general" className="flex-1 overflow-hidden mt-0">
                <div className="px-6 pb-6 overflow-y-auto h-full">
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
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="flex-1 overflow-hidden mt-0">
                <NotificationTab 
                  prefs={prefs}
                  machineId={machineId}
                  onUpdate={update}
                />
              </TabsContent>

              <TabsContent value="dataControls" className="flex-1 overflow-hidden mt-0">
                <div className="px-6 pb-6 overflow-y-auto h-full">
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
                </div>
              </TabsContent>

              <TabsContent value="voiceInput" className="flex-1 overflow-hidden mt-0">
                <div className="px-6 pb-6 overflow-y-auto h-full">
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
                </div>
              </TabsContent>

              <TabsContent value="modelProvider" className="flex-1 overflow-hidden mt-0">
                <ModelProviderTab 
                  config={fullConfig} 
                  onUpdate={handleConfigUpdate}
                  isActive={activeTab === 'modelProvider'}
                />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </Dialog>
  );
}