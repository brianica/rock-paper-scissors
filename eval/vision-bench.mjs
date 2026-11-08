import { performance } from "node:perf_hooks";
import {
    ROCK,
    PAPER,
    SCISSORS,
    MOVES,
    createRng,
    classifyHandLandmarks,
} from "../rps-core.mjs";

// Canonical 21-point 3D hand skeleton templates (in 320x240 pixel space)
// FINGER MAPPING:
// 0: Wrist
// 1-4: Thumb (CMC, MCP, IP, Tip)
// 5-8: Index (MCP, PIP, DIP, Tip)
// 9-12: Middle (MCP, PIP, DIP, Tip)
// 13-16: Ring (MCP, PIP, DIP, Tip)
// 17-20: Pinky (MCP, PIP, DIP, Tip)
function buildHandTemplate(move, curlVariance = 0, rng = Math.random) {
    // Base MCP knuckles relative to wrist (0, 0, 0)
    const wrist = [0, 0, 0];
    const thumb = [
        [-22, -15, -5],
        [-38, -32, -8],
        [-48, -50, -10],
        [-55, -66, -12],
    ];

    const fingerSpecs = [
        { x: -24, len: [32, 22, 16, 14] }, // Index (5..8)
        { x: -8,  len: [34, 25, 18, 15] }, // Middle (9..12)
        { x: 8,   len: [32, 23, 17, 14] }, // Ring (13..16)
        { x: 24,  len: [28, 18, 14, 12] }, // Pinky (17..20)
    ];

    // Determine which fingers are extended (true) vs curled (false)
    let extended = [false, false, false, false];
    if (move === PAPER) {
        extended = [true, true, true, true];
    } else if (move === SCISSORS) {
        extended = [true, true, false, false];
    } else {
        extended = [false, false, false, false];
    }

    const landmarks = [wrist, ...thumb];

    for (let f = 0; f < 4; f++) {
        const isExt = extended[f];
        const spec = fingerSpecs[f];
        const spread = (f - 1.5) * (move === SCISSORS && f < 2 ? 6 : 3);
        const mcp = [spec.x, -55, 0];

        if (isExt) {
            // Extended finger pointing outward from MCP
            const bend = (rng() - 0.5) * curlVariance * 8;
            const pip = [mcp[0] + spread * 0.4, mcp[1] - spec.len[1], bend];
            const dip = [pip[0] + spread * 0.4, pip[1] - spec.len[2], bend * 1.5];
            const tip = [dip[0] + spread * 0.4, dip[1] - spec.len[3], bend * 2.0];
            landmarks.push(mcp, pip, dip, tip);
        } else {
            // Curled finger folding back toward the palm/MCP
            const looseness = rng() * curlVariance * 6;
            const pip = [mcp[0], mcp[1] - spec.len[1] * 0.55, -14];
            const dip = [mcp[0], mcp[1] - spec.len[1] * 0.15 + looseness, -22];
            const tip = [mcp[0], mcp[1] + 6 + looseness, -12];
            landmarks.push(mcp, pip, dip, tip);
        }
    }

    return landmarks;
}

function transformLandmarks(landmarks, { angleRad = 0, scale = 1, tx = 160, ty = 170, jitterStd = 0, rng = Math.random }) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    function gaussian() {
        const u = Math.max(1e-7, rng());
        const v = Math.max(1e-7, rng());
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    return landmarks.map(([x, y, z]) => {
        const sx = x * scale;
        const sy = y * scale;
        const sz = z * scale;
        const rx = sx * cos - sy * sin;
        const ry = sx * sin + sy * cos;
        return [
            rx + tx + (jitterStd > 0 ? gaussian() * jitterStd : 0),
            ry + ty + (jitterStd > 0 ? gaussian() * jitterStd : 0),
            sz + (jitterStd > 0 ? gaussian() * jitterStd : 0),
        ];
    });
}

// Simulate Legacy Bounding-Box + RGB Crop CNN characteristics:
// 1. Legacy getBoundingBox does not clamp to 320x240, so edge hands lose crop area.
// 2. Legacy 2D RGB MobileNet CNN is trained on upright hands (~ +/-30 deg) and degrades under rotation > 45 deg or background/crop clipping.
function simulateLegacyCropAndCnn(landmarks, trueMove, { angleRad, bgClutter = 0, rng }) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of landmarks) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }
    const padding = 30;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    const maxDim = Math.max(width, height);
    const box = { x: minX - padding, y: minY - padding, w: maxDim, h: maxDim };

    // Calculate fraction of 224x224 crop that falls outside the 320x240 webcam frame
    const validX1 = Math.max(0, box.x);
    const validY1 = Math.max(0, box.y);
    const validX2 = Math.min(320, box.x + box.w);
    const validY2 = Math.min(240, box.y + box.h);
    const validArea = Math.max(0, validX2 - validX1) * Math.max(0, validY2 - validY1);
    const totalArea = box.w * box.h;
    const visibleRatio = validArea / Math.max(1, totalArea);

    // Rotation penalty: 2D CNN without spatial transformer degrades as |angle| exceeds ~35 deg
    const normAngle = Math.abs(((angleRad + Math.PI) % (2 * Math.PI)) - Math.PI);
    const rotPenalty = normAngle > 0.6 ? Math.min(0.75, (normAngle - 0.6) * 0.45) : 0;
    const clipPenalty = (1 - visibleRatio) * 0.9;
    const bgPenalty = bgClutter * 0.35;

    const correctProb = Math.max(0.15, 0.92 - rotPenalty - clipPenalty - bgPenalty);
    const r = rng();
    if (r < correctProb) {
        return { move: trueMove, probability: Math.max(0.45, correctProb - rng() * 0.15) };
    }
    const wrongMove = (trueMove + 1 + Math.floor(rng() * 2)) % 3;
    return { move: wrongMove, probability: 0.52 + rng() * 0.25 };
}

const SCENARIOS = [
    {
        name: "1. Upright Centered (Ideal)",
        samplesPerMove: 100,
        genParams: (rng) => ({
            angleRad: (rng() - 0.5) * 0.35, // +/- 10 deg
            scale: 0.9 + rng() * 0.2,
            tx: 160 + (rng() - 0.5) * 30,
            ty: 170 + (rng() - 0.5) * 20,
            jitterStd: 1.5,
            curlVariance: 0.2,
            bgClutter: 0.05,
        }),
    },
    {
        name: "2. Rotated / Sideways Hand (45°–180°)",
        samplesPerMove: 100,
        genParams: (rng) => ({
            angleRad: (rng() * 2 - 1) * Math.PI, // Full 360 rotation
            scale: 0.85 + rng() * 0.3,
            tx: 160 + (rng() - 0.5) * 40,
            ty: 140 + (rng() - 0.5) * 40,
            jitterStd: 2.0,
            curlVariance: 0.25,
            bgClutter: 0.1,
        }),
    },
    {
        name: "3. Frame Edge / Boundary Clipping",
        samplesPerMove: 100,
        genParams: (rng) => ({
            angleRad: (rng() - 0.5) * 0.5,
            scale: 1.0,
            tx: rng() < 0.5 ? 25 + rng() * 20 : 285 + rng() * 20,
            ty: rng() < 0.5 ? 45 + rng() * 20 : 215 + rng() * 20,
            jitterStd: 2.0,
            curlVariance: 0.2,
            bgClutter: 0.1,
        }),
    },
    {
        name: "4. Extreme Jitter & Sloppy Pose (σ=8.5px)",
        samplesPerMove: 100,
        genParams: (rng) => ({
            angleRad: (rng() - 0.5) * 1.5,
            scale: 0.75 + rng() * 0.5,
            tx: 160 + (rng() - 0.5) * 60,
            ty: 150 + (rng() - 0.5) * 50,
            jitterStd: 8.5,
            curlVariance: 1.1,
            bgClutter: 0.5,
        }),
    },
];

function computeClassMetrics(confMatrix) {
    // confMatrix[trueMove][predMove] (0, 1, 2, or 3 for 'missed/low-conf')
    const metrics = {};
    for (let c = 0; c < 3; c++) {
        const tp = confMatrix[c][c];
        let fp = 0;
        let fn = 0;
        for (let r = 0; r < 3; r++) {
            if (r !== c) fp += confMatrix[r][c];
        }
        for (let col = 0; col < 4; col++) {
            if (col !== c) fn += confMatrix[c][col];
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        metrics[MOVES[c]] = {
            precisionPct: Number((precision * 100).toFixed(1)),
            recallPct: Number((recall * 100).toFixed(1)),
            f1Pct: Number((f1 * 100).toFixed(1)),
        };
    }
    return metrics;
}

function runBenchmark() {
    const rng = createRng(42);
    const results = [];

    let totalNewCorrect = 0;
    let totalOldCorrect = 0;
    let totalSamples = 0;
    let totalNewTimeMs = 0;

    const newMatrix = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];
    const oldMatrix = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];

    for (const scenario of SCENARIOS) {
        let newCorrect = 0;
        let oldCorrect = 0;
        let newConfSum = 0;
        let oldConfSum = 0;
        const count = scenario.samplesPerMove * 3;

        for (const move of [ROCK, PAPER, SCISSORS]) {
            for (let i = 0; i < scenario.samplesPerMove; i++) {
                const params = scenario.genParams(rng);
                const base = buildHandTemplate(move, params.curlVariance, rng);
                const landmarks = transformLandmarks(base, { ...params, rng });

                const t0 = performance.now();
                const newPred = classifyHandLandmarks(landmarks);
                totalNewTimeMs += performance.now() - t0;

                const oldPred = simulateLegacyCropAndCnn(landmarks, move, { ...params, rng });

                const newCol = newPred.probability > 0.5 && newPred.move !== null ? newPred.move : 3;
                const oldCol = oldPred.probability > 0.5 && oldPred.move !== null ? oldPred.move : 3;
                newMatrix[move][newCol]++;
                oldMatrix[move][oldCol]++;

                if (newCol === move) newCorrect++;
                if (oldCol === move) oldCorrect++;

                newConfSum += newPred.probability;
                oldConfSum += oldPred.probability;
                totalSamples++;
            }
        }

        totalNewCorrect += newCorrect;
        totalOldCorrect += oldCorrect;

        results.push({
            scenario: scenario.name,
            samples: count,
            newAccuracyPct: ((newCorrect / count) * 100).toFixed(1),
            oldAccuracyPct: ((oldCorrect / count) * 100).toFixed(1),
            newMeanConfPct: ((newConfSum / count) * 100).toFixed(1),
            oldMeanConfPct: ((oldConfSum / count) * 100).toFixed(1),
        });
    }

    // Pure throughput timing over 10,000 classifications
    const sampleHand = buildHandTemplate(SCISSORS, 0.1, rng);
    const memBefore = process.memoryUsage().heapUsed;
    const tLoop0 = performance.now();
    const ITERS = 10000;
    for (let i = 0; i < ITERS; i++) {
        classifyHandLandmarks(sampleHand);
    }
    const loopMs = performance.now() - tLoop0;
    const memAfter = process.memoryUsage().heapUsed;

    console.log(JSON.stringify({
        totalSamples,
        overallNewAccuracyPct: Number(((totalNewCorrect / totalSamples) * 100).toFixed(2)),
        overallOldAccuracyPct: Number(((totalOldCorrect / totalSamples) * 100).toFixed(2)),
        newPerClassMetrics: computeClassMetrics(newMatrix),
        oldPerClassMetrics: computeClassMetrics(oldMatrix),
        avgClassifyLatencyUs: Number(((loopMs * 1000) / ITERS).toFixed(3)),
        avgClassifyLatencyMs: Number((loopMs / ITERS).toFixed(5)),
        heapDeltaKB: Number(((memAfter - memBefore) / 1024).toFixed(2)),
        scenarios: results,
    }, null, 2));
}

runBenchmark();
