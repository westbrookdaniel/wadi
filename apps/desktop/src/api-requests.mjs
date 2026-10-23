import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export function createApiRequests(api) {
  const controllers = new Map();
  const requestId = z.uuid();
  return {
    async request(path, options = {}) {
      const id = requestId.parse(options.requestId ?? randomUUID());
      if (controllers.has(id)) throw new Error('Duplicate request ID');
      const controller = new AbortController();
      controllers.set(id, controller);
      try { return await api(path, { ...options, signal: controller.signal }); }
      finally { controllers.delete(id); }
    },
    cancel(id) { controllers.get(requestId.parse(id))?.abort(); },
    dispose() { for (const controller of controllers.values()) controller.abort(); controllers.clear(); },
  };
}
