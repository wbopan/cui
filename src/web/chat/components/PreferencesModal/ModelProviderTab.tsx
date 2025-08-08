import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Code, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/web/chat/components/ui/select';
import { Switch } from '@/web/chat/components/ui/switch';
import { Input } from '@/web/chat/components/ui/input';
import { Label } from '@/web/chat/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { Textarea } from '@/web/chat/components/ui/textarea';
import type { CUIConfig } from '@/types/config';
import type { RouterProvider, RouterConfiguration } from '@/types/router-config';

interface ModelProviderTabProps {
  config: CUIConfig | null;
  onUpdate: (updates: Partial<CUIConfig>) => Promise<void>;
  isActive?: boolean;
}

export function ModelProviderTab({ config, onUpdate, isActive }: ModelProviderTabProps) {
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [localProviders, setLocalProviders] = useState<RouterProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('claude-pro');
  const [activeModel, setActiveModel] = useState<string>('');
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  useEffect(() => {
    if (config?.router?.providers) {
      setLocalProviders(config.router.providers);
      setJsonText(JSON.stringify(config.router.providers, null, 2));
    }

    if (config?.router?.enabled && config?.router?.rules?.default) {
      const [provider, model] = config.router.rules.default.split(',');
      setActiveProvider(provider || 'claude-pro');
      setActiveModel(model || '');
    } else {
      setActiveProvider('claude-pro');
      setActiveModel('');
    }
  }, [config]);

  // Auto-save when tab becomes inactive
  useEffect(() => {
    const save = async () => {
      if (isActive === false && localProviders.length > 0) {
        try {
          await onUpdate({
            router: {
              ...config?.router,
              providers: localProviders,
              enabled: config?.router?.enabled || false,
              rules: config?.router?.rules || {}
            } as RouterConfiguration
          });
        } catch (error) {
          console.error('Failed to auto-save providers:', error);
        }
      }
    };
    save();
  }, [isActive, localProviders, config, onUpdate]);

  const handleActiveProviderChange = async (provider: string) => {
    setActiveProvider(provider);
    
    if (provider === 'claude-pro') {
      setActiveModel('');
      await onUpdate({
        router: {
          ...config?.router,
          enabled: false,
          providers: localProviders,
          rules: config?.router?.rules || {}
        } as RouterConfiguration
      });
    } else {
      const selectedProvider = localProviders.find(p => p.name === provider);
      if (selectedProvider && selectedProvider.models.length > 0) {
        const firstModel = selectedProvider.models[0];
        setActiveModel(firstModel);
        await onUpdate({
          router: {
            enabled: true,
            providers: localProviders,
            rules: {
              default: `${provider},${firstModel}`
            }
          } as RouterConfiguration
        });
      }
    }
  };

  const handleActiveModelChange = async (model: string) => {
    setActiveModel(model);
    if (activeProvider !== 'claude-pro') {
      await onUpdate({
        router: {
          enabled: true,
          providers: localProviders,
          rules: {
            default: `${activeProvider},${model}`
          }
        } as RouterConfiguration
      });
    }
  };

  const addProvider = () => {
    const newProvider: RouterProvider = {
      name: `provider-${localProviders.length + 1}`,
      api_base_url: '',
      api_key: '',
      models: [],
      transformer: { use: ['openrouter'] }
    };
    setLocalProviders([...localProviders, newProvider]);
    setEditingProvider(newProvider.name);
  };

  const updateProvider = (index: number, updates: Partial<RouterProvider>) => {
    const updated = [...localProviders];
    updated[index] = { ...updated[index], ...updates };
    setLocalProviders(updated);
  };

  const deleteProvider = (index: number) => {
    const updated = localProviders.filter((_, i) => i !== index);
    setLocalProviders(updated);
  };

  const addModel = (providerIndex: number) => {
    const updated = [...localProviders];
    updated[providerIndex].models.push('new-model');
    setLocalProviders(updated);
  };

  const updateModel = (providerIndex: number, modelIndex: number, value: string) => {
    const updated = [...localProviders];
    updated[providerIndex].models[modelIndex] = value;
    setLocalProviders(updated);
  };

  const deleteModel = (providerIndex: number, modelIndex: number) => {
    const updated = [...localProviders];
    updated[providerIndex].models = updated[providerIndex].models.filter((_, i) => i !== modelIndex);
    setLocalProviders(updated);
  };

  const saveProviders = async () => {
    try {
      if (isJsonMode) {
        const parsed = JSON.parse(jsonText);
        setLocalProviders(parsed);
        await onUpdate({
          router: {
            ...config?.router,
            providers: parsed,
            enabled: config?.router?.enabled || false,
            rules: config?.router?.rules || {}
          } as RouterConfiguration
        });
      } else {
        await onUpdate({
          router: {
            ...config?.router,
            providers: localProviders,
            enabled: config?.router?.enabled || false,
            rules: config?.router?.rules || {}
          } as RouterConfiguration
        });
      }
    } catch (error) {
      console.error('Failed to save providers:', error);
    }
  };

  const toggleJsonMode = () => {
    if (!isJsonMode) {
      setJsonText(JSON.stringify(localProviders, null, 2));
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        setLocalProviders(parsed);
      } catch (error) {
        console.error('Invalid JSON:', error);
        return;
      }
    }
    setIsJsonMode(!isJsonMode);
  };

  return (
    <TooltipProvider>
      <div className="px-6 pb-6 overflow-y-auto h-full">
        <div className="py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Active Provider</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-neutral-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Select which model provider to use for conversations</p>
              </TooltipContent>
            </Tooltip>
          </div>
          
          <div className="flex gap-3">
            <Select value={activeProvider} onValueChange={handleActiveProviderChange}>
              <SelectTrigger className="flex-1 bg-white dark:bg-neutral-900 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-pro">Claude Pro/Max</SelectItem>
                {localProviders
                  .filter(provider => provider.name && provider.name.trim() !== '')
                  .map(provider => (
                    <SelectItem key={provider.name} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {activeProvider !== 'claude-pro' && (
              <Select value={activeModel} onValueChange={handleActiveModelChange}>
                <SelectTrigger className="flex-1 bg-white dark:bg-neutral-900 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {localProviders
                    .find(p => p.name === activeProvider)
                    ?.models.map(model => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Providers</h3>
            <div className="flex gap-2">
              <Button
                onClick={toggleJsonMode}
                variant="ghost"
                size="sm"
                className="h-8 px-3"
              >
                <Code className="h-4 w-4 mr-1" />
                {isJsonMode ? 'UI Mode' : 'JSON Mode'}
              </Button>
              {!isJsonMode && (
                <Button
                  onClick={addProvider}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Provider
                </Button>
              )}
            </div>
          </div>

          {isJsonMode ? (
            <div className="space-y-3">
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="min-h-[300px] font-mono text-sm bg-neutral-100 dark:bg-neutral-800"
                placeholder="Enter provider configuration as JSON array"
              />
              <Button onClick={saveProviders} variant="default" size="sm">
                Save Configuration
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {localProviders.map((provider, providerIndex) => (
                <div
                  key={providerIndex}
                  className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Provider {providerIndex + 1}</Label>
                    <Button
                      onClick={() => deleteProvider(providerIndex)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor={`name-${providerIndex}`} className="text-xs text-neutral-600 dark:text-neutral-400">
                        Name
                      </Label>
                      <Input
                        id={`name-${providerIndex}`}
                        value={provider.name}
                        onChange={(e) => updateProvider(providerIndex, { name: e.target.value })}
                        className="mt-1 bg-white dark:bg-neutral-900"
                        placeholder="e.g., OpenRouter"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`transformer-${providerIndex}`} className="text-xs text-neutral-600 dark:text-neutral-400">
                        Transformer
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="inline h-3 w-3 ml-1" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">JSON array format, e.g., ["openrouter"]</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        id={`transformer-${providerIndex}`}
                        value={JSON.stringify(provider.transformer?.use || [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateProvider(providerIndex, { transformer: { use: parsed } });
                          } catch {}
                        }}
                        className="mt-1 bg-white dark:bg-neutral-900 font-mono text-sm"
                        placeholder='["openrouter"]'
                      />
                    </div>

                    <div>
                      <Label htmlFor={`base-url-${providerIndex}`} className="text-xs text-neutral-600 dark:text-neutral-400">
                        Base URL
                      </Label>
                      <Input
                        id={`base-url-${providerIndex}`}
                        value={provider.api_base_url}
                        onChange={(e) => updateProvider(providerIndex, { api_base_url: e.target.value })}
                        className="mt-1 bg-white dark:bg-neutral-900"
                        placeholder="https://openai-compatible/api/v1/chat/completions"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`api-key-${providerIndex}`} className="text-xs text-neutral-600 dark:text-neutral-400">
                        API Key
                      </Label>
                      <Input
                        id={`api-key-${providerIndex}`}
                        type="password"
                        value={provider.api_key}
                        onChange={(e) => updateProvider(providerIndex, { api_key: e.target.value })}
                        className="mt-1 bg-white dark:bg-neutral-900"
                        placeholder="Enter API key"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-neutral-600 dark:text-neutral-400">Models</Label>
                        <Button
                          onClick={() => addModel(providerIndex)}
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Model
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {provider.models.map((model, modelIndex) => (
                          <div key={modelIndex} className="flex gap-2">
                            <Input
                              value={model}
                              onChange={(e) => updateModel(providerIndex, modelIndex, e.target.value)}
                              className="flex-1 bg-white dark:bg-neutral-900"
                              placeholder="Model name"
                            />
                            <Button
                              onClick={() => deleteModel(providerIndex, modelIndex)}
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {localProviders.length > 0 && (
                <Button onClick={saveProviders} variant="default" size="sm">
                  Save Providers
                </Button>
              )}
            </div>
          )}
          
          <div className="mt-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              For more information about provider configuration, see{' '}
              <a
                href="https://github.com/musistudio/claude-code-router"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                claude-code-router documentation
              </a>
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}