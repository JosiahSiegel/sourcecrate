#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2] || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
    try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let file = resolve(root, '.' + pathname);
        if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
        file = await realpath(file);
        const local = relative(root, file);
        if (local.startsWith('..') || isAbsolute(local) || local.split(/[\\/]/).some(part => part.startsWith('.'))) {
            res.writeHead(403); res.end(); return;
        }
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
        res.writeHead(404); res.end('Not found');
    }
});
server.on('error', error => { console.error(`Cannot start server: ${error.message}. Choose another port if it is in use.`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`SourceCrate: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
