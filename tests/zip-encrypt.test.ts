/**
 * ZipCrypto (PKZip 2.0) ZIP encryption helper tests. Verifies the output is
 * a valid ZIP with the encryption bit set in the general-purpose bit flag,
 * which is what Windows Explorer's built-in unzip requires.
 */
import { describe, it, expect } from 'vitest';
import { encryptFileWithZip } from '@/lib/reports/zip-encrypt';

describe('encryptFileWithZip', () => {
  it('produces a non-empty buffer', async () => {
    const buf = await encryptFileWithZip(
      Buffer.from('hello world'),
      'test.txt',
      'password123',
    );
    expect(buf.length).toBeGreaterThan(0);
  });

  it('emits a valid ZIP header (PK\\x03\\x04)', async () => {
    const buf = await encryptFileWithZip(
      Buffer.from('hello'),
      'test.txt',
      'pass',
    );
    expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('sets the encryption bit (bit 0) in the general-purpose flag', async () => {
    const buf = await encryptFileWithZip(
      Buffer.from('payload content'),
      'file.csv',
      'SecurePass!',
    );
    // Local file header layout: PK\x03\x04 (4) + version (2) + GP flag (2)
    // The GP flag is little-endian uint16 at offset 6. Bit 0 must be set
    // when the entry is encrypted.
    const gpFlag = buf.readUInt16LE(6);
    expect(gpFlag & 0x0001).toBe(0x0001);
  });

  it('does NOT include the AES extra-field marker (0x9901)', async () => {
    // We deliberately use ZipCrypto (zip20) for Windows Explorer
    // compatibility, so the AES strong-encryption header must be absent.
    const buf = await encryptFileWithZip(
      Buffer.from('payload content'),
      'file.csv',
      'SecurePass!',
    );
    const hasAesMarker = buf.indexOf(Buffer.from([0x01, 0x99])) !== -1;
    expect(hasAesMarker).toBe(false);
  });

  it('encrypts different payloads to different bytes with the same password', async () => {
    const a = await encryptFileWithZip(Buffer.from('AAA'), 'a.txt', 'same');
    const b = await encryptFileWithZip(Buffer.from('BBB'), 'b.txt', 'same');
    expect(a.equals(b)).toBe(false);
  });
});
