import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';
import { generatePdf } from '@/lib/reports/pdf-generator';
import { encryptFileWithZip } from '@/lib/reports/zip-encrypt';

// PDF generation + email send needs the serverless timeout raised
// above the default 10s. 60s is the Hobby maximum.
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_HTML_SIZE = 10 * 1024 * 1024;  // 10 MB
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Render an email subject using a template with placeholders:
 *   {title}, {period}, {clientName}
 * Falls back to "title — period" if template is missing.
 */
function renderEmailSubject(
  template: string | null | undefined,
  vars: { title: string; period: string; clientName: string }
): string {
  const safe = (s: string) => s.replace(/[\r\n]/g, ' ').trim();
  const fallback = `${safe(vars.title)} — ${safe(vars.period)}`;
  if (!template || !template.trim()) return fallback;
  const rendered = template
    .replace(/\{title\}/g, safe(vars.title))
    .replace(/\{period\}/g, safe(vars.period))
    .replace(/\{clientName\}/g, safe(vars.clientName));
  return rendered.replace(/[\r\n]/g, ' ').trim().substring(0, 200) || fallback;
}

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
      const { clientId, reportId, reportHtml, title, period } = body;

      if (!clientId || !reportHtml) {
        return NextResponse.json(
          { error: 'Faltan datos requeridos.' },
          { status: 400 }
        );
      }

      // Validate input sizes
      if (typeof reportHtml !== 'string' || reportHtml.length > MAX_HTML_SIZE) {
        return NextResponse.json({ error: 'El HTML del informe es demasiado grande.' }, { status: 400 });
      }

      // Resolve the original source file. Priority:
      //   1. `reportId` → load source_file_path from the report row, download from storage
      //   2. `originalFileBase64` + `originalFileName` → inline upload (used by new-report wizard
      //      before the report exists in DB)
      let originalBuffer: Buffer | null = null;
      let originalFileName: string | null = null;

      if (reportId && typeof reportId === 'string') {
        // SELECT * so the query doesn't blow up if migration 005 hasn't
        // been applied yet (source_file_path / source_file_name may not
        // exist). We validate presence below.
        const { data: reportRow, error: reportErr } = await supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (reportErr) {
          console.error('Report lookup failed:', reportErr);
          return NextResponse.json(
            { error: `Error consultando el informe: ${reportErr.message}` },
            { status: 500 }
          );
        }

        const sourcePath: string | null = typeof reportRow?.source_file_path === 'string' ? reportRow.source_file_path : null;
        const sourceName: string | null = typeof reportRow?.source_file_name === 'string' ? reportRow.source_file_name : null;

        if (!sourcePath || !sourceName) {
          return NextResponse.json(
            { error: 'Este informe no tiene fichero original asociado. Adjunta el Excel/CSV manualmente o regenéralo desde el asistente.' },
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

        originalBuffer = Buffer.from(await fileData.arrayBuffer());
        originalFileName = sourceName;
      } else if (body.originalFileBase64 && body.originalFileName) {
        if (typeof body.originalFileName !== 'string' || body.originalFileName.length > 255) {
          return NextResponse.json({ error: 'Nombre de archivo demasiado largo.' }, { status: 400 });
        }
        try {
          originalBuffer = Buffer.from(body.originalFileBase64, 'base64');
        } catch {
          return NextResponse.json({ error: 'Error al decodificar el archivo.' }, { status: 400 });
        }
        originalFileName = body.originalFileName;
      } else {
        return NextResponse.json(
          { error: 'Falta el fichero original. Envía reportId o originalFileBase64.' },
          { status: 400 }
        );
      }

      if (!originalBuffer || originalBuffer.length === 0 || !originalFileName) {
        return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
      }
      if (originalBuffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'El archivo supera el límite de 25 MB.' }, { status: 400 });
      }
      // From here on the TS types are non-null — pin locals for type-narrowing
      const sourceBuffer: Buffer = originalBuffer;
      const sourceFileName: string = originalFileName;

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
            sourceBuffer,
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
          content: sourceBuffer,
        });
      }

      const subject = renderEmailSubject(clientSubjectTemplate, {
        title: safeTitle,
        period: safePeriod,
        clientName,
      });

      // Send email
      try {
        const transporter = createTransporter(smtp);
        await transporter.sendMail({
          from: smtp.from,
          to: validEmails.join(', '),
          subject,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#53860F;margin-bottom:8px;">${safeTitle}</h2>
              <p style="color:#666;margin-bottom:20px;">Periodo: <strong>${safePeriod}</strong></p>
              <p style="color:#333;line-height:1.6;">
                Adjunto encontrará el informe generado en formato PDF${trimmedPassword ? ' y el archivo de datos original en un ZIP protegido con contraseña' : ' y el archivo de datos original'}.
              </p>
              ${trimmedPassword ? '<p style="color:#888;font-size:13px;margin-top:16px;">El archivo ZIP está protegido con la contraseña que le fue comunicada previamente.</p>' : ''}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
              <p style="color:#aaa;font-size:12px;">Este email ha sido enviado automáticamente.</p>
            </div>
          `,
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
