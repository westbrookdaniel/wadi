const MESSAGE_NAMESPACE = "urn:x-cast:com.wadi";
const CHUNK_SIZE = 20000;

type Listener = (...args: unknown[]) => void;

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: any;
    chrome?: any;
  }
}

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

export class ChromecastTransport {
  private bus = new EventBus();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private chunksById = new Map<string, string[]>();

  private readonly onCastStateChanged = (event: unknown) => {
    this.bus.emit("cast_state_changed", event);
  };

  private readonly onSessionStateChanged = (event: any) => {
    this.bus.emit("session_state_changed", event);
    const session = event?.session;
    if (!session) {
      return;
    }
    if (event?.sessionState === window.cast.framework.SessionState.SESSION_STARTED) {
      session.addMessageListener(MESSAGE_NAMESPACE, this.onMessage);
    }
    if (event?.sessionState === window.cast.framework.SessionState.SESSION_ENDED) {
      session.removeMessageListener(MESSAGE_NAMESPACE, this.onMessage);
    }
  };

  private readonly onMessage = (_namespace: string, payload: string | Record<string, unknown>) => {
    try {
      const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
      const { id, chunk, index, length } = parsed as {
        id: string;
        chunk: string;
        index: number;
        length: number;
      };
      const chunks = this.chunksById.get(id) ?? [];
      chunks[index] = chunk;
      this.chunksById.set(id, chunks);
      if (chunks.filter(Boolean).length === length) {
        this.chunksById.delete(id);
        this.bus.emit("message", JSON.parse(chunks.join("")));
      }
    } catch (error) {
      this.bus.emit("message_error", error);
    }
  };

  private ensureInitialized() {
    if (this.initialized) {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (!window.cast?.framework?.CastContext) {
        window.__onGCastApiAvailable = (available) => {
          if (!available || !window.cast?.framework?.CastContext) {
            reject(new Error("Google Cast API unavailable"));
            return;
          }
          resolve();
        };
        return;
      }
      resolve();
    }).then(() => {
      this.initialized = true;
      const context = window.cast.framework.CastContext.getInstance();
      context.addEventListener(
        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        this.onCastStateChanged,
      );
      context.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        this.onSessionStateChanged,
      );
    });

    return this.initPromise;
  }

  async setOptions(receiverApplicationId: string) {
    await this.ensureInitialized();
    const context = window.cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.PAGE_SCOPED,
      resumeSavedSession: false,
      language: null,
      androidReceiverCompatible: true,
    });
  }

  on(event: string, listener: Listener) {
    this.bus.on(event, listener);
  }

  off(event: string, listener: Listener) {
    this.bus.off(event, listener);
  }

  getCastState() {
    if (!window.cast?.framework?.CastContext) {
      return null;
    }
    return window.cast.framework.CastContext.getInstance().getCastState();
  }

  getCastDevice() {
    const session = window.cast?.framework?.CastContext?.getInstance?.().getCurrentSession?.();
    return session?.getCastDevice?.() ?? null;
  }

  async requestSession() {
    await this.ensureInitialized();
    return window.cast.framework.CastContext.getInstance().requestSession();
  }

  endCurrentSession(stopCasting = true) {
    if (!window.cast?.framework?.CastContext) {
      return;
    }
    window.cast.framework.CastContext.getInstance().endCurrentSession(stopCasting);
  }

  async sendMessage(message: unknown) {
    await this.ensureInitialized();
    const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session) {
      throw new Error("Cast session not started");
    }
    const serialized = JSON.stringify(message);
    const chunksCount = Math.ceil(serialized.length / CHUNK_SIZE);
    const id = Math.random().toString(16).slice(2);
    const sends: Promise<unknown>[] = [];
    for (let i = 0; i < chunksCount; i += 1) {
      const start = i * CHUNK_SIZE;
      const chunk = serialized.slice(start, start + CHUNK_SIZE);
      sends.push(
        session.sendMessage(MESSAGE_NAMESPACE, {
          id,
          chunk,
          index: i,
          length: chunksCount,
        }),
      );
    }
    await Promise.all(sends);
  }
}

let transportInstance: ChromecastTransport | null = null;

export function getChromecastTransport() {
  if (!transportInstance) {
    transportInstance = new ChromecastTransport();
  }
  return transportInstance;
}

export const WADI_CAST_NAMESPACE = MESSAGE_NAMESPACE;
