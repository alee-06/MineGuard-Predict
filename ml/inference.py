"""
MineGuard Predict - Inference Engine.

Provides unified prediction across 5m, 15m, and 30m forecast horizons,
local feature explanations, and predicted future methane concentration trend.
"""

import json
import os
from typing import Dict, List, Optional
import joblib
import numpy as np
import pandas as pd

from ml.explain import ModelExplainer
from ml.features import FEATURE_COLUMNS, extract_features_single_window
from ml.labels import HORIZONS


class Predictor:
    """
    Production inference service wrapping trained classifiers and trend regressors.
    """

    def __init__(self, artifacts_dir: str = "artifacts"):
        self.artifacts_dir = artifacts_dir
        self.scaler = joblib.load(os.path.join(artifacts_dir, "scaler.joblib"))

        # Load baseline means for local explainability
        baselines_path = os.path.join(artifacts_dir, "feature_baselines.json")
        if os.path.exists(baselines_path):
            with open(baselines_path, "r") as f:
                self.baseline_means = json.load(f)
        else:
            self.baseline_means = {feat: 0.0 for feat in FEATURE_COLUMNS}

        self.explainer = ModelExplainer(FEATURE_COLUMNS)

        # Cache loaded models: (model_type, horizon) -> model
        self.models: Dict[str, Dict[int, any]] = {}
        self.trend_regressors: Dict[int, any] = {}

        for h in HORIZONS:
            reg_path = os.path.join(artifacts_dir, f"trend_regressor_{h}m.joblib")
            if os.path.exists(reg_path):
                self.trend_regressors[h] = joblib.load(reg_path)

        for m_type in ["hist_gradient_boosting", "random_forest", "logistic_regression"]:
            self.models[m_type] = {}
            for h in HORIZONS:
                m_path = os.path.join(artifacts_dir, f"model_{m_type}_{h}m.joblib")
                if os.path.exists(m_path):
                    self.models[m_type][h] = joblib.load(m_path)

    def predict(
        self,
        recent_records: List[Dict],
        model_type: str = "hist_gradient_boosting",
        preferred_horizon: int = 15,
    ) -> Dict:
        """
        Runs multi-horizon inference on recent sequence of records up to time t.
        Separates classification probability from expected concentration.
        """
        if len(recent_records) < 1:
            raise ValueError("Inference requires at least 1 recent record (ideally 15-30 records for lags).")

        df_feat = extract_features_single_window(recent_records)
        latest_features_row = df_feat.iloc[0]
        curr_ch4 = float(latest_features_row.get("methane_pct", 0.0))

        X_scaled = self.scaler.transform(df_feat.values)

        horizons_result = {}
        for h in HORIZONS:
            clf = self.models.get(model_type, {}).get(h)
            if clf is None:
                continue

            prob = float(clf.predict_proba(X_scaled)[0, 1])
            prob_round = float(np.round(prob, 4))

            # Risk classification tier based on calibrated demo thresholds
            risk_tier = "CRITICAL" if prob >= 0.70 else "ELEVATED" if prob >= 0.30 else "NORMAL"

            # Future expected peak methane concentration from regressor
            reg = self.trend_regressors.get(h)
            if reg is not None:
                predicted_peak_ch4 = float(np.round(reg.predict(X_scaled)[0], 3))
            else:
                # Fallback simple projection
                predicted_peak_ch4 = curr_ch4

            if predicted_peak_ch4 > curr_ch4 + 0.06:
                trend_direction = "RISING"
            elif predicted_peak_ch4 < curr_ch4 - 0.06:
                trend_direction = "FALLING"
            else:
                trend_direction = "STABLE"

            horizons_result[f"{h}m"] = {
                "horizon_minutes": h,
                "probability": prob_round,
                "risk_tier": risk_tier,
                "predicted_peak_methane_pct": predicted_peak_ch4,
                "trend_direction": trend_direction,
                "delta_from_current": float(np.round(predicted_peak_ch4 - curr_ch4, 3)),
            }

        # Local explanation for the preferred horizon
        pref_prob = horizons_result.get(f"{preferred_horizon}m", {}).get("probability", 0.5)
        explanation = self.explainer.explain_local_prediction(
            latest_features_row,
            self.baseline_means,
            top_n=5,
            predicted_prob=pref_prob,
            horizon_m=preferred_horizon,
        )

        return {
            "current_time": recent_records[-1].get("timestamp"),
            "current_methane_pct": curr_ch4,
            "current_airflow": float(latest_features_row.get("airflow", 0.0)),
            "model_type": model_type,
            "horizons": horizons_result,
            "explanation": explanation,
            "features_summary": {
                "methane_slope_5": float(np.round(latest_features_row.get("methane_slope_5", 0.0), 4)),
                "methane_diff_15": float(np.round(latest_features_row.get("methane_diff_15", 0.0), 4)),
                "airflow_roll_mean_15": float(np.round(latest_features_row.get("airflow_roll_mean_15", 0.0), 2)),
                "machine_activity": int(latest_features_row.get("machine_activity", 0)),
                "ventilation_is_degraded": bool(latest_features_row.get("ventilation_is_degraded", 0.0) > 0.5),
            },
        }
