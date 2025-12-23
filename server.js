import http from 'http';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8070;

const cleanup = (filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Cleanup error:', e);
  }
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (!data.file) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No file data provided' }));
          return;
        }

        console.log(`Received file upload request (${data.fileType || 'unknown'})`);

        // 1. Decode Base64
        const base64Data = data.file.includes('base64,')
          ? data.file.split('base64,')[1]
          : data.file;

        const buffer = Buffer.from(base64Data, 'base64');

        // 2. Determine Extension
        const ext = data.fileType === 'application/zip' ? '.zip'
          : data.fileType === 'application/pdf' ? '.pdf'
            : data.fileType === 'image/png' ? '.png'
              : data.fileType === 'image/jpeg' ? '.jpg'
                : '.bin';

        const tempFileName = `temp_${Date.now()}${ext}`;
        const tempFilePath = path.join(__dirname, tempFileName);

        // 3. Save Temp File
        fs.writeFileSync(tempFilePath, buffer);
        console.log(`Saved temp file: ${tempFilePath}`);

        // 4. Publish to Linera
        const command = `linera publish-data-blob "${tempFilePath}"`;

        const respond = (status, content) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(content));
        };

        const tryPublish = (cmd, onError) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`Command failed: ${cmd}\n${error.message}`);
              if (onError) onError();
              else {
                respond(500, { error: 'Failed to publish blob', details: error.message });
                cleanup(tempFilePath);
              }
              return;
            }

            const match = stdout.match(/([a-f0-9]{64})/);
            if (match) {
              const hash = match[1];
              console.log(`✅ Blob published: ${hash}`);
              respond(200, { hash });
            } else {
              console.error('Could not parse hash:', stdout);
              respond(500, { error: 'Could not parse blob hash' });
            }
            cleanup(tempFilePath);
          });
        };

        // Execution Logic
        tryPublish(command, () => {
          if (process.platform === 'win32') {
            console.log('Retrying with WSL...');
            // Re-write file if needed because cleanup might not have happened yet but to be safe
            if (!fs.existsSync(tempFilePath)) fs.writeFileSync(tempFilePath, buffer);

            let wslPath = tempFilePath.replace(/\\/g, '/');
            if (wslPath.match(/^[a-zA-Z]:/)) {
              wslPath = `/mnt/${wslPath[0].toLowerCase()}${wslPath.slice(2)}`;
            }
            const wslCommand = `wsl ~/.cargo/bin/linera publish-data-blob "${wslPath}"`;
            tryPublish(wslCommand, null);
          }
        });

      } catch (e) {
        console.error('Processing error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error parsing request' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📦 Linera Blob Server (HTTP) running on port ${PORT}`);
});