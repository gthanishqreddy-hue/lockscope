import { describe, expect, it } from 'vitest';
import { parseResultFile, parseResultText, SchemaError } from '../schemas/results';
import { comparabilityIssues } from '../utils/compare';
import { csvField, toCsv } from '../utils/csv';
import { escapeHtml, lineOption, type ChartTheme } from '../components/chartOptions';
import {
  benchmarkCommand,
  benchmarkPayload,
  correctnessCommand,
  estimateSeconds,
  parseThreadCounts,
  validateBenchmark,
  validateCorrectness,
} from '../utils/experimentForms';
import { efficiency, intervalsOverlap, interpret, scalingSeries, speedup } from '../utils/scaling';
import { shouldAutoDetectEngine, validateEngineUrl } from '../services/engineClient';
import { defaultBenchmarkForm, defaultCorrectnessForm } from '../features/ExperimentForms';
import { benchmarkReport, correctnessReport, measurement } from './fixtures';

describe('scaling math', () => {
  it('computes speedup and efficiency from throughput', () => {
    expect(speedup(10, 30)).toBe(3);
    expect(efficiency(3, 4)).toBe(0.75);
  });

  it('returns null instead of 0 or NaN for undefined values', () => {
    expect(speedup(0, 10)).toBeNull();
    expect(speedup(Number.NaN, 10)).toBeNull();
    expect(speedup(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(efficiency(null, 4)).toBeNull();
    expect(efficiency(2, 0)).toBeNull();
  });

  it('needs a single-thread baseline', () => {
    const points = scalingSeries([measurement('tas', 4, 10), measurement('tas', 2, 20)]);
    expect(points.map((p) => p.threads)).toEqual([2, 4]);
    expect(points.every((p) => p.speedup === null)).toBe(true);
  });

  it('sorts and derives a series', () => {
    const points = scalingSeries([measurement('x', 4, 20), measurement('x', 1, 10)]);
    expect(points[1]).toMatchObject({ threads: 4, speedup: 2, efficiency: 0.5 });
  });

  it('treats overlapping intervals as indistinguishable', () => {
    expect(intervalsOverlap(measurement('a', 1, 10, 1), measurement('b', 1, 10.5, 1))).toBe(true);
    expect(intervalsOverlap(measurement('a', 1, 10, 0.1), measurement('b', 1, 20, 0.1))).toBe(false);
  });

  it('interprets cautiously', () => {
    const notes = interpret(benchmarkReport(), (id) => id.toUpperCase());
    expect(notes.some((n) => n.text.includes('MCS had the highest measured throughput'))).toBe(true);
    expect(notes.some((n) => n.text.includes('TAS lost throughput'))).toBe(true);
    expect(notes.every((n) => !/significan/i.test(n.text))).toBe(true);
  });

  it('flags ties when intervals overlap', () => {
    const r = benchmarkReport({ measurements: [measurement('tas', 4, 10, 2), measurement('mcs', 4, 11, 2)] });
    expect(interpret(r, (id) => id)[0]?.kind).toBe('caution');
  });
});

describe('result schema validation', () => {
  it('accepts valid reports', () => {
    expect(parseResultFile(JSON.parse(JSON.stringify(benchmarkReport()))).id).toBe(
      'bench-20261030T000000Z-abcdef',
    );
    expect(parseResultFile(JSON.parse(JSON.stringify(correctnessReport()))).schema).toBe(
      'lockscope.correctness/v1',
    );
  });

  it('rejects other files with a path to the problem', () => {
    expect(() => parseResultText('not json')).toThrow(SchemaError);
    expect(() => parseResultFile({ schema: 'something-else' })).toThrow(/not a LockScope result file/);
    const broken = JSON.parse(JSON.stringify(benchmarkReport()));
    broken.measurements[1].score = 'fast';
    expect(() => parseResultFile(broken)).toThrow('measurements[1].score: expected a number');
    const badOrigin = { ...benchmarkReport(), origin: 'live' };
    expect(() => parseResultFile(badOrigin)).toThrow(/origin/);
  });

  it('rejects oversized input', () => {
    expect(() => parseResultText(' '.repeat(10 * 1024 * 1024 + 1))).toThrow(/10 MB/);
  });
});

describe('comparability', () => {
  it('accepts identical setups', () => {
    expect(comparabilityIssues([benchmarkReport(), benchmarkReport()])).toEqual([]);
  });

  it('blocks different workloads and modes, warns on environment', () => {
    const a = benchmarkReport();
    const b = benchmarkReport({
      workload: { ...a.workload, criticalWork: 500 },
      environment: { ...a.environment, availableProcessors: 16 },
    });
    const issues = comparabilityIssues([a, b]);
    expect(issues.find((i) => i.severity === 'blocking')?.message).toMatch(/critical work 500 vs 10/);
    expect(issues.find((i) => i.severity === 'warning')?.message).toMatch(/16 vs 8 CPUs/);
    const c = benchmarkReport({ methodology: { ...a.methodology, mode: 'sample', scoreUnit: 'ns/op' } });
    expect(comparabilityIssues([a, c])[0]?.severity).toBe('blocking');
  });
});

describe('csv and html escaping', () => {
  it('escapes per RFC 4180 and neutralizes formulas', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField(-3)).toBe('-3');
    expect(csvField(null)).toBe('');
    expect(csvField(Number.NaN)).toBe('');
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x' }])).toBe('a,b\n1,x\n');
  });

  it('leaves chart accessibility labels to the page, not ECharts', () => {
    const theme: ChartTheme = {
      text: '',
      textSecondary: '',
      muted: '',
      grid: '',
      axis: '',
      surface: '',
      border: '',
      series: [],
      ordinal: [],
    };
    const option = lineOption(theme, [], { xName: 'Threads', yName: 'ops' }) as {
      aria: { enabled: boolean };
    };
    expect(option.aria.enabled).toBe(false);
  });

  it('escapes HTML in chart tooltips', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('experiment forms', () => {
  it('parses thread counts strictly', () => {
    expect(parseThreadCounts('4, 1,2,2')).toEqual([1, 2, 4]);
    expect(parseThreadCounts('')).toBeNull();
    expect(parseThreadCounts('1,x')).toBeNull();
    expect(parseThreadCounts('0')).toBeNull();
    expect(parseThreadCounts('1.5')).toBeNull();
    expect(parseThreadCounts('1000')).toBeNull();
  });

  it('validates benchmark forms', () => {
    const form = defaultBenchmarkForm('lock');
    expect(validateBenchmark(form)).toEqual({});
    expect(validateBenchmark({ ...form, algorithms: [] }).algorithms).toBeDefined();
    expect(validateBenchmark({ ...form, forks: 9 }).forks).toBeDefined();
    expect(validateBenchmark({ ...form, warmupMillis: 50 }).warmupMillis).toBeDefined();
    expect(validateBenchmark({ ...form, criticalWork: Number.NaN }).criticalWork).toBeDefined();
    const huge = {
      ...form,
      forks: 5,
      measurementIterations: 50,
      warmupIterations: 50,
      warmupMillis: 10000,
      measurementMillis: 10000,
    };
    expect(validateBenchmark(huge).measurementIterations).toMatch(/4 hours/);
  });

  it('estimates duration like the engine', () => {
    const form = {
      ...defaultBenchmarkForm('lock', ['tas']),
      threadCounts: '1,2',
      forks: 1,
      warmupIterations: 1,
      warmupMillis: 1000,
      measurementIterations: 1,
      measurementMillis: 1000,
    };
    expect(estimateSeconds(form)).toBe(7);
  });

  it('builds payloads and equivalent CLI commands', () => {
    const form = { ...defaultBenchmarkForm('set', ['lazy']), threadCounts: '2,1' };
    const payload = benchmarkPayload(form) as {
      benchmark: { threadCounts: number[]; criticalWork?: number };
    };
    expect(payload.benchmark.threadCounts).toEqual([1, 2]);
    expect(payload.benchmark.criticalWork).toBeUndefined();
    expect(benchmarkCommand(form)).toContain('--kind set');
    expect(benchmarkCommand(form)).toContain('--threads 1,2');
    expect(correctnessCommand(defaultCorrectnessForm('locks', ['tas']))).toContain('--algorithms tas');
  });

  it('validates correctness forms', () => {
    expect(validateCorrectness(defaultCorrectnessForm('sets'))).toEqual({});
    expect(validateCorrectness({ ...defaultCorrectnessForm('sets'), threads: 64 }).threads).toMatch(/32/);
    expect(validateCorrectness({ ...defaultCorrectnessForm('locks'), runs: 0 }).runs).toBeDefined();
  });
});

describe('engine auto-detection', () => {
  it('probes automatically only when served locally or after an opt-in', () => {
    expect(shouldAutoDetectEngine('localhost', false)).toBe(true);
    expect(shouldAutoDetectEngine('127.0.0.1', false)).toBe(true);
    expect(shouldAutoDetectEngine('gthanishqreddy-hue.github.io', false)).toBe(false);
    expect(shouldAutoDetectEngine('gthanishqreddy-hue.github.io', true)).toBe(true);
  });
});

describe('engine URL validation', () => {
  it('only allows loopback origins', () => {
    expect(validateEngineUrl('http://127.0.0.1:8787')).toBeNull();
    expect(validateEngineUrl('http://localhost:9000')).toBeNull();
    expect(validateEngineUrl('https://example.com')).toMatch(/this computer/);
    expect(validateEngineUrl('ftp://127.0.0.1')).toMatch(/http/);
    expect(validateEngineUrl('http://127.0.0.1:8787/api')).toMatch(/path/);
    expect(validateEngineUrl('nonsense')).toMatch(/full URL/);
  });
});
