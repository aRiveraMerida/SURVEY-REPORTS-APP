import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Proxy endpoint that verifies an Anthropic API key server-side.
 * Avoids exposing the key to the browser with the
 * `anthropic-dangerous-direct-browser-access` header, and keeps the
 * Anthropic call on a trusted origin.
 */
export async function POST(request: NextRequest) {
  try {
    // Require authenticated user so this endpoint can't be abused as an
    // open key checker for random callers.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const apiKey: string | undefined = body?.apiKey;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return NextResponse.json({ valid: false, error: 'Clave vacía o muy corta.' });
    }

    const client = new Anthropic({ apiKey: apiKey.trim() });

    try {
      // Smallest possible call: one token of output on a single-word prompt.
      await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return NextResponse.json({ valid: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error verificando la clave';
      return NextResponse.json({ valid: false, error: msg });
    }
  } catch {
    return NextResponse.json({ valid: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}
