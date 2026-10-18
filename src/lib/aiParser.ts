import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AppError } from './errors';
import type { ParseResult } from './scriptParser';
import {
  AiParseSchema,
  AI_PARSER_SYSTEM_PROMPT,
  buildParseResult,
  formatNumberedLines,
  lastBlockStart,
  sourceLines
} from './aiParserCore';

/**
 * Parses a script with Claude. Loaded on demand (dynamic import) so the SDK
 * only downloads for people who use AI parsing.
 */

export const AI_PARSER_MODEL = 'claude-opus-5-5';

export interface AiParseOptions {
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  /** Called with the fraction (0–1) of the script labelled so far, as the response streams in. */
  onProgress?: (fraction: number) => void;
}

export async function parseScriptWithAI(
  rawText: string,
  apiKey: string,
  { model = AI_PARSER_MODEL, effort = 'low', onProgress }: AiParseOptions = {}
): Promise<ParseResult> {
  if (!apiKey) throw new AppError('aiNoKey', 'Add an Anthropic API key in Settings to parse with AI.');
  const lines = sourceLines(rawText);
  if (lines.length === 0) {
    throw new AppError('noLinesDetected', 'No lines could be detected in this script.');
  }

  // The key is the user's own, entered on this device (like the OpenAI key
  // for Whisper), so calling the API from the browser exposes it to no one else.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const stream = client.beta.messages.stream({
      model,
      // Labels are short, but a full-length play has well over a thousand blocks.
      max_tokens: 64000,
      // On a safety decline, re-run on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: betaZodOutputFormat(AiParseSchema) },
      system: AI_PARSER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: formatNumberedLines(lines) }]
    });
    if (onProgress) {
      // Scan only the newest text, with a little overlap for a match split across deltas.
      let tail = '';
      let reported = 0;
      stream.on('text', (delta) => {
        tail = (tail + delta).slice(-(delta.length + 24));
        const start = lastBlockStart(tail);
        const fraction = start === null ? reported : Math.min(1, (start - 1) / lines.length);
        if (fraction - reported >= 0.01) {
          reported = fraction;
          onProgress(fraction);
        }
      });
    }
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new AppError('aiRefused', 'The AI declined to parse this script.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AppError('aiTooLong', 'This script is too long to parse with AI in one go.');
    }
    if (!message.parsed_output) {
      throw new AppError('aiInvalidResponse', 'The AI returned an unusable result.', {
        detail: 'no structured output'
      });
    }
    return buildParseResult(lines, message.parsed_output);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AppError('aiBadKey', 'The Anthropic API key was rejected. Check it in Settings.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AppError('aiRateLimited', 'Too many AI requests right now. Try again in a minute.');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AppError('aiNetwork', 'Could not reach the AI service. Check your connection.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new AppError('aiFailed', `AI parsing failed: ${err.message}`, { detail: err.message });
    }
    throw err;
  }
}
