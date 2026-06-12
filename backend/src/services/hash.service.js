import crypto from 'node:crypto';
import fs from 'node:fs';

export async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(new Error(`Error al leer archivo para hash: ${err.message}`)));
  });
}
