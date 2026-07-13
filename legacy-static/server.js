/*
 * گرین‌پی · اتاق جلسات — سرور استاتیک سبک بدون هیچ وابستگی
 * Lightweight zero-dependency static server (Node.js built-in http only).
 *
 * اجرا / Run:
 *   node server.js            → پورت پیش‌فرض 8080
 *   node server.js 3000       → روی پورت 3000
 *   set PORT=9000 && node server.js   (Windows CMD)
 *   $env:PORT=9000; node server.js    (Windows PowerShell)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // جلوگیری از path traversal
    const safePath = path.normalize(path.join(ROOT, urlPath));
    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('Forbidden');
    }

    fs.readFile(safePath, (err, data) => {
      if (err) {
        // مسیر ناشناخته → برگردان به index.html (تک‌صفحه‌ای)
        return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        });
      }
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log('گرین‌پی · اتاق جلسات — سرور اجرا شد');
  console.log('  → http://localhost:' + PORT + '/');
  console.log('  (برای توقف: Ctrl+C)');
});
