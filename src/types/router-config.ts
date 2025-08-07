export interface RouterProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: Record<string, unknown>;
}

export interface RouterConfiguration {
  enabled: boolean;
  providers: RouterProvider[];
  rules: Record<string, string | number>;
}
