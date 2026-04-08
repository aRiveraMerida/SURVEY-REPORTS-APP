/**
 * Server-side PDF generation via Puppeteer.
 *
 * Tries two strategies:
 *   1. @sparticuz/chromium + puppeteer-core (Vercel / serverless environments)
 *   2. Full puppeteer (local dev; bundles its own Chromium)
 *
 * Throws if both strategies fail so callers can surface a real error
 * instead of silently falling back to HTML.
 */
export async function generatePdf(html: string): Promise<Buffer> {
  const isLandscape = html.includes('landscape');
  const pdfOptions = {
    format: 'A4' as const,
    landscape: isLandscape,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    timeout: 30000,
  };

  let serverlessErr: unknown = null;
  let localErr: unknown = null;

  // Strategy 1: @sparticuz/chromium (Vercel / serverless)
  try {
    const chromium = await import('@sparticuz/chromium');
    const puppeteerCore = await import('puppeteer-core');
    const executablePath = await chromium.default.executablePath();
    const browser = await puppeteerCore.default.launch({
      args: chromium.default.args,
      executablePath,
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBuffer = await page.pdf(pdfOptions);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    serverlessErr = err;
  }

  // Strategy 2: Full puppeteer (local dev)
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBuffer = await page.pdf(pdfOptions);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    localErr = err;
  }

  const serverlessMsg = serverlessErr instanceof Error ? serverlessErr.message : String(serverlessErr);
  const localMsg = localErr instanceof Error ? localErr.message : String(localErr);
  throw new Error(
    `No se pudo generar el PDF. Revisa la instalación de Chromium/Puppeteer. ` +
    `Serverless: ${serverlessMsg}. Local: ${localMsg}`
  );
}
