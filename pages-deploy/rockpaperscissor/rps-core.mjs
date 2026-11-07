export const ROCK = 0;
export const PAPER = 1;
export const SCISSORS = 2;
export const MOVES = ["Rock", "Paper", "Scissors"];

export function get_counter_move(move) {
    return (move + 1) % 3;
}

export function createRng(seed) {
    let a = seed >>> 0;
    return function mulberry32() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class Expert {
    constructor(random = Math.random) {
        this.random = random;
    }
    randomMove() {
        return Math.floor(this.random() * 3);
    }
    get_prediction() {
        throw new Error("Not implemented");
    }
    update(last_opponent_move, my_move) {
    }
    name() {
        return "Generic";
    }
}

class RandomExpert extends Expert {
    get_prediction() {
        return this.randomMove();
    }
    name() { return "Random"; }
}

class FrequencyExpert extends Expert {
    constructor(random) {
        super(random);
        this.counts = [0, 0, 0];
    }

    get_prediction() {
        const sum = this.counts.reduce((a, b) => a + b, 0);
        if (sum === 0) return this.randomMove();
        return this.counts.indexOf(Math.max(...this.counts));
    }

    update(move) {
        this.counts[move]++;
    }
    name() { return "Frequency"; }
}

class MarkovExpert extends Expert {
    constructor(order = 1, random = Math.random) {
        super(random);
        this.order = order;
        this.history = [];
        this.stats = new Map();
    }

    get_prediction() {
        if (this.history.length < this.order) {
            return this.randomMove();
        }

        const state = this.history.slice(-this.order).join(',');
        const counts = this.stats.get(state);

        if (!counts || counts.reduce((a, b) => a + b, 0) === 0) {
            return this.randomMove();
        }
        return counts.indexOf(Math.max(...counts));
    }

    update(move) {
        if (this.history.length >= this.order) {
            const state = this.history.slice(-this.order).join(',');
            if (!this.stats.has(state)) {
                this.stats.set(state, [0, 0, 0]);
            }
            this.stats.get(state)[move]++;
        }
        this.history.push(move);
    }
    name() { return `Markov-${this.order}`; }
}

class RotationExpert extends Expert {
    constructor(random) {
        super(random);
        this.last_move = null;
    }

    get_prediction() {
        if (this.last_move === null) return this.randomMove();
        return (this.last_move + 1) % 3;
    }

    update(move) {
        this.last_move = move;
    }
    name() { return "Rotator"; }
}

class WSLSExpert extends Expert {
    constructor(random) {
        super(random);
        this.last_opp_move = null;
        this.last_my_move = null;
        this.last_result = null;
    }

    get_prediction() {
        if (this.last_opp_move === null) {
            return this.randomMove();
        }

        if (this.last_result === 1) {
            return this.last_opp_move;
        } else if (this.last_result === -1) {
            return (this.last_opp_move + 1) % 3;
        } else {
            return this.randomMove();
        }
    }

    update(last_opp_move, last_my_move) {
        this.last_opp_move = last_opp_move;
        this.last_my_move = last_my_move;

        if (last_opp_move === last_my_move) {
            this.last_result = 0;
        } else if (last_opp_move === (last_my_move + 1) % 3) {
            this.last_result = 1;
        } else {
            this.last_result = -1;
        }
    }
    name() { return "WSLS-Pavlov"; }
}

class GamblersFallacyExpert extends Expert {
    constructor(random) {
        super(random);
        this.last_move = null;
        this.streak = 0;
    }

    get_prediction() {
        if (this.last_move === null || this.streak < 2) {
            return this.randomMove();
        }
        const options = [0, 1, 2].filter(m => m !== this.last_move);
        return options[Math.floor(this.random() * options.length)];
    }

    update(opp_move) {
        if (opp_move === this.last_move) {
            this.streak++;
        } else {
            this.streak = 1;
            this.last_move = opp_move;
        }
    }
    name() { return "GamblerFallacy"; }
}

class MirrorExpert extends Expert {
    constructor(random) {
        super(random);
        this.my_last_move = null;
    }

    get_prediction() {
        if (this.my_last_move === null) {
            return this.randomMove();
        }
        return this.my_last_move;
    }

    update(opp_move, my_move) {
        this.my_last_move = my_move;
    }
    name() { return "Mirror (Copycat)"; }
}

class SecondGuessingExpert extends Expert {
    constructor(random) {
        super(random);
        this.my_last_move = null;
    }

    get_prediction() {
        if (this.my_last_move === null) {
            return this.randomMove();
        }
        return (this.my_last_move + 1) % 3;
    }

    update(opp_move, my_move) {
        this.my_last_move = my_move;
    }
    name() { return "Level-1 (Counter-Me)"; }
}

class HandBiasExpert extends Expert {
    constructor(history_len = 20, threshold = 0.4, random = Math.random) {
        super(random);
        this.history = [];
        this.history_len = history_len;
        this.threshold = threshold;
    }

    get_prediction() {
        if (this.history.length < 5) return this.randomMove();

        const counts = [0, 0, 0];
        this.history.forEach(m => counts[m]++);

        const total = this.history.length;
        const probs = counts.map(c => c / total);

        const biased_move = probs.findIndex(p => p > this.threshold);
        if (biased_move !== -1) {
            return biased_move;
        }

        return this.randomMove();
    }

    update(opp_move) {
        this.history.push(opp_move);
        if (this.history.length > this.history_len) {
            this.history.shift();
        }
    }
    name() { return "Hand-Bias (Skew)"; }
}

class StubbornExpert extends Expert {
    constructor(random) {
        super(random);
        this.last_opp_move = null;
        this.last_my_move = null;
    }

    get_prediction() {
        if (this.last_opp_move === null) return this.randomMove();

        if (this.last_my_move === (this.last_opp_move + 1) % 3) {
            return this.last_opp_move;
        }
        return this.randomMove();
    }

    update(opp_move, my_move) {
        this.last_opp_move = opp_move;
        this.last_my_move = my_move;
    }
    name() { return "Stubborn (Double-Down)"; }
}

class MetaWrapper extends Expert {
    constructor(base_expert, level_name, offset) {
        super();
        this.expert = base_expert;
        this.offset = offset;
        this.level_name = level_name;
    }

    get_prediction() {
        const raw_prediction = this.expert.get_prediction();
        return (raw_prediction + this.offset) % 3;
    }

    update(opp_move, my_move) {}

    name() {
        return `${this.expert.name()} [${this.level_name}]`;
    }
}

export function createBaseExperts(random = Math.random) {
    return [
        new RandomExpert(random),
        new FrequencyExpert(random),
        new RotationExpert(random),
        new MarkovExpert(1, random),
        new MarkovExpert(2, random),
        new MarkovExpert(3, random),
        new WSLSExpert(random),
        new GamblersFallacyExpert(random),
        new MirrorExpert(random),
        new SecondGuessingExpert(random),
        new HandBiasExpert(20, 0.4, random),
        new StubbornExpert(random),
    ];
}

export function updateExpert(expert, opp, agentMove) {
    const base = expert.expert || expert;
    if (base.update.length === 2) {
        base.update(opp, agentMove);
    } else {
        base.update(opp);
    }
}

export class MetaBanditAgent {
    constructor({ random = Math.random, log = console.log } = {}) {
        this.log = log;
        const base_experts = createBaseExperts(random);

        this.experts = [];
        base_experts.forEach(exp => {
            this.experts.push(exp);
            this.experts.push(new MetaWrapper(exp, "L1", 1));
            this.experts.push(new MetaWrapper(exp, "L2", 2));
        });

        this.scores = new Array(this.experts.length).fill(0.0);
        this.decay = 0.95;
        this.current_predictions = [];
    }

    act() {
        this.current_predictions = this.experts.map(exp => exp.get_prediction());

        const best_expert_idx = this.scores.indexOf(Math.max(...this.scores));
        const best_prediction = this.current_predictions[best_expert_idx];

        this.log(`Trusting ${this.experts[best_expert_idx].name()} (Score: ${this.scores[best_expert_idx].toFixed(2)})`);

        return get_counter_move(best_prediction);
    }

    update(actual_opponent_move, my_move_this_turn) {
        for (let i = 0; i < this.experts.length; i++) {
            const expert = this.experts[i];
            const predicted_move = this.current_predictions[i];
            const my_hypothetical_move = get_counter_move(predicted_move);

            let reward = 0;
            if (my_hypothetical_move === get_counter_move(actual_opponent_move)) {
                reward = 1;
            } else if (my_hypothetical_move !== actual_opponent_move) {
                reward = -1;
            }

            this.scores[i] = (this.scores[i] * this.decay) + reward;

            // L1 and L2 wrap the same base, so each base learns three times per round.
            updateExpert(expert, actual_opponent_move, my_move_this_turn);
        }
    }
}

export function resolveRound(humanMove, agentMove) {
    if (agentMove === humanMove) return "tie";
    if (agentMove === get_counter_move(humanMove)) return "agent";
    return "human";
}

export function summarize(tally) {
    const winRate = tally.decisiveRounds > 0 ? tally.agentWins / tally.decisiveRounds : null;
    return {
        agentWins: tally.agentWins,
        humanWins: tally.humanWins,
        ties: tally.ties,
        decisiveRounds: tally.decisiveRounds,
        rounds: tally.rounds,
        winRate,
    };
}

export function emptyTally() {
    return summarize({
        agentWins: 0,
        humanWins: 0,
        ties: 0,
        decisiveRounds: 0,
        rounds: 0,
    });
}

export function recordOutcome(tally, outcome) {
    const next = {
        agentWins: tally.agentWins,
        humanWins: tally.humanWins,
        ties: tally.ties,
        decisiveRounds: tally.decisiveRounds,
        rounds: tally.rounds + 1,
    };
    if (outcome === "agent") {
        next.agentWins += 1;
        next.decisiveRounds += 1;
    } else if (outcome === "human") {
        next.humanWins += 1;
        next.decisiveRounds += 1;
    } else {
        next.ties += 1;
    }
    return summarize(next);
}

export function addTally(a, b) {
    return summarize({
        agentWins: a.agentWins + b.agentWins,
        humanWins: a.humanWins + b.humanWins,
        ties: a.ties + b.ties,
        decisiveRounds: a.decisiveRounds + b.decisiveRounds,
        rounds: a.rounds + b.rounds,
    });
}
