/**
 * Compares script parsers on the hand-labelled fixtures.
 *
 *   npm run eval:parser                 heuristic parser only (free, offline)
 *   npm run eval:parser -- --ai         also Claude, using ANTHROPIC_API_KEY (costs money)
 *   npm run eval:parser -- --ai --model claude-sonnet-5-5 --effort medium
 *   npm run eval:parser -- --verbose    list the entries each parser missed
 */
import { parseScript } from '../src/lib/scriptParser';
import { parseScriptWithAI, AI_PARSER_MODEL } from '../src/lib/aiParser';
import type { ScriptEntry } from '../src/types';
import { fixtures } from './fixtures';
import { scoreParse, missedEntries, type Score } from './score';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const useAi = flag('--ai');
const verbose = flag('--verbose');
const model = option('--model') ?? AI_PARSER_MODEL;
const effort = (option('--effort') ?? 'low') as 'low' | 'medium' | 'high';
const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

if (useAi && !apiKey) {
  console.error('--ai needs ANTHROPIC_API_KEY set in the environment.');
  process.exit(1);
}

type Parser = { name: string; parse: (source: string) => Promise<ScriptEntry[]> };

const parsers: Parser[] = [
  { name: 'heuristic', parse: async (source) => parseScript(source).entries }
];
if (useAi) {
  parsers.push({
    name: `AI (${model}, ${effort})`,
    parse: async (source) => (await parseScriptWithAI(source, apiKey, { model, effort })).entries
  });
}

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(5);

for (const parser of parsers) {
  console.log(`\n${parser.name}`);
  const totals = { matched: 0, expected: 0, produced: 0 };
  for (const fixture of fixtures) {
    let score: Score;
    let produced: ScriptEntry[] = [];
    const started = Date.now();
    try {
      produced = await parser.parse(fixture.source);
      score = scoreParse(fixture.expected, produced);
    } catch (err) {
      console.log(`  ${fixture.name}: FAILED - ${err instanceof Error ? err.message : String(err)}`);
      totals.expected += fixture.expected.length;
      continue;
    }
    totals.matched += score.matched;
    totals.expected += score.expected;
    totals.produced += score.produced;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  ${pct(score.recall)} recall ${pct(score.precision)} precision  ` +
        `(${score.matched}/${score.expected} right, ${score.produced} produced, ${seconds}s)  ${fixture.name}`
    );
    if (verbose) {
      for (const miss of missedEntries(fixture.expected, produced)) console.log(`      missed: ${miss}`);
    }
  }
  const recall = totals.expected ? totals.matched / totals.expected : 0;
  const precision = totals.produced ? totals.matched / totals.produced : 0;
  console.log(`  ${pct(recall)} recall ${pct(precision)} precision  overall`);
}
