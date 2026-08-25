import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonSessionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const value = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      return value && Array.isArray(value.sessions) ? value : { sessions: [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { sessions: [] };
      throw error;
    }
  }

  async write(value) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  update(operation) {
    const next = this.queue.then(async () => {
      const value = await this.read();
      const result = await operation(value);
      if (result !== null) await this.write(value);
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export class MemorySessionStore {
  constructor() {
    this.value = { sessions: [] };
    this.queue = Promise.resolve();
  }

  async read() {
    return this.value;
  }

  update(operation) {
    const next = this.queue.then(async () => operation(this.value));
    this.queue = next.catch(() => undefined);
    return next;
  }
}
