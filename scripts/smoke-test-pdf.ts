/**
 * Smoke test for real PDF generation via Puppeteer.
 * Run with: npx tsx scripts/smoke-test-pdf.ts
 */
import { generatePdf } from '../lib/reports/pdf-generator';
import { writeFileSync } from 'fs';

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Test PDF</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { font-family: sans-serif; padding: 40px; background: #53860F; color: white; }
    h1 { font-size: 48px; }
    .box { background: white; color: black; padding: 20px; border-radius: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Informe de prueba</h1>
  <div class="box">
    <p>Esto es un test de generación de PDF para verificar que Puppeteer
       está correctamente instalado y funciona.</p>
    <p>Fecha: 15/02/2026</p>
    <p>Hora: 14:30</p>
  </div>
</body>
</html>`;

(async () => {
  console.log('[PDF] Generating PDF via generatePdf()...');
  try {
    const buf = await generatePdf(html);
    console.log(`[PDF] Got buffer of ${buf.length} bytes`);

    // A valid PDF starts with the magic bytes "%PDF-"
    const header = buf.slice(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      console.error(`[PDF] FAIL — expected %PDF- header, got: ${JSON.stringify(header)}`);
      process.exit(1);
    }
    console.log('[PDF] PASS — header %PDF- present');

    // End of file marker
    const tail = buf.slice(-6).toString('ascii');
    if (!tail.includes('%%EOF')) {
      console.error(`[PDF] FAIL — expected %%EOF trailer, got: ${JSON.stringify(tail)}`);
      process.exit(1);
    }
    console.log('[PDF] PASS — %%EOF trailer present');

    if (buf.length < 1000) {
      console.error(`[PDF] FAIL — suspiciously small PDF (${buf.length} bytes)`);
      process.exit(1);
    }
    console.log(`[PDF] PASS — reasonable size (${buf.length} bytes)`);

    // Save for manual inspection
    writeFileSync('/tmp/smoke-test.pdf', buf);
    console.log('[PDF] Saved to /tmp/smoke-test.pdf');

    console.log('\n[PDF] All checks passed.');
  } catch (err) {
    console.error('[PDF] FAIL —', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
