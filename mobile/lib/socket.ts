import ENV from './env';

type Listener = (data: any) => void;

export class EchoMindSocket {
  private static instance: EchoMindSocket;
  private socket: WebSocket | null = null;
  private url: string;
  private listeners: Record<string, Listener[]> = {};
  
  // Reconnection state
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private manualDisconnect = false;

  // Offline queue
  private messageQueue: any[] = [];

  // Auth token for JWT authentication
  private authToken: string | null = null;

  private constructor(url: string) {
    this.url = url;
  }

  public static getInstance(): EchoMindSocket {
    const wsUrl = ENV.WS_URL;
    if (!EchoMindSocket.instance) {
      EchoMindSocket.instance = new EchoMindSocket(wsUrl);
    }
    return EchoMindSocket.instance;
  }

  /**
   * Set the JWT auth token for WebSocket authentication.
   */
  public setAuthToken(token: string) {
    this.authToken = token;
  }

  public on(event: string, callback: Listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  public off(event: string, callback: Listener) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  private emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  }

  public get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public get status(): 'connected' | 'connecting' | 'disconnected' | 'authenticating' {
    if (this.socket?.readyState === WebSocket.OPEN) return 'connected';
    if (this.isConnecting) return 'connecting';
    return 'disconnected';
  }

  public connect() {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) return;

    this.manualDisconnect = false;
    this.isConnecting = true;
    this.emit('connecting');

    try {
      this.socket = new WebSocket(this.url);
    } catch (e) {
      this.isConnecting = false;
      this.emit('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Authenticate immediately after connection
      if (this.authToken) {
        this.send({ type: 'AUTH', token: this.authToken });
        this.emit('authenticating');
      } else {
        this.emit('connected');
        this.flushQueue();
      }
    };

    this.socket.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data as string);

        // Handle auth responses
        if (payload.type === 'AUTH_OK') {
          this.emit('connected');
          this.flushQueue();
          return;
        }
        if (payload.type === 'AUTH_FAIL') {
          this.emit('auth_failed', payload);
          return;
        }

        if (payload.type) {
          this.emit(payload.type, payload);
        } else {
          this.emit('message', payload);
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    this.socket.onclose = () => {
      this.isConnecting = false;
      this.socket = null;
      this.emit('disconnected');

      if (!this.manualDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      this.isConnecting = false;
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      this.emit('reconnect_failed');
    }
  }

  /** Reset reconnect counter and try again immediately */
  public retry() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }

  private flushQueue() {
    while (this.messageQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      this.socket.send(JSON.stringify(msg));
    }
  }

  public send(data: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      // Don't queue auth messages
      if (data.type !== 'AUTH') {
        this.messageQueue.push(data);
      }
      if (!this.manualDisconnect && !this.isConnecting) {
        this.reconnectAttempts = 0;
        this.connect();
      }
    }
  }

  /**
   * Send a text transcript for memory extraction.
   * Server handles language detection and NLP processing.
   */
  public streamTranscript(text: string) {
    if (!text || !text.trim()) return;
    this.send({
      type: 'TEXT_TRANSCRIPT',
      text: text.trim(),
    });
  }

  /**
   * Send a semantic search query (bilingual).
   * Server responds with QUERY_RESULT containing matched memories + AI answer.
   */
  public sendQuery(query: string) {
    if (!query || !query.trim()) return;
    this.send({
      type: 'QUERY',
      text: query.trim(),
    });
  }

  public disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
