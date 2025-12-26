// --- Constants ---
const ROCK = 0;
const PAPER = 1;
const SCISSORS = 2;
const MOVES = ["Rock", "Paper", "Scissors"];

function get_counter_move(move) {
    return (move + 1) % 3;
}

// ==========================================
// 1. The Experts (Predictors)
// ==========================================
class Expert {
    get_prediction() {
        throw new Error("Not implemented");
    }
    update(last_opponent_move, my_move) {
        // Default is to do nothing
    }
    name() {
        return "Generic";
    }
}

class RandomExpert extends Expert {
    get_prediction() {
        return Math.floor(Math.random() * 3);
    }
    name() { return "Random"; }
}

class FrequencyExpert extends Expert {
    constructor() {
        super();
        this.counts = [0, 0, 0];
    }

    get_prediction() {
        const sum = this.counts.reduce((a, b) => a + b, 0);
        if (sum === 0) return Math.floor(Math.random() * 3);
        return this.counts.indexOf(Math.max(...this.counts));
    }

    update(move) {
        this.counts[move]++;
    }
    name() { return "Frequency"; }
}

class MarkovExpert extends Expert {
    constructor(order = 1) {
        super();
        this.order = order;
        this.history = [];
        this.stats = new Map(); // Map<string, number[]>
    }

    get_prediction() {
        if (this.history.length < this.order) {
            return Math.floor(Math.random() * 3);
        }

        const state = this.history.slice(-this.order).join(',');
        const counts = this.stats.get(state);

        if (!counts || counts.reduce((a, b) => a + b, 0) === 0) {
            return Math.floor(Math.random() * 3);
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
    constructor() {
        super();
        this.last_move = null;
    }

    get_prediction() {
        if (this.last_move === null) return Math.floor(Math.random() * 3);
        return (this.last_move + 1) % 3;
    }

    update(move) {
        this.last_move = move;
    }
    name() { return "Rotator"; }
}

class WSLSExpert extends Expert {
    constructor() {
        super();
        this.last_opp_move = null;
        this.last_my_move = null;
        this.last_result = null; // 1=Opp Win, -1=Opp Loss, 0=Tie
    }

    get_prediction() {
        if (this.last_opp_move === null) {
            return Math.floor(Math.random() * 3);
        }

        if (this.last_result === 1) { // Opponent Won
            return this.last_opp_move;
        } else if (this.last_result === -1) { // Opponent Lost
            return (this.last_opp_move + 1) % 3;
        } else { // Tie
            return Math.floor(Math.random() * 3);
        }
    }

    update(last_opp_move, last_my_move) {
        this.last_opp_move = last_opp_move;
        this.last_my_move = last_my_move;

        if (last_opp_move === last_my_move) {
            this.last_result = 0;
        } else if (last_opp_move === (last_my_move + 1) % 3) {
            this.last_result = 1; // Opponent Won
        } else {
            this.last_result = -1; // Opponent Lost
        }
    }
    name() { return "WSLS-Pavlov"; }
}

class GamblersFallacyExpert extends Expert {
    constructor() {
        super();
        this.last_move = null;
        this.streak = 0;
    }

    get_prediction() {
        if (this.last_move === null || this.streak < 2) {
            return Math.floor(Math.random() * 3);
        }
        const options = [0, 1, 2].filter(m => m !== this.last_move);
        return options[Math.floor(Math.random() * options.length)];
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
    constructor() {
        super();
        this.my_last_move = null;
    }

    get_prediction() {
        if (this.my_last_move === null) {
            return Math.floor(Math.random() * 3);
        }
        return this.my_last_move;
    }

    update(opp_move, my_move) {
        this.my_last_move = my_move;
    }
    name() { return "Mirror (Copycat)"; }
}

class SecondGuessingExpert extends Expert {
    constructor() {
        super();
        this.my_last_move = null;
    }

    get_prediction() {
        if (this.my_last_move === null) {
            return Math.floor(Math.random() * 3);
        }
        return (this.my_last_move + 1) % 3;
    }

    update(opp_move, my_move) {
        this.my_last_move = my_move;
    }
    name() { return "Level-1 (Counter-Me)"; }
}

class HandBiasExpert extends Expert {
    constructor(history_len = 20, threshold = 0.4) {
        super();
        this.history = [];
        this.history_len = history_len;
        this.threshold = threshold;
    }

    get_prediction() {
        if (this.history.length < 5) return Math.floor(Math.random() * 3);

        const counts = [0, 0, 0];
        this.history.forEach(m => counts[m]++);

        const total = this.history.length;
        const probs = counts.map(c => c / total);

        const biased_move = probs.findIndex(p => p > this.threshold);
        if (biased_move !== -1) {
            return biased_move;
        }

        return Math.floor(Math.random() * 3);
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
    constructor() {
        super();
        this.last_opp_move = null;
        this.last_my_move = null;
    }

    get_prediction() {
        if (this.last_opp_move === null) return Math.floor(Math.random() * 3);

        if (this.last_my_move === (this.last_opp_move + 1) % 3) { // Did they lose?
            return this.last_opp_move; // Predict they repeat
        }
        return Math.floor(Math.random() * 3);
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

    // The base expert is updated separately in the main agent
    update(opp_move, my_move) {}

    name() {
        return `${this.expert.name()} [${this.level_name}]`;
    }
}


// ==========================================
// 2. The Meta-Agent (The Bandit Manager)
// ==========================================
class MetaBanditAgent {
    constructor() {
        const base_experts = [
            new RandomExpert(),
            new FrequencyExpert(),
            new RotationExpert(),
            new MarkovExpert(1),
            new MarkovExpert(2),
            new MarkovExpert(3),
            new WSLSExpert(),
            new GamblersFallacyExpert(),
            new MirrorExpert(),
            new SecondGuessingExpert(),
            new HandBiasExpert(),
            new StubbornExpert(),
        ];

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
        
        console.log(`Trusting ${this.experts[best_expert_idx].name()} (Score: ${this.scores[best_expert_idx].toFixed(2)})`);

        return get_counter_move(best_prediction);
    }

    update(actual_opponent_move, my_move_this_turn) {
        for (let i = 0; i < this.experts.length; i++) {
            const expert = this.experts[i];
            const predicted_move = this.current_predictions[i];
            const my_hypothetical_move = get_counter_move(predicted_move);

            let reward = 0;
            if (my_hypothetical_move === get_counter_move(actual_opponent_move)) {
                reward = 1; // Win
            } else if (my_hypothetical_move !== actual_opponent_move) {
                reward = -1; // Loss
            } // Tie is 0

            this.scores[i] = (this.scores[i] * this.decay) + reward;

            // Update the expert's internal model.
            // We need to update the base experts, not the wrappers.
            const base_expert = expert.expert || expert;
            try {
                 // Attempt to call update with two arguments for experts that need it
                 // We check the number of arguments the function expects
                if (base_expert.update.length === 2) {
                    base_expert.update(actual_opponent_move, my_move_this_turn);
                } else {
                    base_expert.update(actual_opponent_move);
                }
            } catch (e) {
                 // Fallback for experts that only take one argument
                 base_expert.update(actual_opponent_move);
            }
        }
    }
}

// ==========================================
// 3. Game Logic (Global)
// ==========================================
const agent = new MetaBanditAgent();
let agent_wins = 0;
let total_decisive_rounds = 0;

const MOVE_ICONS = ["✊", "✋", "✌️"]; // Rock, Paper, Scissors icons

function playGame(player_move) {
    // Get DOM elements each time to ensure they're loaded
    const resultsDisplay = document.getElementById('results');
    const agentMoveDisplay = document.getElementById('agent-move');
    const playerMoveDisplay = document.getElementById('player-move');
    const winRateDisplay = document.getElementById('win-rate');
    const playerMoveIcon = document.getElementById('player-move-icon');
    const agentMoveIcon = document.getElementById('agent-move-icon');
    const playerMoveContainer = document.getElementById('player-move-container');
    const agentMoveContainer = document.getElementById('agent-move-container');
    const vsText = document.querySelector('.vs-text');

    const agent_move = agent.act();
    const gameColumn = document.getElementById('game-column');

    let outcome_text = "";
    let feedback_class = "";

    if (agent_move === player_move) {
        outcome_text = "It's a Tie!";
        feedback_class = 'tie-feedback';
    } else if (agent_move === get_counter_move(player_move)) {
        outcome_text = "Agent Wins!";
        agent_wins++;
        total_decisive_rounds++;
        feedback_class = 'lose-feedback';
    } else {
        outcome_text = "You Win!";
        total_decisive_rounds++;
        feedback_class = 'win-feedback';
    }

    // Apply feedback
    gameColumn.classList.add(feedback_class);
    setTimeout(() => {
        gameColumn.classList.remove(feedback_class);
    }, 500);

    playerMoveDisplay.innerHTML = `You played: <strong>${MOVES[player_move]}</strong>`;
    agentMoveDisplay.innerHTML = `Agent played: <strong>${MOVES[agent_move]}</strong>`;
    resultsDisplay.textContent = `Result: ${outcome_text}`;

    // Update icon display
    playerMoveIcon.textContent = MOVE_ICONS[player_move];
    agentMoveIcon.textContent = MOVE_ICONS[agent_move];
    playerMoveContainer.style.opacity = 1;
    agentMoveContainer.style.opacity = 1;
    vsText.style.opacity = 1;

    agent.update(player_move, agent_move);

    const win_rate = total_decisive_rounds > 0 ? (agent_wins / total_decisive_rounds) * 100 : 0;
    winRateDisplay.textContent = `Agent Win Rate (vs. you, excluding ties): ${win_rate.toFixed(1)}% (${agent_wins}/${total_decisive_rounds})`;
}

function resetScore() {
    agent_wins = 0;
    total_decisive_rounds = 0;
    document.getElementById('win-rate').textContent = `Agent Win Rate (vs. you, excluding ties): 0.0% (0/0)`;
}


// ==========================================
// 4. Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const buttons = {
        [ROCK]: document.getElementById('rock'),
        [PAPER]: document.getElementById('paper'),
        [SCISSORS]: document.getElementById('scissors'),
    };

    buttons[ROCK].addEventListener('click', () => playGame(ROCK));
    buttons[PAPER].addEventListener('click', () => playGame(PAPER));
    buttons[SCISSORS].addEventListener('click', () => playGame(SCISSORS));

    const resetButton = document.getElementById('reset-score-btn');
    resetButton.addEventListener('click', resetScore);
});
