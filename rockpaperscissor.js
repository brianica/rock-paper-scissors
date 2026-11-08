import {
    ROCK,
    PAPER,
    SCISSORS,
    MOVES,
    get_counter_move,
    MetaBanditAgent,
    classifyHandLandmarks,
} from "./rps-core.mjs";

const agent = new MetaBanditAgent();
let agent_wins = 0;
let total_decisive_rounds = 0;

const MOVE_ICONS = ["✊", "✋", "✌️"];

export function playGame(player_move) {
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

    gameColumn.classList.add(feedback_class);
    setTimeout(() => {
        gameColumn.classList.remove(feedback_class);
    }, 500);

    playerMoveDisplay.innerHTML = `You played: <strong>${MOVES[player_move]}</strong>`;
    agentMoveDisplay.innerHTML = `Agent played: <strong>${MOVES[agent_move]}</strong>`;
    resultsDisplay.textContent = `Result: ${outcome_text}`;

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

document.getElementById('rock').addEventListener('click', () => playGame(ROCK));
document.getElementById('paper').addEventListener('click', () => playGame(PAPER));
document.getElementById('scissors').addEventListener('click', () => playGame(SCISSORS));
document.getElementById('reset-score-btn').addEventListener('click', resetScore);

export { ROCK, PAPER, SCISSORS, classifyHandLandmarks };

globalThis.ROCK = ROCK;
globalThis.PAPER = PAPER;
globalThis.SCISSORS = SCISSORS;
globalThis.playGame = playGame;
