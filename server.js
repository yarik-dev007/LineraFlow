import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8070;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

console.log(`📦 Linera Blob Server running on port ${PORT}`);

// Helper to delete files safely
const cleanup = (filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Cleanup error:', e);
  }
};

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'publish_blob' && data.file) {
        console.log(`Received file upload request (${data.fileType || 'unknown'})`);

        // 1. Decode Base64
        // Handle "data:image/png;base64,..." or raw base64
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

        const tryPublish = (cmd, onError) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`Command failed: ${cmd}\n${error.message}`);
              if (onError) onError();
              else {
                ws.send(JSON.stringify({ type: 'blob_error', message: 'Failed to publish blob' }));
                cleanup(tempFilePath);
              }
              return;
            }

            // 5. Parse Hash
            const match = stdout.match(/([a-f0-9]{64})/);
            if (match) {
              const hash = match[1];
              console.log(`✅ Blob published: ${hash}`);
              ws.send(JSON.stringify({ type: 'blob_published', hash: hash }));
            } else {
              console.error('Could not parse hash from output:', stdout);
              ws.send(JSON.stringify({ type: 'blob_error', message: 'Could not parse blob hash from CLI output' }));
            }

            cleanup(tempFilePath);
          });
        };

        // Try direct command first
        tryPublish(command, () => {
          // Fallback: Try WSL if on Windows
          if (process.platform === 'win32') {
            console.log('Retrying with WSL...');

            // Re-write file if it was deleted by cleanup (though cleanup is inside callback, sync logic might race or cleanup might have happened)
            if (!fs.existsSync(tempFilePath)) fs.writeFileSync(tempFilePath, buffer);

            // Convert path to WSL format: C:\Users\Admin... -> /mnt/c/Users/Admin...
            let wslPath = tempFilePath.replace(/\\/g, '/');
            if (wslPath.match(/^[a-zA-Z]:/)) {
              wslPath = `/mnt/${wslPath[0].toLowerCase()}${wslPath.slice(2)}`;
            }

            const wslCommand = `wsl ~/.cargo/bin/linera publish-data-blob "${wslPath}"`;
            tryPublish(wslCommand, null);
          }
        });
      }

    } catch (e) {
      console.error('Error processing message:', e);
      ws.send(JSON.stringify({ type: 'blob_error', message: 'Invalid JSON or server error' }));
    }
  });
});