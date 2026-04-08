import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildAnalysisPrompt } from '@/lib/ai/prompts';
import { createClient } from '@/lib/supabase/server';
import type { AIAnalysis, AIQuestionConfig, AITableRow, AIFlowchartPage } from '@/types/database';

// Analysis calls can take 20-40s for large datasets with many columns.
export const maxDuration = 60;
export const runtime = 'nodejs';

// Claude Sonnet 4.5 pricing (USD per 1M tokens). Keep in sync with
// https://docs.anthropic.com/en/docs/about-claude/pricing
const MODEL_ID = 'claude-sonnet-4-5';
const INPUT_PRICE_PER_M = 3;
const OUTPUT_PRICE_PER_M = 15;

function ensureArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check — no open endpoint.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const { columnStats, totalRowCount } = body;

    // Prefer the server-side ANTHROPIC_API_KEY. Fall back to the
    // browser-supplied key (legacy BYOK flow) so existing users keep
    // working while the env var is being rolled out.
    const serverKey = process.env.ANTHROPIC_API_KEY?.trim();
    const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiKey = serverKey || clientKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No hay API key de Anthropic configurada. Define ANTHROPIC_API_KEY en el servidor o introdúcela en Settings.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(columnStats) || typeof totalRowCount !== 'number') {
      return NextResponse.json(
        { error: 'Datos de entrada inválidos.' },
        { status: 400 }
      );
    }

    const prompt = buildAnalysisPrompt(columnStats, totalRowCount);

    const client = new Anthropic({ apiKey });

    let message;
    try {
      message = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error llamando a Claude';
      console.error('Claude API call failed:', msg);
      return NextResponse.json({ error: `Error de Claude: ${msg}` }, { status: 502 });
    }

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Sin respuesta de la IA.' }, { status: 500 });
    }

    // Parse JSON — handle possible markdown wrapping
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let analysis: AIAnalysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Failed to parse Claude response as JSON:', parseErr);
      return NextResponse.json(
        {
          error: 'La IA devolvió una respuesta no parseable como JSON. Revisa los datos de entrada.',
          rawPreview: jsonText.slice(0, 300),
        },
        { status: 502 }
      );
    }

    // Defensive normalization — Claude may omit or return unexpected
    // shapes for optional fields.
    analysis.questions = ensureArray<AIQuestionConfig>(analysis.questions).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      enabled: true,
      rationale: q.rationale || '',
    }));
    analysis.tableRows = ensureArray<AITableRow>(analysis.tableRows);
    analysis.flowchartPages = ensureArray<AIFlowchartPage>(analysis.flowchartPages);
    analysis.summary = typeof analysis.summary === 'string' ? analysis.summary : '';
    analysis.dataType = typeof analysis.dataType === 'string' ? analysis.dataType : 'general';

    // Calculate cost
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const costUsd =
      (inputTokens * INPUT_PRICE_PER_M + outputTokens * OUTPUT_PRICE_PER_M) / 1_000_000;

    return NextResponse.json({
      analysis,
      usage: { inputTokens, outputTokens, costUsd: Math.round(costUsd * 10000) / 10000 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Analysis API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
