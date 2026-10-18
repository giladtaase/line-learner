import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AppError } from './errors';
import type { ParseResult } from './scriptParser';
import {
  AiParseSchema,
  AI_PARSER_SYSTEM_PROMPT,
  PDF_CONTEXT_NOTE,
  buildParseResult,
  formatKnownCharacters,
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
  /** Character names already in the play (when parsing an update to some of
   *  its scenes), so the same people come back under the same names. */
  knownCharacters?: string[];
  /** The PDF the text was extracted from, attached so Claude can see
   *  strikethrough and colored editing notes the extracted text can't show. */
  pdf?: ArrayBuffer;
}

function createClient(apiKey: string): Anthropic {
  if (!apiKey) throw new AppError('aiNoKey', 'Add an Anthropic API key in Settings to parse with AI.');
  // The key is the user's own, entered on this device (like the OpenAI key
  // for Whisper), so calling the API from the browser exposes it to no one else.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** Maps an API failure to an error the UI can show; AppErrors pass through. */
function toAppError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError('aiBadKey', 'The Anthropic API key was rejected. Check it in Settings.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError('aiRateLimited', 'Too many AI requests right now. Try again in a minute.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError('aiNetwork', 'Could not reach the AI service. Check your connection.');
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError('aiFailed', `AI parsing failed: ${err.message}`, { detail: err.message });
  }
  return err;
}

function checkStopReason(stopReason: string | null) {
  if (stopReason === 'refusal') {
    throw new AppError('aiRefused', 'The AI declined to parse this script.');
  }
  if (stopReason === 'max_tokens') {
    throw new AppError('aiTooLong', 'This script is too long to parse with AI in one go.');
  }
}

export async function parseScriptWithAI(
  rawText: string,
  apiKey: string,
  { model = AI_PARSER_MODEL, effort = 'low', onProgress, knownCharacters = [], pdf }: AiParseOptions = {}
): Promise<ParseResult> {
  const client = createClient(apiKey);
  const lines = sourceLines(rawText);
  if (lines.length === 0) {
    throw new AppError('noLinesDetected', 'No lines could be detected in this script.');
  }
  const prompt =
    (pdf ? PDF_CONTEXT_NOTE : '') + formatKnownCharacters(knownCharacters) + formatNumberedLines(lines);

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
      messages: [
        {
          role: 'user',
          content: pdf
            ? [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: toBase64(new Uint8Array(pdf)) }
                },
                { type: 'text', text: prompt }
              ]
            : prompt
        }
      ]
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

    checkStopReason(message.stop_reason);
    if (!message.parsed_output) {
      throw new AppError('aiInvalidResponse', 'The AI returned an unusable result.', {
        detail: 'no structured output'
      });
    }
    return buildParseResult(lines, message.parsed_output);
  } catch (err) {
    throw toAppError(err);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks: spreading a whole multi-megabyte array into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
