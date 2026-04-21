"""
Train a LightGBM classifier to predict P(fan will spend).

Usage:
    python scripts/train_model.py

Reads:  ml/training_data.csv   (produced by export_training_data.py)
Writes: models/spend_model.pkl
"""

import os

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score

MODEL_PATH = "models/spend_model.pkl"
DATA_PATH = "ml/training_data.csv"
MODEL_VERSION = "v1"

FEATURES = [
    "streams_attended",
    "total_messages",
    "messages_per_stream",
    "days_since_last_message",
    "weeks_since_first_message",
    "direct_address_count",
    "direct_address_rate",
]
TARGET = "has_paid_event"


def main():
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} rows from {DATA_PATH}")
    print(f"  Class balance: {df[TARGET].value_counts().to_dict()}")

    X = df[FEATURES]
    y = df[TARGET]

    neg = (y == 0).sum()
    pos = (y == 1).sum()

    if pos == 0:
        raise ValueError("No positive examples — cannot train. Collect more data first.")

    scale_pos_weight = neg / pos
    print(f"  scale_pos_weight: {scale_pos_weight:.2f}  (neg={neg}, pos={pos})")

    model = LGBMClassifier(
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=5,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        verbose=-1,
    )

    n_splits = min(5, pos)  # can't have more splits than positive examples
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    auc_scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
    ap_scores = cross_val_score(model, X, y, cv=cv, scoring="average_precision")
    print(f"\nCross-validation ({n_splits}-fold):")
    print(f"  AUC-ROC           : {auc_scores.mean():.3f} ± {auc_scores.std():.3f}")
    print(f"  Average Precision : {ap_scores.mean():.3f} ± {ap_scores.std():.3f}")

    model.fit(X, y)

    os.makedirs("models", exist_ok=True)
    artifact = {"model": model, "features": FEATURES, "version": MODEL_VERSION}
    joblib.dump(artifact, MODEL_PATH)
    print(f"\nModel saved → {MODEL_PATH}")

    importances = sorted(
        zip(FEATURES, model.feature_importances_), key=lambda x: x[1], reverse=True
    )
    print("\nFeature importances (gain):")
    for feat, imp in importances:
        bar = "█" * int(imp / max(i for _, i in importances) * 20)
        print(f"  {feat:<30} {bar} {imp:.0f}")


if __name__ == "__main__":
    main()
