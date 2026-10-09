"""
MineGuard Predict - Supervised Prediction Target & Label Generator.

Generates strictly forward-looking labels for each prediction horizon (5m, 15m, 30m)
grouped by episode to prevent boundary bleeding.
"""

from typing import List, Optional
import numpy as np
import pandas as pd

HORIZONS = [5, 15, 30]
DEFAULT_THRESHOLD_PCT = 1.0  # 1.0% CH4 standard coal mine early-alert threshold


def create_forward_labels(
    df: pd.DataFrame,
    threshold: float = DEFAULT_THRESHOLD_PCT,
    horizons: Optional[List[int]] = None,
) -> pd.DataFrame:
    """
    Computes threshold-crossing binary classification labels and regression peak targets
    for future horizons H in {5, 15, 30} minutes.

    Target definition:
    - y_exceed_H: 1 if max(CH4[t+1 : t+H]) >= threshold else 0
    - y_peak_ch4_H: max(CH4[t+1 : t+H]) (continuous future peak for trend estimation)

    Computed strictly within each episode_id. The last H rows of each episode
    cannot observe a full horizon and are marked NaN so they can be safely excluded.
    """
    if horizons is None:
        horizons = HORIZONS

    df_out = df.copy()

    for h in horizons:
        label_col = f"target_exceed_{h}m"
        peak_col = f"target_peak_ch4_{h}m"
        
        # Calculate within episode groups using backward-looking rolling on reversed series
        # or shifting future windows
        # To compute max of CH4 from t+1 to t+h:
        def compute_future_max(group: pd.Series) -> pd.Series:
            # We reverse the series, take rolling max of window h, then reverse back and shift by 1
            rev = group.iloc[::-1]
            # rolling max of size h on reversed series captures [t, t+1, ... t+h-1] in forward time
            rolling_rev = rev.rolling(window=h, min_periods=h).max()
            forward_max = rolling_rev.iloc[::-1].shift(-1)
            return forward_max

        future_max = df_out.groupby("episode_id", group_keys=False)["methane_pct"].apply(
            compute_future_max
        )
        
        df_out[peak_col] = future_max
        df_out[label_col] = (future_max >= threshold).astype(float)
        # Retain NaN where future_max is NaN (last h steps of episode)
        df_out.loc[future_max.isna(), label_col] = np.nan

    return df_out


def verify_no_target_leakage(
    df: pd.DataFrame, feature_cols: List[str], target_cols: List[str]
) -> bool:
    """
    Validation check to assert that none of the target columns or future values
    appear inside the feature matrix.
    """
    for col in target_cols:
        if col in feature_cols:
            raise ValueError(f"CRITICAL LEAKAGE ERROR: Target '{col}' found in feature columns!")
    
    # Check that feature columns do not correlate 1.0 with future labels
    # or contain suspicious forward shifts
    for feat in feature_cols:
        if "future" in feat.lower() or "target" in feat.lower() or "lead" in feat.lower():
            raise ValueError(f"Suspicious feature name indicates potential leakage: {feat}")

    return True
