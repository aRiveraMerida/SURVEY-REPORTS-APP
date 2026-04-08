/**
 * Create a password-protected ZIP of a single file buffer using AES-256.
 * Uses archiver + archiver-zip-encrypted — pure Node, works in Vercel
 * serverless. Much stronger than the legacy PKZip "zip -P" cipher
 * (which is also unavailable on Vercel: the `zip` binary isn't installed).
 */
import archiver from 'archiver';
// archiver-zip-encrypted doesn't ship types; the runtime shape is a plugin
// registration function that archiver.registerFormat() accepts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverZipEncrypted = require('archiver-zip-encrypted');

let registered = false;
function ensureRegistered() {
  if (registered) return;
  // archiver mutates its global format registry. Registering twice throws,
  // so we guard with a module-level flag.
  try {
    archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
  } catch {
    // already registered in a previous invocation
  }
  registered = true;
}

export async function encryptFileWithZip(
  fileBuffer: Buffer,
  fileName: string,
  password: string
): Promise<Buffer> {
  ensureRegistered();

  return new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive = (archiver as any).create('zip-encrypted', {
      zlib: { level: 8 },
      encryptionMethod: 'aes256',
      password,
    });

    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('warning', (err: Error) => {
      // archiver emits warnings for non-fatal issues; treat as errors
      reject(err);
    });
    archive.on('error', (err: Error) => reject(err));

    archive.append(fileBuffer, { name: fileName });
    archive.finalize().catch(reject);
  });
}
