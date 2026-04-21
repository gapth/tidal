# ML: Spend Prediction

Predicts P(fan will spend in next stream) using fan behavioral signals from live chat history. Scores are stored in `fan_predictions` and recomputed on a daily cron.

## Setup

**1. Install Python dependencies**

```bash
pip install -r requirements-ml.txt
```

LightGBM requires OpenMP on macOS:

```bash
brew install libomp
```

**2. Add `DATABASE_URL` to `.env`**

Get the connection pooler URI from Supabase dashboard → **Settings → Database → Connection pooling → Session mode (port 5432)**:

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

**3. Apply the migration**

```bash
supabase db push   # prod
# or
supabase db reset  # local
```

---

## Workflow

### Step 1 — Export training data

Pulls fan-level aggregates from the database and writes `ml/training_data.csv` (gitignored).

```bash
DOTENV_FILE=.env python scripts/export_training_data.py
```

Output:

```
Exported 1234 fans → ml/training_data.csv
  has_paid_event=1 : 87 (7.1%)
  has_paid_event=0 : 1147 (92.9%)
```

### Step 2 — Train

Trains a LightGBM binary classifier and saves the model to `models/spend_model.pkl` (gitignored).

```bash
python scripts/train_model.py
```

Output includes cross-validated AUC-ROC and feature importances. A healthy model should reach AUC-ROC ≥ 0.70. If it's below that, you likely need more data.

### Step 3 — Predict

Runs batch inference over all fans and upserts probabilities into `fan_predictions`.

```bash
DOTENV_FILE=.env python scripts/predict_scores.py
```

---

## Features

All features are derived from behavioral signals — paid event history is intentionally excluded so the model learns pre-spend patterns, not just labels existing supporters.

| Feature                     | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `streams_attended`          | Distinct streams the fan has chatted in          |
| `total_messages`            | Total message count                              |
| `messages_per_stream`       | Average messages per attended stream             |
| `days_since_last_message`   | Recency of last chat message                     |
| `weeks_since_first_message` | Relationship duration                            |
| `direct_address_count`      | Messages starting with `@` or containing `?`     |
| `direct_address_rate`       | Direct addresses as a fraction of total messages |

## Target

`has_paid_event` — binary label: 1 if the fan has ever sent a Super Chat, sticker, gifted membership, or joined as a member.

---

## Re-training

Retrain whenever the fan base grows significantly or model AUC drops. The full cycle takes under a minute on a local machine:

```bash
DOTENV_FILE=.env python scripts/export_training_data.py
python scripts/train_model.py
DOTENV_FILE=.env python scripts/predict_scores.py
```

---

## Phase 2 — Causal modeling (shoutout → spend)

Not yet implemented. Requires logging creator actions (shoutouts, direct replies) in a `creator_actions` table over 20–30 streams, then using EconML's `CausalForestDML` to estimate the causal effect while controlling for baseline engagement. See the ML stack research plan for details.
