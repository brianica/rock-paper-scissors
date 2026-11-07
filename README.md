# Rock-Paper-Scissors AI

An interactive browser-based Rock-Paper-Scissors game where you play against an adaptive AI agent using either real-time webcam hand-gesture recognition or button controls.

---

## Architecture

The project runs entirely client-side in the browser with no backend required, and includes a deterministic offline evaluation benchmark in `eval/`:

```
┌─────────────────────────────────────────────────────────────────┐
│                           index.html                            │
│                                                                 │
│  ┌───────────────────────────┐   ┌───────────────────────────┐  │
│  │   Webcam Vision Pipeline  │   │       Button Controls     │  │
│  │  1. Handpose (BoundingBox)│   │   (Rock / Paper / Scis.)  │  │
│  │  2. 224x224 Canvas Crop   │   └─────────────┬─────────────┘  │
│  │  3. Teachable Machine CNN │                 │                │
│  │  4. 1s Majority Vote      │                 │                │
│  └─────────────┬─────────────┘                 │                │
└────────────────┼───────────────────────────────┼────────────────┘
                 └───────────────┬───────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               rockpaperscissor.js  /  rps-core.mjs              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      MetaBanditAgent                      │  │
│  │  • 12 Base Behavioral Experts × 3 Meta-Levels = 36 Arms   │  │
│  │  • Sleeping Experts (Abstention on Inactive Turns)        │  │
│  │  • Confidence-Adjusted Accuracy Rating + Tie-Break Voting │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Components
- **`index.html` — UI & Computer Vision Pipeline**:
  - **Dual Input Modes**: Supports continuous webcam rounds (with audio countdowns and `ESC` to stop) or single-round button clicks, plus Dark/Light themes.
  - **Two-Stage Vision Pipeline**:
    1. **Hand Detection (`@tensorflow-models/handpose`)**: Tracks 21 hand landmarks on the video stream and computes a padded square bounding box around the user's hand.
    2. **Gesture Classification (`@teachablemachine/image`)**: Crops the hand bounding box into a hidden `224x224` canvas and classifies the pose (`Rock`, `Paper`, or `Scissors`).
  - **Round State Machine & Majority Voting**: Transitions through `IDLE` → `COUNTDOWN_ANIMATION` → `PLAY_SOUND` → `LISTENING` → `PROCESSING` → `SHOW_RESULTS`. During the 1-second `LISTENING` window, predictions with $>50\%$ confidence are collected into a buffer, and the majority vote determines the player's move.
- **`rps-core.mjs` — Core AI Agent & Predictors**:
  - Implements the 12 base `Expert` classes, `MetaWrapper` (`L1`, `L2`), `MetaBanditAgent`, seeded PRNG (`createRng`), and round outcome tally helpers.
- **`rockpaperscissor.js` — Browser Game Controller**:
  - Connects `MetaBanditAgent` to the DOM controls, animations, and win-rate display.
- **`eval/run.mjs` & `eval/IMPROVEMENT_REPORT.md` — Offline Benchmark Suite**:
  - Evaluates `MetaBanditAgent` across 360 deterministic games (18,000 rounds) against all 12 expert archetypes under `perfect`, `noisy` (`10%` noise), and `random` modes, outputting `eval/out/report.{json,md,html}`.
- **Audio Assets (`man.mp3`, `man2.mp3`, `woman.mp3`, `chinese_female.mp3`, `chinese_maile.mp3`)**: Countdown sound effects that pace the webcam gameplay loop.

---

## AI & Bandit Algorithm

Humans rarely play truly randomly. Instead of training a single monolithic model, `MetaBanditAgent` frames Rock-Paper-Scissors as a **non-stationary, full-information Multi-Armed Bandit with Sleeping Experts ("Prediction with Specialist Advice")**. It manages an ensemble of **36 specialist predictors (arms)** and dynamically tracks which specialist best predicts the player's current behavior.

### 1. The 12 Base Behavioral Experts
Each base expert analyzes a specific statistical or psychological habit to predict the human's next move (`0` = Rock, `1` = Paper, `2` = Scissors), or returns `null` (**"Pass" / Abstain**) when its trigger condition is not active on the current turn:

| Expert | Behavioral Pattern Targeted | When It Abstains (`null`) |
| :--- | :--- | :--- |
| **`RandomExpert`** | Baseline uniform random guesser & `-0.05` safety net. | Never (always active). |
| **`FrequencyExpert`** | Predicts the move the player has used most frequently overall. | Round 0 (no history). |
| **`MarkovExpert(1, 2, 3)`** | 1st-, 2nd-, and 3rd-order Markov chains ($N$-grams) tracking transition probabilities after the player's last 1, 2, or 3 moves. | When `history.length < order` or current $N$-gram is unseen. |
| **`RotationExpert`** | Assumes the player cycles sequentially (`Rock` → `Paper` → `Scissors`). | Round 0. |
| **`WSLSExpert` (Pavlov)** | *Win-Stay, Lose-Shift*: predicts the player repeats a winning move or shifts (`+1`) after a loss. | Round 0 or after a tie. |
| **`GamblersFallacyExpert`** | Assumes that after repeating move $M$ $\ge 2$ times in a row, the player will switch to $(M+1)\bmod 3$ or $(M+2)\bmod 3$, and predicts $(M+1)\bmod 3$ (whose counter $(M+2)\bmod 3$ beats one option and ties the other). | Whenever `streak < 2`. |
| **`MirrorExpert` (Copycat)** | Predicts the player will copy whatever move the AI played last turn. | Round 0. |
| **`SecondGuessingExpert`** | Predicts the player will play the move that would have beaten the AI's last move. | Round 0. |
| **`HandBiasExpert`** | Tracks a 20-move sliding window to detect if any single move exceeds a $40\%$ frequency threshold. | When `history.length < 5` or max frequency $\le 40\%$. |
| **`StubbornExpert`** | Predicts the player will "double down" and immediately repeat a move that just lost. | Round 0 or whenever the player won/tied last turn. |

### 2. Meta-Reasoning Wrappers (36 Total Bandit Arms)
Players often realize they have a habit and try to outsmart the AI by countering their own pattern. To handle higher-order mind games, `MetaWrapper` clones each of the 12 base experts across **3 levels of recursive reasoning** ($12 \times 3 = 36$ total arms):
- **Base (`+0` offset)**: Predicts the player will play the expert's raw prediction $X$.
- **Level 1 (`L1`, `+1` offset)**: Assumes the player will play the counter to $X$, i.e., $(X + 1) \bmod 3$.
- **Level 2 (`L2`, `+2` offset)**: Assumes the player will counter the L1 move, i.e., $(X + 2) \bmod 3$.

Each base expert computes its raw prediction once per round and updates its internal state **once per round**, sharing that prediction across its `Base`, `L1`, and `L2` arms.

### 3. How the Bandit Loop Works Each Round

1. **Query All Experts (`act()`)**:
   Each of the 12 base experts outputs either a move `0, 1, 2` or `null` (Pass). Passing base experts produce `null` for their `Base`, `L1`, and `L2` arms.
2. **Confidence-Adjusted Accuracy Rating (`get_rating()`)**:
   Because conditional specialists (like `StubbornExpert` or `GamblersFallacyExpert`) only wake up on specific turns, comparing raw cumulative scores would unfairly favor always-awake generalists (`FrequencyExpert`). Instead, each awake arm $i$ is evaluated by its smoothed accuracy rate over the turns it was active:
   $$\text{rating}_i = \frac{\text{scores}_i}{\text{active\_counts}_i + 1.5}$$
   (`RandomExpert` is fixed at a baseline rating of `-0.05` so newly awakened pattern advisors at `0.0` take precedence immediately, while `RandomExpert` acts as a fallback safety net if all active pattern advisors have losing records `< -0.05`.)
3. **Top-Tier Tie-Breaker Voting**:
   When the highest-rated active advisor has a positive track record (`best_rating > 0`), any other active advisors within a narrow photo-finish margin (`0.05`) of `best_rating` cast an exponentially weighted vote $w_i = \exp(15 \cdot (\text{rating}_i - \text{best\_rating}))$, and the AI plays the counter-move `(best_prediction + 1) % 3`.
4. **Counterfactual Reward & Sleeping-Expert Update (`update()`)**:
   Once the human's actual move is revealed, every arm that made a prediction (`predicted_move !== null`) is scored counterfactually (`+1` win, `0` tie, `-1` loss) with exponential decay ($\gamma = 0.95$):
   $$\text{score}_i \leftarrow 0.95 \times \text{score}_i + \text{reward}_i, \qquad \text{active\_counts}_i \leftarrow 0.95 \times \text{active\_counts}_i + 1$$
   Sleeping arms (`predicted_move === null`) are untouched, preserving their historical accuracy until their pattern triggers again.

---

### 4. Relationship to a Standard $\epsilon$-Greedy Multi-Armed Bandit

`MetaBanditAgent` is closely related to a **non-stationary $\epsilon$-greedy Multi-Armed Bandit**, with four important adaptations for Rock-Paper-Scissors:

| Feature | Standard $\epsilon$-Greedy Bandit | `MetaBanditAgent` (This Repo) |
| :--- | :--- | :--- |
| **Definition of an Arm** | A static action (e.g., Slot Machine $A, B, C$) | A dynamic **Expert** predictor (36 total) that can wake or sleep (`null`) |
| **Action Selection** | Exploit best arm with probability $1-\epsilon$; explore randomly with probability $\epsilon$ | **Purely greedy ($\epsilon = 0$)** with narrow top-tier tie-breaker voting |
| **Feedback Signal** | **Partial (Bandit) feedback**: Only the 1 pulled arm reveals its reward | **Full-information (Counterfactual) feedback**: All awake arms are scored every turn |
| **Reward Aggregation** | Sample average over all turns | **Decayed accuracy over active turns** ($\text{score}_i / (\text{active\_counts}_i + 1.5)$) |

#### Why $\epsilon = 0$ Works Without Getting Stuck
In a classic slot-machine bandit, you **must** set $\epsilon > 0$ because you only observe the payout of the machine you actually pull; without random exploration, an unpulled arm's value estimate never updates.

In Rock-Paper-Scissors, knowing the human's move (`actual_opponent_move`) immediately tells the AI whether *any* hypothetical move (`Rock`, `Paper`, or `Scissors`) would have won, lost, or tied. Because all awake arms are scored **counterfactually** in the background on every turn, **exploration happens automatically for free**—allowing the bandit to use $\epsilon = 0$ without starving unchosen experts of data.

---

## Offline Evaluation Benchmark (`eval/`)

Run the benchmark suite with Node.js:
```bash
node eval/run.mjs --seed 1 --rounds 50 --noise 0.1 --samples 10
```

### Benchmark Summary (360 Games / 18,000 Rounds)
See [`eval/IMPROVEMENT_REPORT.md`](./eval/IMPROVEMENT_REPORT.md) for the full step-by-step methodology and per-expert breakdown:

| Stage | Mean Win Rate | Pooled Win Rate | `perfect` Mode | `noisy` Mode (`10%`) | `random` Mode | Agent Wins | Human Wins |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Baseline** | 71.63% | 74.96% | 85.33% | 79.13% | 50.43% | 10,622 | 3,549 |
| **Current (`MetaBanditAgent`)** | **74.57%** | **77.77%** | **89.38%** (91.11% pooled) | **83.22%** (84.42% pooled) | **51.12%** | **11,438** | **3,269** |
| **Net Improvement** | **+2.94%** | **+2.81%** | **+4.05%** | **+4.09%** | **+0.69%** | **+816** | **-280** |
