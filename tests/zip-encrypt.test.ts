/**
 * AES-256 ZIP encryption helper tests. Verifies the output is a valid
 * ZIP with the AES extra field marker, which is what matters for email
 * recipients using 7zip / modern unzip.
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

  it('includes the AES extra-field marker (0x9901)', async () => {
    const buf = await encryptFileWithZip(
      Buffer.from('payload content'),
      'file.csv',
      'SecurePass!',
    );
    // archiver-zip-encrypted writes the AES header id 0x9901 in
    // little-endian (01 99) inside the extra field. If it's missing
    // we're probably emitting unencrypted data.
    const hasAesMarker = buf.indexOf(Buffer.from([0x01, 0x99])) !== -1;
    expect(hasAesMarker).toBe(true);
  });

  it('encrypts different payloads to different bytes with the same password', async () => {
    const a = await encryptFileWithZip(Buffer.from('AAA'), 'a.txt', 'same');
    const b = await encryptFileWithZip(Buffer.from('BBB'), 'b.txt', 'same');
    expect(a.equals(b)).toBe(false);
  });
});
