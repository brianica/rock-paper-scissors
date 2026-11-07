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
    const opts = { seed: 1, rounds: 50, noiseRate: 0.1, out: "eval/out" };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === "--seed") {
            opts.seed = readUint32(flag, argv[++i]);
        } else if (flag === "--rounds") {
            opts.rounds = readPositiveInt(flag, argv[++i]);
        } else if (flag === "--noise") {
            opts.noiseRate = readUnit(flag, argv[++i]);
        } else if (flag === "--out") {
            opts.out = readValue(flag, argv[++i]);
        } else {
            fail(`Unknown argument ${flag}`);
        }
    }
    return opts;
}

function caseSeed(seed, expertIndex, modeIndex, stream) {
    let x = seed >>> 0;
    x ^= Math.imul(expertIndex + 1, 0x9e3779b1);
    x ^= Math.imul(modeIndex + 1, 0x85ebca6b);
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

function runCase(expertIndex, expertName, mode, modeIndex, opts) {
    const agent = new MetaBanditAgent({
        random: createRng(caseSeed(opts.seed, expertIndex, modeIndex, 0)),
        log() {},
    });
    const oracle = createBaseExperts(createRng(caseSeed(opts.seed, expertIndex, modeIndex, 1)))[expertIndex];
    const scriptRng = createRng(caseSeed(opts.seed, expertIndex, modeIndex, 2));
    let tally = emptyTally();
    for (let round = 0; round < opts.rounds; round++) {
        const human = humanMove(mode, oracle, opts.noiseRate, scriptRng);
        const agentMove = agent.act();
        tally = recordOutcome(tally, resolveRound(human, agentMove));
        agent.update(human, agentMove);
        if (mode.name !== "random") updateExpert(oracle, human, agentMove);
    }
    return {
        id: `${expertName}:${mode.name}`,
        expertName,
        mode: mode.name,
        seed: opts.seed,
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

export function buildReport(opts) {
    const experts = createBaseExperts(() => 0).map((expert) => expert.name());
    const cases = [];
    experts.forEach((expertName, expertIndex) => {
        MODES.forEach((mode, modeIndex) => {
            cases.push(runCase(expertIndex, expertName, mode, modeIndex, opts));
        });
    });
    const overall = cases.reduce((sum, item) => addTally(sum, item.score), emptyTally());
    return {
        spec: {
            seed: opts.seed,
            rounds: opts.rounds,
            noiseRate: opts.noiseRate,
            experts,
            modes: MODES.map((mode) => mode.name),
        },
        overall,
        byExpert: groupTallies(cases, (item) => item.expertName),
        byMode: groupTallies(cases, (item) => item.mode),
        cases,
    };
}

function rateText(rate) {
    return rate === null ? "n/a" : String(rate);
}

function scoreTable(groups) {
    const lines = [
        "| Name | Win rate | Agent wins | Human wins | Ties | Decisive rounds | Rounds |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const [name, score] of Object.entries(groups)) {
        lines.push(`| ${name} | ${rateText(score.winRate)} | ${score.agentWins} | ${score.humanWins} | ${score.ties} | ${score.decisiveRounds} | ${score.rounds} |`);
    }
    return lines.join("\n");
}

function caseTable(cases) {
    const lines = [
        "| Case | Expert | Mode | Win rate | Agent wins | Human wins | Ties | Decisive rounds | Rounds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const item of cases) {
        const score = item.score;
        lines.push(`| ${item.id} | ${item.expertName} | ${item.mode} | ${rateText(score.winRate)} | ${score.agentWins} | ${score.humanWins} | ${score.ties} | ${score.decisiveRounds} | ${score.rounds} |`);
    }
    return lines.join("\n");
}

function renderMarkdown(report) {
    const spec = report.spec;
    return [
        "# RPS eval report",
        "",
        `This run used seed ${spec.seed}, ${spec.rounds} rounds, and noise ${spec.noiseRate}.`,
        "Noise is the chance that a noisy opponent plays a move other than its prediction.",
        "Win rate is agent wins divided by decisive rounds. Ties stay out of that ratio.",
        "",
        "## Overall",
        "",
        `Agent win rate is ${rateText(report.overall.winRate)}. Agent wins ${report.overall.agentWins}. Human wins ${report.overall.humanWins}. Ties ${report.overall.ties}. Decisive rounds ${report.overall.decisiveRounds}. Rounds ${report.overall.rounds}.`,
        "",
        "## By expert",
        "",
        scoreTable(report.byExpert),
        "",
        "## By mode",
        "",
        scoreTable(report.byMode),
        "",
        "## Cases",
        "",
        caseTable(report.cases),
        "",
    ].join("\n");
}

export function overallLine(report) {
    const score = report.overall;
    const rate = score.winRate === null ? "null" : String(score.winRate);
    return `overall winRate=${rate} agentWins=${score.agentWins} humanWins=${score.humanWins} ties=${score.ties} decisiveRounds=${score.decisiveRounds} rounds=${score.rounds}`;
}

function writeReport(opts, report) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(opts.out, "report.md"), renderMarkdown(report));
}

function main(argv) {
    const opts = parseArgs(argv);
    const report = buildReport(opts);
    writeReport(opts, report);
    console.log(overallLine(report));
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
