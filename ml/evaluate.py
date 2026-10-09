"""
MineGuard Predict - Authoritative Evaluation Engine.

Provides a unified, mathematically consistent evaluation function for all model architectures
and forecast horizons. Ensures every metric is computed from the exact same held-out labels,
predicted probabilities, and explicitly recorded decision thresholds.

Computes:
- Discrimination & Ranking: ROC-AUC, PR-AUC
- Thresholded Classification: Precision, Recall, F1-Score, Confusion Matrix
- Probability Calibration: Brier Score, Expected Calibration Error (ECE), Calibration Curve
- False Alarm Dynamics: Both false-positive minutes and discrete clustered incident counts
- Provenance & Traceability: Exact threshold, sample counts, positive prevalence, and data fingerprint
"""

import hashlib
import json
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


def compute_evaluation_fingerprint(
    episode_ids: Union[np.ndarray, List[str]],
    y_true: np.ndarray,
    timestamps: Optional[Union[np.ndarray, List[str]]] = None,
) -> str:
    """
    Computes a deterministic SHA-256 fingerprint of the evaluation dataset
    to ensure held-out data provenance and immutability.
    """
    hasher = hashlib.sha256()
    ep_str = ",".join(map(str, sorted(np.unique(episode_ids))))
    hasher.update(ep_str.encode("utf-8"))
    hasher.update(str(len(y_true)).encode("utf-8"))
    hasher.update(str(int(np.sum(y_true))).encode("utf-8"))
    if timestamps is not None and len(timestamps) > 0:
        hasher.update(str(timestamps[0]).encode("utf-8"))
        hasher.update(str(timestamps[-1]).encode("utf-8"))
    return hasher.hexdigest()[:16]


def calculate_expected_calibration_error(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> Tuple[float, List[Dict[str, float]]]:
    """
    Calculates Expected Calibration Error (ECE) and calibration curve points.
    ECE = sum_m (|B_m| / N) * |acc(B_m) - conf(B_m)|
    """
    bin_boundaries = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    curve_points = []
    n_total = len(y_true)

    for i in range(n_bins):
        low = bin_boundaries[i]
        high = bin_boundaries[i + 1]
        if i == n_bins - 1:
            in_bin = (y_prob >= low) & (y_prob <= high)
        else:
            in_bin = (y_prob >= low) & (y_prob < high)

        count = int(np.sum(in_bin))
        if count > 0:
            avg_pred = float(np.mean(y_prob[in_bin]))
            acc = float(np.mean(y_true[in_bin]))
            weight = count / n_total
            ece += weight * abs(acc - avg_pred)
            curve_points.append(
                {
                    "bin_index": i,
                    "bin_range": f"{low:.1f}-{high:.1f}",
                    "count": count,
                    "predicted_prob": float(np.round(avg_pred, 4)),
                    "true_prob": float(np.round(acc, 4)),
                }
            )

    return float(np.round(ece, 5)), curve_points


def count_discrete_alarm_incidents(
    is_false_alarm: np.ndarray,
    episode_ids: np.ndarray,
    timestamps: Optional[np.ndarray] = None,
    tolerance_gap_minutes: int = 0,
) -> int:
    """
    Groups consecutive false-alarm minutes within each episode into discrete incidents.
    
    Rule:
    - A false alarm occurs at time step t when y_pred=1 and y_true=0.
    - Contiguous false-alarm minutes within the same episode belong to 1 incident.
    - If tolerance_gap_minutes > 0, separate warning runs separated by <= tolerance_gap_minutes
      are merged into a single continued alert incident.
    """
    total_incidents = 0
    unique_eps = np.unique(episode_ids)

    for ep in unique_eps:
        ep_mask = episode_ids == ep
        ep_fa = is_false_alarm[ep_mask]

        if not np.any(ep_fa):
            continue

        indices = np.where(ep_fa)[0]
        if len(indices) == 0:
            continue

        # Group runs of false alarms
        incidents_in_ep = 1
        last_idx = indices[0]

        for idx in indices[1:]:
            gap = idx - last_idx - 1
            if gap > tolerance_gap_minutes:
                incidents_in_ep += 1
            last_idx = idx

        total_incidents += incidents_in_ep

    return total_incidents


def find_optimal_threshold_on_validation(
    y_val: np.ndarray,
    y_val_prob: np.ndarray,
    metric: str = "f1",
) -> Tuple[float, float]:
    """
    Finds the optimal decision threshold on the validation split.
    Guarantees zero leakage: this threshold is chosen on validation only,
    never tuned against test outcomes.
    """
    thresholds = np.linspace(0.10, 0.90, 81)
    best_thresh = 0.50
    best_score = -1.0

    for t in thresholds:
        y_pred = (y_val_prob >= t).astype(int)
        if metric == "f1":
            score = f1_score(y_val, y_pred, zero_division=0)
        elif metric == "precision":
            score = precision_score(y_val, y_pred, zero_division=0)
        elif metric == "recall":
            score = recall_score(y_val, y_pred, zero_division=0)
        else:
            score = f1_score(y_val, y_pred, zero_division=0)

        if score > best_score:
            best_score = score
            best_thresh = t

    return float(np.round(best_thresh, 4)), float(np.round(best_score, 4))


def evaluate_authoritative(
    y_test: np.ndarray,
    y_prob: np.ndarray,
    episode_ids: np.ndarray,
    model_name: str,
    horizon_minutes: int,
    decision_threshold: float = 0.50,
    validation_tuned_threshold: Optional[float] = None,
    validation_f1_at_tuned_threshold: Optional[float] = None,
    timestamps: Optional[np.ndarray] = None,
    model_version: str = "1.0.1",
) -> Dict:
    """
    The authoritative evaluation function for MineGuard Predict.
    Calculates all metrics from the identical held-out labels, probabilities, and thresholds.
    """
    n_samples = len(y_test)
    n_positives = int(np.sum(y_test))
    n_negatives = int(n_samples - n_positives)
    target_prevalence = float(np.round(n_positives / max(1, n_samples), 4))

    # Binary predictions using the explicitly recorded threshold
    y_pred = (y_prob >= decision_threshold).astype(int)

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

    # Core classification metrics
    precision = float(np.round(precision_score(y_test, y_pred, zero_division=0), 4))
    recall = float(np.round(recall_score(y_test, y_pred, zero_division=0), 4))
    f1 = float(np.round(f1_score(y_test, y_pred, zero_division=0), 4))

    # Discrimination metrics
    has_two_classes = len(np.unique(y_test)) > 1
    roc_auc = float(np.round(roc_auc_score(y_test, y_prob), 4)) if has_two_classes else 0.50
    pr_auc = float(np.round(average_precision_score(y_test, y_prob), 4)) if has_two_classes else 0.0

    # Calibration metrics
    brier = float(np.round(brier_score_loss(y_test, y_prob), 5))
    ece, cal_curve_points = calculate_expected_calibration_error(y_test, y_prob, n_bins=10)

    # False alarm metrics (distinguishing time steps/minutes from discrete incidents)
    simulated_days = max(1.0, n_samples / 1440.0)
    is_false_alarm = (y_pred == 1) & (y_test == 0)
    
    # 1. Total false alarm minutes (individual time steps)
    false_alarm_minutes = int(fp)
    false_alarm_minutes_per_day = float(np.round(false_alarm_minutes / simulated_days, 2))

    # 2. Discrete false alarm incidents (contiguous clusters within each episode)
    false_alarm_incidents = count_discrete_alarm_incidents(
        is_false_alarm=is_false_alarm,
        episode_ids=episode_ids,
        tolerance_gap_minutes=0,
    )
    false_alarm_incidents_per_day = float(np.round(false_alarm_incidents / simulated_days, 2))

    # 3. Discrete false alarm incidents with 5-minute tolerance gap merge
    false_alarm_incidents_merged_5m = count_discrete_alarm_incidents(
        is_false_alarm=is_false_alarm,
        episode_ids=episode_ids,
        tolerance_gap_minutes=5,
    )
    false_alarm_incidents_merged_5m_per_day = float(np.round(false_alarm_incidents_merged_5m / simulated_days, 2))

    # Average false alarm duration
    avg_incident_duration = (
        float(np.round(false_alarm_minutes / max(1, false_alarm_incidents), 1))
        if false_alarm_incidents > 0
        else 0.0
    )

    # Subsampled curves for compact JSON & UI charting
    fpr, tpr, _ = roc_curve(y_test, y_prob)
    step_roc = max(1, len(fpr) // 25)
    roc_points = [
        {"fpr": float(np.round(fpr[i], 4)), "tpr": float(np.round(tpr[i], 4))}
        for i in range(0, len(fpr), step_roc)
    ]

    p_vals, r_vals, _ = precision_recall_curve(y_test, y_prob)
    step_pr = max(1, len(p_vals) // 25)
    pr_points = [
        {"recall": float(np.round(r_vals[i], 4)), "precision": float(np.round(p_vals[i], 4))}
        for i in range(0, len(p_vals), step_pr)
    ]

    # Data fingerprint
    fingerprint = compute_evaluation_fingerprint(episode_ids, y_test, timestamps)

    return {
        "model_name": model_name,
        "horizon_minutes": horizon_minutes,
        "model_version": model_version,
        "decision_threshold": float(np.round(decision_threshold, 4)),
        "validation_tuned_threshold": validation_tuned_threshold,
        "validation_f1_at_tuned_threshold": validation_f1_at_tuned_threshold,
        "sample_counts": {
            "total_samples": n_samples,
            "positive_samples": n_positives,
            "negative_samples": n_negatives,
            "simulated_days": float(np.round(simulated_days, 2)),
            "target_prevalence": target_prevalence,
        },
        "classification_metrics": {
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
        },
        # Backwards compatible flat fields for UI tables
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "confusion_matrix": {
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "tp": tp,
        },
        "calibration": {
            "brier_score": brier,
            "expected_calibration_error": ece,
            "calibration_curve": cal_curve_points,
            "calibration_description": (
                "Evaluates alignment between predicted confidence scores and empirical event frequencies. "
                "Lower Brier score and ECE indicate superior probability calibration."
            ),
        },
        "false_alarm_analysis": {
            "false_alarm_minutes": false_alarm_minutes,
            "false_alarm_minutes_per_day": false_alarm_minutes_per_day,
            "false_alarm_incidents": false_alarm_incidents,
            "false_alarm_incidents_per_day": false_alarm_incidents_per_day,
            "false_alarm_incidents_merged_5m": false_alarm_incidents_merged_5m,
            "false_alarm_incidents_merged_5m_per_day": false_alarm_incidents_merged_5m_per_day,
            "average_incident_duration_minutes": avg_incident_duration,
            "alert_merging_rule": (
                "Contiguous false-positive minutes within the same episode are grouped into a single alert incident. "
                "Merged incidents combine alerts with gaps <= 5 minutes."
            ),
        },
        # Flat legacy key for existing UI components
        "false_alarms_per_day": false_alarm_incidents_per_day,
        "false_alarm_minutes_per_day": false_alarm_minutes_per_day,
        "target_prevalence": target_prevalence,
        "roc_curve": roc_points,
        "pr_curve": pr_points,
        "calibration_curve": [
            {"predicted_prob": p["predicted_prob"], "true_prob": p["true_prob"]}
            for p in cal_curve_points
        ],
        "eval_data_fingerprint": fingerprint,
    }
