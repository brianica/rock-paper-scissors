# Rock-Paper-Scissors AI

An interactive browser-based Rock-Paper-Scissors game where you play against an adaptive AI agent using either real-time webcam hand-gesture recognition or button controls.

---

## Architecture

The project runs entirely client-side in the browser with no backend required:

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
│                       rockpaperscissor.js                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      MetaBanditAgent                      │  │
│  │  • 12 Base Behavioral Experts × 3 Meta-Levels = 36 Agents │  │
│  │  • Exponentially Decayed Scoring (decay = 0.95)           │  │
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
- **`rockpaperscissor.js` — AI Agent & Game Engine**:
  - Implements the `Expert` predictors, the `MetaBanditAgent` selector, and round outcome/score tracking.
- **Audio Assets (`rps.mp3`, `rps2.mp3`, `woman.mp3`)**: Countdown sound effects that pace the webcam gameplay loop.

---

## AI & Bandit Algorithm

Humans rarely play truly randomly. Instead of training a single monolithic model, `MetaBanditAgent` frames Rock-Paper-Scissors as a **non-stationary, full-information Multi-Armed Bandit ("Prediction with Expert Advice")** problem. It manages an ensemble of **36 specialist predictors (arms)** and dynamically tracks which specialist best predicts the player's current behavior.

### 1. The 12 Base Behavioral Experts
Each base expert analyzes a specific statistical or psychological habit to predict the human's next move (`0` = Rock, `1` = Paper, `2` = Scissors):

| Expert | Behavioral Pattern Targeted |
| :--- | :--- |
| **`RandomExpert`** | Baseline uniform random guesser. |
| **`FrequencyExpert`** | Predicts the move the player has used most frequently overall. |
| **`MarkovExpert(1, 2, 3)`** | 1st-, 2nd-, and 3rd-order Markov chains ($N$-grams) tracking transition probabilities after the player's last 1, 2, or 3 moves. |
| **`RotationExpert`** | Assumes the player cycles sequentially (`Rock` → `Paper` → `Scissors`). |
| **`WSLSExpert` (Pavlov)** | *Win-Stay, Lose-Shift*: predicts the player repeats a winning move or shifts (`+1`) after a loss. |
| **`GamblersFallacyExpert`** | Assumes that after repeating the same move $\ge 2$ times in a row, the player feels "due" to switch to one of the other two moves. |
| **`MirrorExpert` (Copycat)** | Predicts the player will copy whatever move the AI played last turn. |
| **`SecondGuessingExpert`** | Predicts the player will play the move that would have beaten the AI's last move. |
| **`HandBiasExpert`** | Tracks a 20-move sliding window to detect if any single move exceeds a $40\%$ frequency threshold. |
| **`StubbornExpert`** | Predicts the player will "double down" and immediately repeat a move that just lost. |

### 2. Meta-Reasoning Wrappers (36 Total Bandit Arms)
Players often realize they have a habit and try to outsmart the AI by countering their own pattern. To handle higher-order mind games, `MetaWrapper` clones each of the 12 base experts across **3 levels of recursive reasoning** ($12 \times 3 = 36$ total experts):
- **Base (`+0` offset)**: Predicts the player will play the expert's raw prediction $X$.
- **Level 1 (`L1`, `+1` offset)**: Assumes the player will play the counter to $X$, i.e., $(X + 1) \bmod 3$.
- **Level 2 (`L2`, `+2` offset)**: Assumes the player will counter the L1 move, i.e., $(X + 2) \bmod 3$.

### 3. How the Bandit Loop Works Each Round

1. **Query All Experts (`act()`)**:
   Before seeing the player's move, all 36 experts output their prediction for the player's next move (`this.current_predictions`).
2. **Greedy Arm Selection**:
   The bandit selects the expert with the highest current score (`Math.max(...this.scores)`) and plays the counter-move to its prediction:
   ```javascript
   const best_expert_idx = this.scores.indexOf(Math.max(...this.scores));
   const best_prediction = this.current_predictions[best_expert_idx];
   return (best_prediction + 1) % 3;
   ```
3. **Counterfactual (Full-Information) Reward (`update()`)**:
   Once the human's actual move is revealed, the bandit evaluates what **every single one of the 36 experts** *would* have achieved if the AI had trusted it:
   - `+1` if countering the expert's prediction beats the human's actual move
   - `0` if it ties
   - `-1` if it loses
4. **Exponential Decay Update**:
   Every expert's score is updated with an exponential decay factor ($\gamma = 0.95$):
   $$\text{score}_i \leftarrow 0.95 \times \text{score}_i + \text{reward}_i$$
   Finally, each base expert updates its internal history/counts with the round's actual moves.

---

### 4. Relationship to a Standard $\epsilon$-Greedy Multi-Armed Bandit

`MetaBanditAgent` is closely related to a **non-stationary $\epsilon$-greedy Multi-Armed Bandit**, with three important adaptations for Rock-Paper-Scissors:

| Feature | Standard $\epsilon$-Greedy Bandit | `MetaBanditAgent` (This Repo) |
| :--- | :--- | :--- |
| **Definition of an Arm** | A static action (e.g., Slot Machine $A, B, C$) | A dynamic **Expert** predictor (36 total) |
| **Action Selection** | Exploit best arm with probability $1-\epsilon$; explore randomly with probability $\epsilon$ | **Purely greedy ($\epsilon = 0$)** — always selects `Math.max(...this.scores)` |
| **Feedback Signal** | **Partial (Bandit) feedback**: Only the 1 pulled arm reveals its reward | **Full-information (Counterfactual) feedback**: All 36 arms are scored every turn |
| **Reward Aggregation** | Sample average or constant step-size $\alpha$ | **Exponentially decayed sum** ($\text{score} \leftarrow 0.95 \times \text{score} + r$) |

#### Why $\epsilon = 0$ Works Without Getting Stuck
In a classic slot-machine bandit, you **must** set $\epsilon > 0$ because you only observe the payout of the machine you actually pull; without random exploration, an unpulled arm's value estimate never updates.

In Rock-Paper-Scissors, knowing the human's move (`actual_opponent_move`) immediately tells the AI whether *any* hypothetical move (`Rock`, `Paper`, or `Scissors`) would have won, lost, or tied. Because all 36 arms are scored **counterfactually** in the background on every turn, **exploration happens automatically for free**—allowing the bandit to use $\epsilon = 0$ (100% greedy exploitation) without starving unchosen experts of data.

#### Why Exponential Decay Replaces Sample Averages
In standard reinforcement learning (e.g., Sutton & Barto), non-stationary bandits track changing environments using an exponential recency-weighted average:
$$Q_{t+1}(a) = (1 - \alpha) Q_t(a) + \alpha R_t$$
The update rule in `rockpaperscissor.js`:
```javascript
this.scores[i] = (this.scores[i] * 0.95) + reward;
```
is mathematically equivalent to the recency-weighted average with $1 - \alpha = 0.95$ ($\alpha = 0.05$), scaled by a constant factor of $1/\alpha = 20$. Because old rewards shrink by $5\%$ every turn, an expert that dominated early rounds is quickly dethroned within a few turns if the human switches strategies.

#### Subtle Trade-Offs of $\epsilon = 0$
While counterfactual evaluation eliminates the classic need for $\epsilon$-exploration, pure greedy selection ($\epsilon = 0$) still has two subtle nuances:
1. **Adversarial Predictability**: Because `Math.max(...this.scores)` is deterministic, a player who knows the exact algorithm could theoretically track which expert is winning and counter it (whereas adversarial bandit algorithms like **Hedge** or **EXP3** sample arms via a softmax distribution).
2. **State Coupling (`my_move_this_turn`)**: Reactive experts (`WSLSExpert`, `MirrorExpert`, `SecondGuessingExpert`, `StubbornExpert`) depend on the AI's own last move (`my_move_this_turn`). Which expert the bandit chooses today affects the move the AI plays, which influences how the human reacts on the next turn.
