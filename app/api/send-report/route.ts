import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

async function getSmtpConfig(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SmtpConfig | null> {
  const { data } = await supabase
    .from('emitter_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, company_name')
    .limit(1)
    .single();

  if (!data?.smtp_host || !data?.smtp_user || !data?.smtp_pass || !data?.smtp_from) {
    return null;
  }

  return {
    host: data.smtp_host,
    port: data.smtp_port || 587,
    user: data.smtp_user,
    pass: data.smtp_pass,
    from: data.company_name ? `${data.company_name} <${data.smtp_from}>` : data.smtp_from,
  };
}

function createTransporter(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

async function generatePdf(html: string): Promise<Buffer> {
  // Dynamic import to avoid issues if chromium is not available
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  const executablePath = await chromium.default.executablePath();

  const browser = await puppeteer.default.launch({
    args: chromium.default.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Extract page size and orientation from the HTML @page rule
    const isLandscape = html.includes('landscape');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: isLandscape,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function encryptFileWithZip(
  fileBuffer: Buffer,
  fileName: string,
  password: string
): Buffer {
  const tmpDir = join(tmpdir(), `report-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const inputPath = join(tmpDir, fileName);
    const zipPath = join(tmpDir, 'encrypted.zip');

    writeFileSync(inputPath, fileBuffer);

    // Use system zip with password encryption
    execSync(`zip -j -P "${password.replace(/"/g, '\\"')}" "${zipPath}" "${inputPath}"`, {
      timeout: 30000,
    });

    return readFileSync(zipPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    // Test SMTP connection
    if (body.action === 'test-smtp') {
      const smtp = await getSmtpConfig(supabase);
      if (!smtp) {
        return NextResponse.json(
          { error: 'Configura todos los campos SMTP en Settings antes de probar.' },
          { status: 400 }
        );
      }

      try {
        const transporter = createTransporter(smtp);
        await transporter.verify();
        return NextResponse.json({ message: 'Conexión SMTP exitosa.' });
      } catch (err) {
        return NextResponse.json(
          { error: `Error de conexión SMTP: ${(err as Error).message}` },
          { status: 400 }
        );
      }
    }

    // Send report email
    if (body.action === 'send-report') {
      const { clientId, reportHtml, originalFileBase64, originalFileName, title, period } = body;

      if (!clientId || !reportHtml || !originalFileBase64 || !originalFileName) {
        return NextResponse.json(
          { error: 'Faltan datos requeridos (clientId, reportHtml, originalFileBase64, originalFileName).' },
          { status: 400 }
        );
      }

      // Get SMTP config
      const smtp = await getSmtpConfig(supabase);
      if (!smtp) {
        return NextResponse.json(
          { error: 'Configuración SMTP no encontrada. Configúrala en Settings.' },
          { status: 400 }
        );
      }

      // Get client config
      const { data: client } = await supabase
        .from('clients')
        .select('name, contact_emails, file_password')
        .eq('id', clientId)
        .single();

      if (!client) {
        return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
      }

      if (!client.contact_emails || client.contact_emails.length === 0) {
        return NextResponse.json(
          { error: 'El cliente no tiene emails de contacto configurados.' },
          { status: 400 }
        );
      }

      // Generate PDF from report HTML
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(reportHtml);
      } catch (err) {
        return NextResponse.json(
          { error: `Error al generar PDF: ${(err as Error).message}` },
          { status: 500 }
        );
      }

      // Prepare original file attachment
      const originalBuffer = Buffer.from(originalFileBase64, 'base64');
      const attachments: nodemailer.SendMailOptions['attachments'] = [];

      // PDF attachment
      const safeTitle = (title || 'Informe').replace(/[<>:"/\\|?*]/g, '');
      const safePeriod = (period || '').replace(/[<>:"/\\|?*]/g, '');
      attachments.push({
        filename: `${safeTitle} - ${safePeriod}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });

      // Original file: encrypt with ZIP if password configured, otherwise attach as-is
      if (client.file_password) {
        try {
          const zipBuffer = encryptFileWithZip(originalBuffer, originalFileName, client.file_password);
          const zipName = originalFileName.replace(/\.[^.]+$/, '') + '.zip';
          attachments.push({
            filename: zipName,
            content: zipBuffer,
            contentType: 'application/zip',
          });
        } catch (err) {
          return NextResponse.json(
            { error: `Error al encriptar archivo: ${(err as Error).message}` },
            { status: 500 }
          );
        }
      } else {
        attachments.push({
          filename: originalFileName,
          content: originalBuffer,
        });
      }

      // Send email
      try {
        const transporter = createTransporter(smtp);
        await transporter.sendMail({
          from: smtp.from,
          to: client.contact_emails.join(', '),
          subject: `${safeTitle} — ${safePeriod}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#53860F;margin-bottom:8px;">${safeTitle}</h2>
              <p style="color:#666;margin-bottom:20px;">Periodo: <strong>${safePeriod}</strong></p>
              <p style="color:#333;line-height:1.6;">
                Adjunto encontrará el informe generado en formato PDF${client.file_password ? ' y el archivo de datos original en un ZIP protegido con contraseña' : ' y el archivo de datos original'}.
              </p>
              ${client.file_password ? '<p style="color:#888;font-size:13px;margin-top:16px;">El archivo ZIP está protegido con la contraseña que le fue comunicada previamente.</p>' : ''}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
              <p style="color:#aaa;font-size:12px;">Este email ha sido enviado automáticamente.</p>
            </div>
          `,
          attachments,
        });

        return NextResponse.json({
          message: `Informe enviado correctamente a ${client.contact_emails.join(', ')}`,
        });
      } catch (err) {
        return NextResponse.json(
          { error: `Error al enviar email: ${(err as Error).message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `Error interno: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
