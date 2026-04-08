import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePdf } from '@/lib/reports/pdf-generator';

// PDF generation via Puppeteer can take 15-30s for large reports —
// override the default 10s Vercel Hobby timeout. 60s is the max on
// Hobby and well within the default on Pro.
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const { html, filename } = body as { html?: string; filename?: string };

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'Falta el HTML del informe.' }, { status: 400 });
    }
    if (html.length > MAX_HTML_SIZE) {
      return NextResponse.json({ error: 'El HTML del informe es demasiado grande.' }, { status: 400 });
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generatePdf(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido generando PDF.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const safeName = (filename || 'informe').replace(/[<>:"/\\|?*]/g, '').substring(0, 150) || 'informe';

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
