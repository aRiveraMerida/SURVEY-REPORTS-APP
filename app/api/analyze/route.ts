import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildAnalysisPrompt } from '@/lib/ai/prompts';
import type { AIAnalysis } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, columnStats, totalRowCount } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API key requerida' }, { status: 400 });
    }

    const prompt = buildAnalysisPrompt(columnStats, totalRowCount);

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Sin respuesta de la IA' }, { status: 500 });
    }

    // Parse JSON - handle possible markdown wrapping
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const analysis: AIAnalysis = JSON.parse(jsonText);

    // Mark all questions as enabled by default
    analysis.questions = analysis.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      enabled: true,
      rationale: q.rationale || '',
    }));

    // Ensure dataType exists
    analysis.dataType = analysis.dataType || 'general';

    // Calculate cost (Claude Sonnet 4 pricing)
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

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
