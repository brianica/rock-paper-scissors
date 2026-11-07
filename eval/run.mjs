import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    createRng,
    createBaseExperts,
    MetaBanditAgent,
    updateExpert,
    resolveRound,
    emptyTally,
    recordOutcome,
    addTally,
} from "../rps-core.mjs";

const MODES = [
    {
        name: "perfect",
        apply(prediction, _noiseRate, _rng) {
            return prediction;
        },
    },
    {
        name: "noisy",
        apply(prediction, noiseRate, rng) {
            if (rng() >= noiseRate) return prediction;
            return (prediction + 1 + Math.floor(rng() * 2)) % 3;
        },
    },
    {
        name: "random",
        apply(_prediction, _noiseRate, rng) {
            return Math.floor(rng() * 3);
        },
    },
];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function readValue(flag, value) {
    if (value === undefined || value.startsWith("--")) fail(`${flag} needs a value`);
    return value;
}

function readUint32(flag, value) {
    const text = readValue(flag, value);
    if (!/^\d+$/.test(text)) fail(`${flag} must be an integer from 0 to 4294967295`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number > 0xffffffff) {
        fail(`${flag} must be an integer from 0 to 4294967295`);
    }
    return number;
}

function readPositiveInt(flag, value) {
    const text = readValue(flag, value);
    if (!/^[1-9]\d*$/.test(text)) fail(`${flag} must be a positive integer`);
    const number = Number(text);
    if (!Number.isSafeInteger(number)) fail(`${flag} must be a positive integer`);
    return number;
}

function readUnit(flag, value) {
    const text = readValue(flag, value);
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0 || number > 1) {
        fail(`${flag} must be a number from 0 to 1`);
    }
    return number;
}

export function parseArgs(argv) {
    const opts = { seed: 1, rounds: 50, noiseRate: 0.1, samples: 10, out: "eval/out" };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === "--seed") {
            opts.seed = readUint32(flag, argv[++i]);
        } else if (flag === "--rounds") {
            opts.rounds = readPositiveInt(flag, argv[++i]);
        } else if (flag === "--noise") {
            opts.noiseRate = readUnit(flag, argv[++i]);
        } else if (flag === "--samples") {
            opts.samples = readPositiveInt(flag, argv[++i]);
        } else if (flag === "--out") {
            opts.out = readValue(flag, argv[++i]);
        } else {
            fail(`Unknown argument ${flag}`);
        }
    }
    return opts;
}

function caseSeed(seed, expertIndex, modeIndex, sampleIndex, stream) {
    let x = seed >>> 0;
    x ^= Math.imul(expertIndex + 1, 0x9e3779b1);
    x ^= Math.imul(modeIndex + 1, 0x85ebca6b);
    x ^= Math.imul(sampleIndex + 1, 0x27d4eb2d);
    x ^= Math.imul(stream + 1, 0xc2b2ae35);
    x >>>= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}

function humanMove(mode, oracle, noiseRate, rng) {
    if (mode.name === "random") return mode.apply(0, noiseRate, rng);
    return mode.apply(oracle.get_prediction(), noiseRate, rng);
}

function runCase(expertIndex, expertName, mode, modeIndex, sampleIndex, opts) {
    const agent = new MetaBanditAgent({
        random: createRng(caseSeed(opts.seed, expertIndex, modeIndex, sampleIndex, 0)),
        log() {},
    });
    const oracle = createBaseExperts(
        createRng(caseSeed(opts.seed, expertIndex, modeIndex, sampleIndex, 1))
    )[expertIndex];
    const scriptRng = createRng(caseSeed(opts.seed, expertIndex, modeIndex, sampleIndex, 2));
    let tally = emptyTally();
    for (let round = 0; round < opts.rounds; round++) {
        const human = humanMove(mode, oracle, opts.noiseRate, scriptRng);
        const agentMove = agent.act();
        tally = recordOutcome(tally, resolveRound(human, agentMove));
        agent.update(human, agentMove);
        if (mode.name !== "random") updateExpert(oracle, human, agentMove);
    }
    return {
        id: `${expertName}:${mode.name}:${sampleIndex}`,
        expertName,
        mode: mode.name,
        sampleIndex,
        cell: `${expertName}:${mode.name}`,
        seed: caseSeed(opts.seed, expertIndex, modeIndex, sampleIndex, 0),
        score: tally,
    };
}

function groupTallies(cases, keyFn) {
    const grouped = {};
    for (const item of cases) {
        const key = keyFn(item);
        grouped[key] = grouped[key]
            ? addTally(grouped[key], item.score)
            : addTally(emptyTally(), item.score);
    }
    return grouped;
}

function mean(values) {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdev(values) {
    if (values.length < 2) return null;
    const avg = mean(values);
    const variance =
        values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function summarizeGroup(cases) {
    const pooled = cases.reduce((sum, item) => addTally(sum, item.score), emptyTally());
    const rates = cases
        .map((item) => item.score.winRate)
        .filter((rate) => rate !== null);
    return {
        ...pooled,
        samples: cases.length,
        meanWinRate: mean(rates),
        stdevWinRate: sampleStdev(rates),
    };
}

function groupSummaries(cases, keyFn) {
    const buckets = {};
    for (const item of cases) {
        const key = keyFn(item);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(item);
    }
    const grouped = {};
    for (const [key, items] of Object.entries(buckets)) {
        grouped[key] = summarizeGroup(items);
    }
    return grouped;
}

export function buildReport(opts) {
    const experts = createBaseExperts(() => 0).map((expert) => expert.name());
    const cases = [];
    experts.forEach((expertName, expertIndex) => {
        MODES.forEach((mode, modeIndex) => {
            for (let sampleIndex = 0; sampleIndex < opts.samples; sampleIndex++) {
                cases.push(runCase(expertIndex, expertName, mode, modeIndex, sampleIndex, opts));
            }
        });
    });
    const overall = summarizeGroup(cases);
    return {
        spec: {
            seed: opts.seed,
            rounds: opts.rounds,
            noiseRate: opts.noiseRate,
            samples: opts.samples,
            experts,
            modes: MODES.map((mode) => mode.name),
        },
        overall,
        byExpert: groupSummaries(cases, (item) => item.expertName),
        byMode: groupSummaries(cases, (item) => item.mode),
        byCell: groupSummaries(cases, (item) => item.cell),
        cases,
    };
}

function rateText(rate) {
    return rate === null || rate === undefined ? "n/a" : String(rate);
}

function meanText(score) {
    if (score.meanWinRate === null || score.meanWinRate === undefined) return "n/a";
    if (score.stdevWinRate === null || score.stdevWinRate === undefined) {
        return rateText(score.meanWinRate);
    }
    return `${rateText(score.meanWinRate)} ± ${rateText(score.stdevWinRate)}`;
}

function scoreTable(groups) {
    const lines = [
        "| Name | Mean win rate | Pooled win rate | Samples | Agent wins | Human wins | Ties | Decisive rounds | Rounds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const [name, score] of Object.entries(groups)) {
        lines.push(
            `| ${name} | ${meanText(score)} | ${rateText(score.winRate)} | ${score.samples} | ${score.agentWins} | ${score.humanWins} | ${score.ties} | ${score.decisiveRounds} | ${score.rounds} |`
        );
    }
    return lines.join("\n");
}

function caseTable(cases) {
    const lines = [
        "| Case | Expert | Mode | Sample | Win rate | Agent wins | Human wins | Ties | Decisive rounds | Rounds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const item of cases) {
        const score = item.score;
        lines.push(
            `| ${item.id} | ${item.expertName} | ${item.mode} | ${item.sampleIndex} | ${rateText(score.winRate)} | ${score.agentWins} | ${score.humanWins} | ${score.ties} | ${score.decisiveRounds} | ${score.rounds} |`
        );
    }
    return lines.join("\n");
}

function renderMarkdown(report) {
    const spec = report.spec;
    return [
        "# RPS eval report",
        "",
        `This run used seed ${spec.seed}, ${spec.rounds} rounds, noise ${spec.noiseRate}, and ${spec.samples} samples per expert×mode.`,
        "Noise is the chance that a noisy opponent plays a move other than its prediction.",
        "Mean win rate averages the sample win rates. Pooled win rate is total agent wins over total decisive rounds. Ties stay out of both ratios.",
        "",
        "## Overall",
        "",
        `Mean win rate is ${meanText(report.overall)}. Pooled win rate is ${rateText(report.overall.winRate)}. Samples ${report.overall.samples}. Agent wins ${report.overall.agentWins}. Human wins ${report.overall.humanWins}. Ties ${report.overall.ties}. Decisive rounds ${report.overall.decisiveRounds}. Rounds ${report.overall.rounds}.`,
        "",
        "## By expert",
        "",
        scoreTable(report.byExpert),
        "",
        "## By mode",
        "",
        scoreTable(report.byMode),
        "",
        "## By expert × mode",
        "",
        scoreTable(report.byCell),
        "",
        "## Cases",
        "",
        caseTable(report.cases),
        "",
    ].join("\n");
}

function pct(winRate) {
    if (winRate === null || winRate === undefined) return "n/a";
    return `${(winRate * 100).toFixed(1)}%`;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function htmlScoreRows(map) {
    return Object.entries(map)
        .map(([name, score]) => {
            const focus = score.meanWinRate ?? score.winRate;
            const width = focus === null ? 0 : Math.round(focus * 100);
            const meanLabel =
                score.stdevWinRate === null || score.stdevWinRate === undefined
                    ? pct(score.meanWinRate)
                    : `${pct(score.meanWinRate)} ± ${(score.stdevWinRate * 100).toFixed(1)}%`;
            return `<tr>
  <td>${escapeHtml(name)}</td>
  <td class="rate">${meanLabel}</td>
  <td class="rate">${pct(score.winRate)}</td>
  <td><div class="bar" style="width:${width}%"></div></td>
  <td>${score.samples}</td>
  <td>${score.agentWins}</td>
  <td>${score.humanWins}</td>
  <td>${score.ties}</td>
  <td>${score.decisiveRounds}</td>
  <td>${score.rounds}</td>
</tr>`;
        })
        .join("\n");
}

function htmlCaseRows(cases) {
    return cases
        .map((item) => {
            const score = item.score;
            return `<tr data-expert="${escapeHtml(item.expertName)}" data-mode="${escapeHtml(item.mode)}">
  <td>${escapeHtml(item.id)}</td>
  <td>${escapeHtml(item.expertName)}</td>
  <td>${escapeHtml(item.mode)}</td>
  <td>${item.sampleIndex}</td>
  <td class="rate">${pct(score.winRate)}</td>
  <td>${score.agentWins}</td>
  <td>${score.humanWins}</td>
  <td>${score.ties}</td>
  <td>${score.decisiveRounds}</td>
  <td>${score.rounds}</td>
  <td><code>${item.seed}</code></td>
</tr>`;
        })
        .join("\n");
}

function renderHtml(report) {
    const spec = report.spec;
    const overall = report.overall;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RPS eval report (seed ${escapeHtml(spec.seed)})</title>
  <style>
    :root {
      --ink: #1a1f16;
      --muted: #5c6754;
      --paper: #f4f1ea;
      --card: #fffdf8;
      --line: #d9d2c4;
      --accent: #2f6f4e;
      --bar: #3d8b63;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 15px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #e8f0e4 0, transparent 40%),
        linear-gradient(180deg, #f7f4ee, var(--paper));
      padding: 32px 20px 64px;
    }
    main { max-width: 1100px; margin: 0 auto; }
    h1, h2 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; }
    h1 { font-size: 2rem; margin: 0 0 8px; }
    h2 { font-size: 1.35rem; margin: 36px 0 12px; }
    .lede, .note { color: var(--muted); max-width: 62ch; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin: 20px 0 8px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .card .label { color: var(--muted); font-size: 0.85rem; }
    .card .value { font-size: 1.45rem; font-weight: 650; margin-top: 4px; }
    .card.accent .value { color: var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: middle;
    }
    th {
      font-size: 0.8rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--muted);
      background: #f0ebe2;
    }
    tr:last-child td { border-bottom: 0; }
    td.rate { font-variant-numeric: tabular-nums; font-weight: 650; }
    .bar {
      height: 10px;
      background: var(--bar);
      border-radius: 999px;
      min-width: 2px;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 0 12px;
      align-items: end;
    }
    label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--muted); }
    select {
      font: inherit;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      min-width: 160px;
    }
    code { font-size: 0.85em; }
  </style>
</head>
<body>
  <main>
    <h1>RPS eval report</h1>
    <p class="lede">
      Seed ${escapeHtml(spec.seed)}, ${escapeHtml(spec.rounds)} rounds per sample,
      ${escapeHtml(spec.samples)} samples per expert×mode, noise ${escapeHtml(spec.noiseRate)}.
      Mean win rate averages sample rates. Pooled win rate is total agent wins over decisive rounds (ties excluded).
    </p>

    <div class="cards">
      <div class="card accent">
        <div class="label">Mean AI win rate</div>
        <div class="value">${pct(overall.meanWinRate)}</div>
      </div>
      <div class="card">
        <div class="label">Pooled AI win rate</div>
        <div class="value">${pct(overall.winRate)}</div>
      </div>
      <div class="card">
        <div class="label">Samples</div>
        <div class="value">${overall.samples}</div>
      </div>
      <div class="card">
        <div class="label">Agent wins</div>
        <div class="value">${overall.agentWins}</div>
      </div>
      <div class="card">
        <div class="label">Human wins</div>
        <div class="value">${overall.humanWins}</div>
      </div>
      <div class="card">
        <div class="label">Ties</div>
        <div class="value">${overall.ties}</div>
      </div>
    </div>

    <h2>By expert type</h2>
    <p class="note">Each expert has ${escapeHtml(spec.samples)} samples × 3 modes = ${escapeHtml(spec.samples * 3)} samples (${escapeHtml(spec.samples * 3 * spec.rounds)} rounds).</p>
    <table>
      <thead>
        <tr>
          <th>Expert</th><th>Mean ± stdev</th><th>Pooled</th><th></th>
          <th>Samples</th><th>AI</th><th>Human</th><th>Ties</th><th>Decisive</th><th>Rounds</th>
        </tr>
      </thead>
      <tbody>
${htmlScoreRows(report.byExpert)}
      </tbody>
    </table>

    <h2>By mode</h2>
    <table>
      <thead>
        <tr>
          <th>Mode</th><th>Mean ± stdev</th><th>Pooled</th><th></th>
          <th>Samples</th><th>AI</th><th>Human</th><th>Ties</th><th>Decisive</th><th>Rounds</th>
        </tr>
      </thead>
      <tbody>
${htmlScoreRows(report.byMode)}
      </tbody>
    </table>

    <h2>By expert × mode</h2>
    <p class="note">Mean over ${escapeHtml(spec.samples)} independent samples for each cell.</p>
    <table>
      <thead>
        <tr>
          <th>Cell</th><th>Mean ± stdev</th><th>Pooled</th><th></th>
          <th>Samples</th><th>AI</th><th>Human</th><th>Ties</th><th>Decisive</th><th>Rounds</th>
        </tr>
      </thead>
      <tbody>
${htmlScoreRows(report.byCell)}
      </tbody>
    </table>

    <h2>All samples (cases)</h2>
    <p class="note">One row per expert × mode × sample. Filter to inspect a single expert or mode.</p>
    <div class="filters">
      <label>Expert
        <select id="expert-filter">
          <option value="">All experts</option>
${Object.keys(report.byExpert).map((name) => `          <option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("\n")}
        </select>
      </label>
      <label>Mode
        <select id="mode-filter">
          <option value="">All modes</option>
          <option value="perfect">perfect</option>
          <option value="noisy">noisy</option>
          <option value="random">random</option>
        </select>
      </label>
    </div>
    <table>
      <thead>
        <tr>
          <th>Case</th><th>Expert</th><th>Mode</th><th>Sample</th><th>Win rate</th>
          <th>AI</th><th>Human</th><th>Ties</th><th>Decisive</th><th>Rounds</th><th>Seed</th>
        </tr>
      </thead>
      <tbody id="case-rows">
${htmlCaseRows(report.cases)}
      </tbody>
    </table>
  </main>
  <script>
    const expertFilter = document.getElementById("expert-filter");
    const modeFilter = document.getElementById("mode-filter");
    const rows = [...document.querySelectorAll("#case-rows tr")];
    function applyFilters() {
      const expert = expertFilter.value;
      const mode = modeFilter.value;
      for (const row of rows) {
        const okExpert = !expert || row.dataset.expert === expert;
        const okMode = !mode || row.dataset.mode === mode;
        row.hidden = !(okExpert && okMode);
      }
    }
    expertFilter.addEventListener("change", applyFilters);
    modeFilter.addEventListener("change", applyFilters);
  </script>
</body>
</html>
`;
}

export function overallLine(report) {
    const score = report.overall;
    const pooled = score.winRate === null ? "null" : String(score.winRate);
    const meanRate = score.meanWinRate === null ? "null" : String(score.meanWinRate);
    return `overall meanWinRate=${meanRate} pooledWinRate=${pooled} samples=${score.samples} agentWins=${score.agentWins} humanWins=${score.humanWins} ties=${score.ties} decisiveRounds=${score.decisiveRounds} rounds=${score.rounds}`;
}

function writeReport(opts, report) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(opts.out, "report.md"), renderMarkdown(report));
    fs.writeFileSync(path.join(opts.out, "report.html"), renderHtml(report));
}

function main(argv) {
    const opts = parseArgs(argv);
    const report = buildReport(opts);
    writeReport(opts, report);
    console.log(overallLine(report));
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
