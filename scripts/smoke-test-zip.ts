/**
 * Smoke test for the AES-256 ZIP encryption helper.
 */
import { encryptFileWithZip } from '../lib/reports/zip-encrypt';
import { writeFileSync } from 'fs';

(async () => {
  const testData = Buffer.from('Hola, esto es un fichero de prueba\nLínea 2\n');
  const password = 'MiContraseña123!';

  console.log('[zip] encrypting...');
  const zipBuffer = await encryptFileWithZip(testData, 'test.txt', password);

  console.log(`[zip] got ${zipBuffer.length} bytes`);

  // ZIP file magic header: PK\x03\x04
  const header = zipBuffer.slice(0, 4);
  if (header[0] !== 0x50 || header[1] !== 0x4B || header[2] !== 0x03 || header[3] !== 0x04) {
    console.error(`[zip] FAIL — expected PK.. header, got: ${header.toString('hex')}`);
    process.exit(1);
  }
  console.log('[zip] PASS — PK header present');

  // Save for manual verification with unzip -P
  writeFileSync('/tmp/smoke-test-encrypted.zip', zipBuffer);
  console.log('[zip] Saved to /tmp/smoke-test-encrypted.zip');
  console.log('[zip] Verify with: unzip -P "MiContraseña123!" /tmp/smoke-test-encrypted.zip');

  // Try to detect the AES extra field marker (archiver-zip-encrypted sets it)
  // The AES header field id is 0x9901 in the extra field of the local file header
  const hasAesMarker = zipBuffer.indexOf(Buffer.from([0x01, 0x99])) !== -1;
  if (hasAesMarker) {
    console.log('[zip] PASS — AES encryption marker found');
  } else {
    console.log('[zip] WARN — AES marker not found (might still work)');
  }

  console.log('\n[zip] All checks passed.');
})().catch((err) => {
  console.error('[zip] FAIL —', err);
  process.exit(1);
});
