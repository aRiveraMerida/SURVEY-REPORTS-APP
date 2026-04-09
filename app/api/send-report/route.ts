import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';
import { generatePdf } from '@/lib/reports/pdf-generator';
import { encryptFileWithZip } from '@/lib/reports/zip-encrypt';
import { renderEmailSubject, renderEmailBody } from '@/lib/email/subject';
import type { EmailConfig } from '@/types/database';

// PDF generation + email send needs the serverless timeout raised
// above the default 10s. 60s is the Hobby maximum.
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_HTML_SIZE = 10 * 1024 * 1024;  // 10 MB
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-\s()áéíóúñÁÉÍÓÚÑ]/g, '_')
    .substring(0, 200);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

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
      } catch {
        return NextResponse.json(
          { error: 'No se pudo conectar al servidor SMTP. Revisa la configuración.' },
          { status: 400 }
        );
      }
    }

    // Send report email
    if (body.action === 'send-report') {
      const { clientId, reportId, title, period } = body;

      if (!clientId || !reportId) {
        return NextResponse.json(
          { error: 'Faltan datos requeridos (clientId y reportId).' },
          { status: 400 }
        );
      }

      // Load the report row (HTML + source file path) from the DB
      // instead of receiving the HTML in the request body — the HTML
      // with embedded base64 chart images can exceed Vercel's 4.5 MB
      // body size limit for serverless functions.
      const { data: reportRow, error: reportErr } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportErr || !reportRow) {
        return NextResponse.json(
          { error: reportErr ? `Error cargando el informe: ${reportErr.message}` : 'Informe no encontrado.' },
          { status: reportErr ? 500 : 404 }
        );
      }

      const reportHtml: string = typeof reportRow.report_html === 'string' ? reportRow.report_html : '';
      if (!reportHtml) {
        return NextResponse.json({ error: 'El informe no tiene HTML generado.' }, { status: 400 });
      }

      // Resolve the original source file from the report row
      // Load the source file from storage
      const sourcePath: string | null = typeof reportRow.source_file_path === 'string' ? reportRow.source_file_path : null;
      const sourceFileName: string = typeof reportRow.source_file_name === 'string' ? reportRow.source_file_name : 'datos.xlsx';

      if (!sourcePath) {
        return NextResponse.json(
          { error: 'Este informe no tiene fichero original asociado. Regenéralo desde el asistente.' },
          { status: 400 }
        );
      }

      const { data: fileData, error: dlErr } = await supabase
        .storage
        .from('source-files')
        .download(sourcePath);

      if (dlErr || !fileData) {
        return NextResponse.json(
          { error: 'No se pudo descargar el fichero original del almacenamiento.' },
          { status: 500 }
        );
      }

      const originalBuffer = Buffer.from(await fileData.arrayBuffer());
      if (originalBuffer.length === 0) {
        return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
      }
      if (originalBuffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'El archivo supera el límite de 25 MB.' }, { status: 400 });
      }

      // Get SMTP config
      const smtp = await getSmtpConfig(supabase);
      if (!smtp) {
        return NextResponse.json(
          { error: 'Configuración SMTP no encontrada. Configúrala en Settings.' },
          { status: 400 }
        );
      }

      // Get client config. Use SELECT * so a missing optional column
      // (e.g. email_subject_template before migration 005 is applied)
      // doesn't break the whole request — we read fields defensively
      // below.
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientErr || !client) {
        // Distinguish "not found" (PGRST116) from other Supabase errors
        // so we don't lie to the user with a generic 404.
        if (clientErr && clientErr.code !== 'PGRST116') {
          console.error('Client lookup failed:', clientErr);
          return NextResponse.json(
            { error: `Error consultando el cliente: ${clientErr.message}` },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
      }

      // Read client fields defensively — columns added by later migrations
      // may not exist yet on older Supabase projects.
      const clientName: string = typeof client.name === 'string' ? client.name : '';
      const clientContactEmails: string[] = Array.isArray(client.contact_emails) ? client.contact_emails : [];
      const clientFilePassword: string | null = typeof client.file_password === 'string' ? client.file_password : null;
      const clientSubjectTemplate: string | null = typeof client.email_subject_template === 'string' ? client.email_subject_template : null;
      const clientEmailConfig: EmailConfig | null =
        client.email_subject_config && typeof client.email_subject_config === 'object'
          ? (client.email_subject_config as EmailConfig)
          : null;

      // Use override emails if provided, otherwise fall back to client emails
      const emailSource = (body.overrideEmails && Array.isArray(body.overrideEmails) && body.overrideEmails.length > 0)
        ? body.overrideEmails
        : clientContactEmails;

      const validEmails = emailSource.filter(
        (email: string) => typeof email === 'string' && EMAIL_REGEX.test(email)
      );

      if (validEmails.length === 0) {
        return NextResponse.json(
          { error: 'No hay destinatarios válidos. Añade emails de contacto al cliente o especifica destinatarios.' },
          { status: 400 }
        );
      }

      // Prepare attachments
      const attachments: nodemailer.SendMailOptions['attachments'] = [];

      const safeTitle = ((title || 'Informe') as string).replace(/[<>:"/\\|?*]/g, '').substring(0, 100);
      const safePeriod = ((period || '') as string).replace(/[<>:"/\\|?*]/g, '').substring(0, 50);

      // Generate PDF — always required, no HTML fallback.
      // If Puppeteer is not installed/working we surface the real error
      // so the user can fix the deploy instead of silently shipping HTML.
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(reportHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido generando PDF.';
        return NextResponse.json(
          { error: `No se pudo generar el PDF del informe: ${msg}` },
          { status: 500 }
        );
      }

      attachments.push({
        filename: `${safeTitle} - ${safePeriod}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });

      // Original file: encrypt with AES-256 ZIP if password configured,
      // otherwise attach as-is.
      const trimmedPassword = clientFilePassword ? clientFilePassword.trim() : '';
      if (trimmedPassword) {
        try {
          const zipBuffer = await encryptFileWithZip(
            originalBuffer,
            sanitizeFileName(sourceFileName),
            trimmedPassword
          );
          const safeOrigName = sanitizeFileName(sourceFileName.replace(/\.[^.]+$/, ''));
          attachments.push({
            filename: `${safeOrigName}.zip`,
            content: zipBuffer,
            contentType: 'application/zip',
          });
        } catch (encErr) {
          console.error('ZIP encryption failed:', encErr);
          const msg = encErr instanceof Error ? encErr.message : 'error desconocido';
          return NextResponse.json(
            { error: `No se pudo encriptar el fichero adjunto con la contraseña del cliente: ${msg}` },
            { status: 500 }
          );
        }
      } else {
        attachments.push({
          filename: sanitizeFileName(sourceFileName),
          content: originalBuffer,
        });
      }

      const emailVars = { title: safeTitle, period: safePeriod, clientName };
      const subject = renderEmailSubject(clientEmailConfig, clientSubjectTemplate, emailVars);
      const bodyHtml = renderEmailBody(clientEmailConfig, emailVars);

      // Send email
      try {
        const transporter = createTransporter(smtp);
        await transporter.sendMail({
          from: smtp.from,
          to: validEmails.join(', '),
          subject,
          html: bodyHtml,
          attachments,
        });

        return NextResponse.json({
          message: `Informe enviado correctamente a ${validEmails.join(', ')}`,
        });
      } catch {
        return NextResponse.json(
          { error: 'Error al enviar el email. Revisa la configuración SMTP.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
