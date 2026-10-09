"""
MineGuard Predict - Model Training, Benchmarking, and Evaluation Pipeline.

Trains and rigorously compares:
1. Logistic Regression (Baseline)
2. Random Forest Classifier
3. HistGradientBoosting Classifier
plus Future Peak Methane Regressors across 5m, 15m, and 30m forecast horizons.

Strictly splits by independent episodes to guarantee train/val/test disjointness
and avoid time-series boundary leakage. Uses the authoritative evaluation engine
(ml.evaluate) to calculate all metrics consistently.
"""

from datetime import datetime
import json
import os
from typing import Dict, List, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from ml.evaluate import evaluate_authoritative, find_optimal_threshold_on_validation
from ml.explain import ModelExplainer
from ml.features import FEATURE_COLUMNS, extract_features_dataset
from ml.generator import generate_and_save_dataset
from ml.labels import DEFAULT_THRESHOLD_PCT, HORIZONS, create_forward_labels, verify_no_target_leakage


ARTIFACTS_DIR = "artifacts"
DATA_PATH = "data/generated/synthetic_mine_sensors_150k.csv"


def split_episodes(
    df: pd.DataFrame, train_ratio: float = 0.70, val_ratio: float = 0.15, seed: int = 42
) -> Tuple[List[str], List[str], List[str]]:
    """
    Splits unique episode IDs into disjoint train, validation, and test sets.
    """
    episodes = sorted(df["episode_id"].unique())
    rng = np.random.default_rng(seed)
    shuffled_episodes = rng.permutation(episodes).tolist()

    n_total = len(shuffled_episodes)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)

    train_eps = shuffled_episodes[:n_train]
    val_eps = shuffled_episodes[n_train : n_train + n_val]
    test_eps = shuffled_episodes[n_train + n_val :]

    # Assert complete disjointness
    assert len(set(train_eps).intersection(val_eps)) == 0
    assert len(set(train_eps).intersection(test_eps)) == 0
    assert len(set(val_eps).intersection(test_eps)) == 0

    return train_eps, val_eps, test_eps


def train_and_evaluate_all(
    dataset_path: str = DATA_PATH,
    artifacts_dir: str = ARTIFACTS_DIR,
    threshold: float = DEFAULT_THRESHOLD_PCT,
    target_rows: int = 150000,
    seed: int = 42,
) -> Dict:
    """
    End-to-end execution:
    1. Loads or generates dataset.
    2. Extracts causal features.
    3. Generates disjoint future labels.
    4. Splits by episode.
    5. Fits scaler and all models.
    6. Selects decision thresholds using validation set only.
    7. Evaluates authoritatively on untouched held-out test episodes.
    8. Saves all artifacts, metrics, and metadata.
    """
    os.makedirs(artifacts_dir, exist_ok=True)

    if not os.path.exists(dataset_path):
        print(f"Dataset not found at {dataset_path}. Generating {target_rows} rows...")
        df_raw = generate_and_save_dataset(dataset_path, target_rows=target_rows, seed=seed)
    else:
        print(f"Loading existing dataset from {dataset_path}...")
        df_raw = pd.read_csv(dataset_path)

    print(f"Total raw records: {len(df_raw)}")
    print("Extracting causal features...")
    df_feat = extract_features_dataset(df_raw)

    print(f"Creating forward labels for horizons {HORIZONS} at threshold {threshold}% CH4...")
    df_labeled = create_forward_labels(df_feat, threshold=threshold, horizons=HORIZONS)

    target_cols = [f"target_exceed_{h}m" for h in HORIZONS]
    verify_no_target_leakage(df_labeled, FEATURE_COLUMNS, target_cols)

    # Episode splits
    train_eps, val_eps, test_eps = split_episodes(df_labeled, seed=seed)
    print(f"Episodes: Train={len(train_eps)}, Val={len(val_eps)}, Test={len(test_eps)}")

    train_mask = df_labeled["episode_id"].isin(train_eps)
    val_mask = df_labeled["episode_id"].isin(val_eps)
    test_mask = df_labeled["episode_id"].isin(test_eps)

    # Feature baseline means for local explainability
    baseline_means = {
        col: float(np.round(df_labeled.loc[train_mask, col].mean(), 4))
        for col in FEATURE_COLUMNS
    }
    with open(os.path.join(artifacts_dir, "feature_baselines.json"), "w") as f:
        json.dump(baseline_means, f, indent=2)

    # Scaler fit on training set strictly
    scaler = StandardScaler()
    X_train_raw = df_labeled.loc[train_mask, FEATURE_COLUMNS].values
    scaler.fit(X_train_raw)
    joblib.dump(scaler, os.path.join(artifacts_dir, "scaler.joblib"))

    explainer = ModelExplainer(FEATURE_COLUMNS)

    all_metrics = []
    global_importances = {}

    model_factories = {
        "logistic_regression": lambda: LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=seed
        ),
        "random_forest": lambda: RandomForestClassifier(
            n_estimators=100,
            max_depth=12,
            min_samples_leaf=10,
            class_weight="balanced",
            random_state=seed,
            n_jobs=-1,
        ),
        "hist_gradient_boosting": lambda: HistGradientBoostingClassifier(
            max_iter=120,
            max_depth=8,
            min_samples_leaf=20,
            class_weight="balanced",
            random_state=seed,
        ),
    }

    # Train and evaluate classifiers for each horizon
    for h in HORIZONS:
        target_name = f"target_exceed_{h}m"
        peak_name = f"target_peak_ch4_{h}m"

        # Valid rows without NaN target
        train_h_mask = train_mask & df_labeled[target_name].notna()
        val_h_mask = val_mask & df_labeled[target_name].notna()
        test_h_mask = test_mask & df_labeled[target_name].notna()

        X_tr = scaler.transform(df_labeled.loc[train_h_mask, FEATURE_COLUMNS].values)
        y_tr = df_labeled.loc[train_h_mask, target_name].values.astype(int)

        X_val = scaler.transform(df_labeled.loc[val_h_mask, FEATURE_COLUMNS].values)
        y_val = df_labeled.loc[val_h_mask, target_name].values.astype(int)

        test_sub_df = df_labeled.loc[test_h_mask]
        X_te = scaler.transform(test_sub_df[FEATURE_COLUMNS].values)
        y_te = test_sub_df[target_name].values.astype(int)
        test_ep_ids = test_sub_df["episode_id"].values
        test_timestamps = test_sub_df["timestamp"].values

        print(f"\n--- Training Models for Horizon {h}m (Train prevalence: {np.mean(y_tr):.3f}, Val: {np.mean(y_val):.3f}, Test: {np.mean(y_te):.3f}) ---")

        for m_key, m_func in model_factories.items():
            print(f"Training {m_key} ({h}m)...")
            clf = m_func()
            clf.fit(X_tr, y_tr)

            # Predict probabilities on validation set for threshold selection
            p_val = clf.predict_proba(X_val)[:, 1]
            val_thresh, val_f1 = find_optimal_threshold_on_validation(y_val, p_val, metric="f1")

            # Predict probabilities on held-out test set
            p_te = clf.predict_proba(X_te)[:, 1]

            # Save model artifact
            model_file = os.path.join(artifacts_dir, f"model_{m_key}_{h}m.joblib")
            joblib.dump(clf, model_file)

            # Authoritative evaluation at decision threshold 0.50 (with val threshold recorded)
            metric = evaluate_authoritative(
                y_test=y_te,
                y_prob=p_te,
                episode_ids=test_ep_ids,
                model_name=m_key,
                horizon_minutes=h,
                decision_threshold=0.50,
                validation_tuned_threshold=val_thresh,
                validation_f1_at_tuned_threshold=val_f1,
                timestamps=test_timestamps,
                model_version="1.0.1",
            )
            all_metrics.append(metric)

            print(
                f"  [{m_key} {h}m] ROC-AUC: {metric['roc_auc']:.4f} | PR-AUC: {metric['pr_auc']:.4f} "
                f"| F1: {metric['f1_score']:.4f} (P: {metric['precision']:.4f}, R: {metric['recall']:.4f}) "
                f"| Brier: {metric['calibration']['brier_score']:.5f} | ECE: {metric['calibration']['expected_calibration_error']:.4f} "
                f"| FA Incidents/day: {metric['false_alarm_analysis']['false_alarm_incidents_per_day']:.2f} "
                f"(Minutes/day: {metric['false_alarm_analysis']['false_alarm_minutes_per_day']:.2f})"
            )

            # Feature importances for HistGradientBoosting
            if m_key == "hist_gradient_boosting":
                imp = explainer.compute_global_importance(clf, X_te, y_te, n_repeats=3)
                global_importances[f"{h}m"] = imp

        # Train auxiliary trend peak regressor
        print(f"Training trend peak regressor ({h}m)...")
        y_peak_tr = df_labeled.loc[train_h_mask, peak_name].values
        reg = HistGradientBoostingRegressor(max_iter=100, max_depth=6, random_state=seed)
        reg.fit(X_tr, y_peak_tr)
        reg_file = os.path.join(artifacts_dir, f"trend_regressor_{h}m.joblib")
        joblib.dump(reg, reg_file)

    # Save evaluation metrics
    metrics_path = os.path.join(artifacts_dir, "evaluation_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(
            {
                "threshold_pct": threshold,
                "horizons": HORIZONS,
                "metrics": all_metrics,
                "global_importances": global_importances,
                "dataset_stats": {
                    "total_rows": len(df_raw),
                    "total_episodes": int(df_raw["episode_id"].nunique()),
                    "train_episodes": len(train_eps),
                    "val_episodes": len(val_eps),
                    "test_episodes": len(test_eps),
                    "test_rows": int(test_mask.sum()),
                },
            },
            f,
            indent=2,
        )

    # Save metadata
    metadata = {
        "version": "1.0.1",
        "timestamp": datetime.utcnow().isoformat(),
        "random_seed": seed,
        "dataset_rows": len(df_raw),
        "target_threshold_ch4_pct": threshold,
        "feature_count": len(FEATURE_COLUMNS),
        "feature_names": FEATURE_COLUMNS,
        "models_trained": list(model_factories.keys()),
        "horizons": HORIZONS,
        "episodes": {
            "train": train_eps,
            "val": val_eps,
            "test": test_eps,
        },
        "disclaimer": "SYNTHETIC / SIMULATED DATA ONLY. Not certified for underground life-safety or real-world mine compliance.",
    }
    with open(os.path.join(artifacts_dir, "model_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print("\nTraining and evaluation successfully completed!")
    print(f"Artifacts saved in {artifacts_dir}")
    return {"metrics": all_metrics, "metadata": metadata}


if __name__ == "__main__":
    train_and_evaluate_all()
