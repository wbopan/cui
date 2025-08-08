import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Code, Info, AlertCircle, Edit, LayoutGrid } from 'lucide-react';
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
  const [editingProviderIndex, setEditingProviderIndex] = useState<number | null>(null);
  const [initialProviderState, setInitialProviderState] = useState<RouterProvider | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

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
    const newProviders = [...localProviders, newProvider];
    setLocalProviders(newProviders);
    setEditingProviderIndex(newProviders.length - 1);
    setInitialProviderState(JSON.parse(JSON.stringify(newProvider)));
    setHasChanges(false);
  };

  const updateProvider = (index: number, updates: Partial<RouterProvider>) => {
    const updated = [...localProviders];
    updated[index] = { ...updated[index], ...updates };
    setLocalProviders(updated);
    
    // Check if this is the editing provider and track changes
    if (index === editingProviderIndex && initialProviderState) {
      const currentProvider = updated[index];
      const hasChanged = JSON.stringify(currentProvider) !== JSON.stringify(initialProviderState);
      setHasChanges(hasChanged);
    }
  };

  const deleteProvider = (index: number) => {
    const updated = localProviders.filter((_, i) => i !== index);
    setLocalProviders(updated);
    
    // Reset editing state if we're deleting the editing provider
    if (index === editingProviderIndex) {
      setEditingProviderIndex(null);
      setInitialProviderState(null);
      setHasChanges(false);
    } else if (editingProviderIndex !== null && index < editingProviderIndex) {
      // Adjust editing index if we deleted a provider before the editing one
      setEditingProviderIndex(editingProviderIndex - 1);
    }
  };

  const addModel = (providerIndex: number) => {
    const updated = [...localProviders];
    updated[providerIndex].models.push('new-model');
    setLocalProviders(updated);
    
    // Track changes if this is the editing provider
    if (providerIndex === editingProviderIndex && initialProviderState) {
      setHasChanges(true);
    }
  };

  const updateModel = (providerIndex: number, modelIndex: number, value: string) => {
    const updated = [...localProviders];
    updated[providerIndex].models[modelIndex] = value;
    setLocalProviders(updated);
    
    // Track changes if this is the editing provider
    if (providerIndex === editingProviderIndex && initialProviderState) {
      const currentProvider = updated[providerIndex];
      const hasChanged = JSON.stringify(currentProvider) !== JSON.stringify(initialProviderState);
      setHasChanges(hasChanged);
    }
  };

  const deleteModel = (providerIndex: number, modelIndex: number) => {
    const updated = [...localProviders];
    updated[providerIndex].models = updated[providerIndex].models.filter((_: any, i: number) => i !== modelIndex);
    setLocalProviders(updated);
    
    // Track changes if this is the editing provider
    if (providerIndex === editingProviderIndex && initialProviderState) {
      const currentProvider = updated[providerIndex];
      const hasChanged = JSON.stringify(currentProvider) !== JSON.stringify(initialProviderState);
      setHasChanges(hasChanged);
    }
  };

  const saveEditingProvider = async () => {
    try {
      // Trim and clean provider data before saving
      const cleanedProviders = localProviders.map(provider => ({
        ...provider,
        name: provider.name?.trim() || '',
        api_base_url: provider.api_base_url?.trim() || '',
        api_key: provider.api_key?.trim() || '',
        models: provider.models.map((model: string) => model?.trim() || '').filter((model: string) => model !== ''),
        transformer: provider.transformer
      }));
      
      await onUpdate({
        router: {
          ...config?.router,
          providers: cleanedProviders,
          enabled: config?.router?.enabled || false,
          rules: config?.router?.rules || {}
        } as RouterConfiguration
      });
      
      // Update local state with cleaned data
      setLocalProviders(cleanedProviders);
      setEditingProviderIndex(null);
      setInitialProviderState(null);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save provider:', error);
    }
  };

  const startEditingProvider = (index: number) => {
    setEditingProviderIndex(index);
    setInitialProviderState(JSON.parse(JSON.stringify(localProviders[index])));
    setHasChanges(false);
  };

  const saveProviders = async () => {
    try {
      if (isJsonMode) {
        const parsed = JSON.parse(jsonText);
        // Clean parsed JSON data
        const cleanedParsed = parsed.map((provider: RouterProvider) => ({
          ...provider,
          name: provider.name?.trim() || '',
          api_base_url: provider.api_base_url?.trim() || '',
          api_key: provider.api_key?.trim() || '',
          models: provider.models.map((model: string) => model?.trim() || '').filter((model: string) => model !== ''),
          transformer: provider.transformer
        }));
        
        setLocalProviders(cleanedParsed);
        await onUpdate({
          router: {
            ...config?.router,
            providers: cleanedParsed,
            enabled: config?.router?.enabled || false,
            rules: config?.router?.rules || {}
          } as RouterConfiguration
        });
      } else {
        await saveEditingProvider();
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
                    ?.models.map((model: string) => (
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
            <Button
              onClick={toggleJsonMode}
              variant="ghost"
              size="sm"
              className="h-8 px-3"
            >
              {isJsonMode ? (
                <LayoutGrid className="h-4 w-4 mr-1" />
              ) : (
                <Code className="h-4 w-4 mr-1" />
              )}
              {isJsonMode ? 'UI' : 'JSON'}
            </Button>
          </div>

          {isJsonMode ? (
            <div className="space-y-3">
              <Textarea
                value={jsonText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJsonText(e.target.value)}
                className="min-h-[300px] font-mono text-sm bg-neutral-100 dark:bg-neutral-800"
                placeholder="Enter provider configuration as JSON array"
              />
              <Button onClick={saveProviders} variant="default" size="sm">
                Save Configuration
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {localProviders.map((provider, providerIndex) => {
                const isEditing = providerIndex === editingProviderIndex;
                
                if (!isEditing) {
                  // Compact, non-editable view
                  return (
                    <div
                      key={providerIndex}
                      className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {provider.name || `Provider ${providerIndex + 1}`}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {provider.api_base_url ? (
                              <span className="truncate block max-w-md">{provider.api_base_url}</span>
                            ) : (
                              <span>No endpoint configured</span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-400 dark:text-neutral-500">
                            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => startEditingProvider(providerIndex)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={editingProviderIndex !== null}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => deleteProvider(providerIndex)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={editingProviderIndex !== null}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }
                
                // Editable view
                return (
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateProvider(providerIndex, { name: e.target.value })}
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateProvider(providerIndex, { api_base_url: e.target.value })}
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateProvider(providerIndex, { api_key: e.target.value })}
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
                          {provider.models.map((model: string, modelIndex: number) => (
                            <div key={modelIndex} className="flex gap-2">
                              <Input
                                value={model}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateModel(providerIndex, modelIndex, e.target.value)}
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
                );
              })}

              {/* Button row at the bottom */}
              {!isJsonMode && (
                <div className="flex gap-2 justify-end">
                  {editingProviderIndex !== null && (
                    <Button 
                      onClick={saveProviders} 
                      variant="default"
                      size="sm"
                      className="rounded-full"
                    >
                      Save Provider
                    </Button>
                  )}
                  <Button 
                    onClick={addProvider} 
                    variant={editingProviderIndex !== null ? "outline" : "default"}
                    size="sm"
                    className="rounded-full"
                    disabled={editingProviderIndex !== null}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Provider
                  </Button>
                </div>
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