import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomProxy } from './room-proxy.mjs';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = process.env.MEDIASFU_VALIDATION_ENV_PATH || path.join(serverRoot, '.env');

if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const port = Number(process.env.PORT || 8790);
createRoomProxy().listen(port, '127.0.0.1', () => {
  console.log(`MediaSFU familiar-call backend listening on http://127.0.0.1:${port}`);
});
