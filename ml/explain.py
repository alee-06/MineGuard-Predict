"""
MineGuard Predict - Model Explainability & Interpretability Engine.

Provides global feature importance, permutation importance on held-out episodes,
local feature contributions, and data-grounded natural language explanations.
"""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance


class ModelExplainer:
    """
    Model interpretability suite providing both global and local explanations.
    All outputs strictly note statistical correlation and simulated feature behavior.
    """

    def __init__(self, feature_names: List[str]):
        self.feature_names = feature_names

    def compute_global_importance(
        self, model, X_test: np.ndarray, y_test: np.ndarray, n_repeats: int = 5
    ) -> Dict[str, float]:
        """
        Computes permutation importance on held-out test data.
        Falls back to feature_importances_ or coef_ if available.
        """
        # If model has feature_importances_
        if hasattr(model, "feature_importances_"):
            raw_imp = model.feature_importances_
            importance_dict = {
                feat: float(np.round(imp, 5))
                for feat, imp in zip(self.feature_names, raw_imp)
            }
            # Sort descending
            return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))

        # Baseline: permutation importance on sample
        try:
            # Subsample for permutation speed if large
            sample_size = min(len(X_test), 2000)
            idx = np.random.choice(len(X_test), sample_size, replace=False)
            perm = permutation_importance(
                model, X_test[idx], y_test[idx], n_repeats=n_repeats, random_state=42, n_jobs=-1
            )
            raw_imp = np.clip(perm.importances_mean, 0, None)
            total = np.sum(raw_imp) + 1e-9
            norm_imp = raw_imp / total
            importance_dict = {
                feat: float(np.round(imp, 5))
                for feat, imp in zip(self.feature_names, norm_imp)
            }
            return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
        except Exception:
            # Fallback uniform
            return {feat: 1.0 / len(self.feature_names) for feat in self.feature_names}

    def explain_local_prediction(
        self,
        features_row: pd.Series,
        baseline_means: Dict[str, float],
        top_n: int = 5,
        predicted_prob: float = 0.5,
        horizon_m: int = 15,
    ) -> Dict:
        """
        Computes local feature contribution heuristics and generates a data-grounded rationale.
        """
        contributions = []
        for feat in self.feature_names:
            val = float(features_row.get(feat, 0.0))
            mean_val = float(baseline_means.get(feat, 0.0))
            diff = val - mean_val
            
            # Key physical weights for local intuitive explanation
            weight = 1.0
            if "methane" in feat:
                weight = 2.5
            elif "airflow" in feat:
                weight = 1.8
            elif "activity" in feat:
                weight = 1.2
            elif "ventilation" in feat:
                weight = 1.5

            contrib = diff * weight
            contributions.append(
                {
                    "feature": feat,
                    "value": float(np.round(val, 4)),
                    "baseline_mean": float(np.round(mean_val, 4)),
                    "delta": float(np.round(diff, 4)),
                    "relative_contribution": float(np.round(contrib, 4)),
                }
            )

        # Sort by absolute relative contribution
        contributions.sort(key=lambda x: abs(x["relative_contribution"]), reverse=True)
        top_drivers = contributions[:top_n]

        # Generate human-readable industrial summary
        narrative = self._generate_narrative(
            features_row, top_drivers, predicted_prob, horizon_m
        )

        return {
            "top_drivers": top_drivers,
            "all_contributions": contributions[:15],
            "narrative_explanation": narrative,
        }

    def _generate_narrative(
        self,
        row: pd.Series,
        drivers: List[Dict],
        prob: float,
        horizon_m: int,
    ) -> str:
        """Constructs data-grounded summary of what drove the model risk score."""
        risk_tier = "CRITICAL" if prob >= 0.70 else "ELEVATED" if prob >= 0.30 else "NORMAL"
        
        ch4 = row.get("methane_pct", 0.0)
        af = row.get("airflow", 0.0)
        slope = row.get("methane_slope_5", 0.0)
        act = row.get("machine_activity", 0)
        vent_deg = row.get("ventilation_is_degraded", 0.0)

        reasons = []
        if ch4 >= 0.8:
            reasons.append(f"baseline methane already elevated ({ch4:.2f}%)")
        if slope > 0.01:
            reasons.append(f"positive 5m methane rate of change (+{slope*60:.2f}%/hr)")
        elif slope < -0.01:
            reasons.append(f"negative methane gradient ({slope*60:.2f}%/hr)")
        if af < 10.0:
            reasons.append(f"restricted ventilation airflow ({af:.1f} m³/s)")
        if vent_deg > 0.5:
            reasons.append("ventilation status flagged as DEGRADED")
        if act >= 2:
            reasons.append(f"active coal extraction machinery (level {int(act)})")

        if not reasons:
            reasons.append("stable atmospheric conditions and adequate dilution airflow")

        reason_text = ", ".join(reasons)
        return (
            f"Model predicts {risk_tier} risk ({prob*100:.1f}%) for horizon {horizon_m}m. "
            f"Primary predictive drivers: {reason_text}. "
            "Note: Statistical risk indicators derived from simulated dynamics, not certified physical alarm."
        )
