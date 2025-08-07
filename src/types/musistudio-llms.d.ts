declare module '@musistudio/llms' {
  interface ServerConfig {
    initialConfig?: {
      providers?: any[];
      Router?: Record<string, string | number>;
      HOST?: string;
      PORT?: number;
    };
  }

  class Server {
    constructor(config: ServerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  export = Server;
}