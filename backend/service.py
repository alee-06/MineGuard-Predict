"""
MineGuard Predict - Backend Data and Inference Service Singleton.

Maintains cached in-memory access to active dataset, dynamic historical analytics,
trained models, and live/demo telemetry streaming for responsive API responses.
"""

import json
import os
from typing import Dict, List, Optional
import pandas as pd
import numpy as np

from ml.features import FEATURE_COLUMNS
from ml.generator import DEFAULT_ZONES, SCENARIO_TYPES, GeneratorConfig, MineTelemetryGenerator
from ml.inference import Predictor
from ml.labels import DEFAULT_THRESHOLD_PCT, HORIZONS
from ml.events import detect_events_in_dataframe


DATA_PATH_STANDARD = "data/generated/synthetic_mine_sensors_150k.csv"
DATA_PATH_DEMO = "data/demo_mine_sensors.csv"
ARTIFACTS_DIR = "artifacts"


class DataService:
    _instance = None

    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self.active_dataset_name: str = "synthetic_mine_sensors_150k.csv"
        self.active_dataset_type: str = "STANDARD_SIMULATION"
        self.active_dataset_path: str = DATA_PATH_STANDARD
        self.active_worksheet: Optional[str] = None
        self.predictor: Optional[Predictor] = None
        self.metrics_data: Optional[Dict] = None
        self.metadata: Optional[Dict] = None
        self.cached_events: Optional[List[Dict]] = None
        
        # Live monitoring demo state
        self.is_demo_mode: bool = False
        self.demo_episode_id: str = "EP-0001"
        self.demo_start_step: int = 372
        self.demo_hazard_step: int = 383
        self.demo_max_step: int = 432
        self.demo_step_index: int = 372  # Step within demo shift
        
        self.load()

    def advance_demo_step(self, increment: int = 1) -> int:
        """Advances the live demo simulation by increment steps, looping seamlessly at cycle end."""
        self.demo_step_index += increment
        if self.demo_step_index > self.demo_max_step:
            self.demo_step_index = self.demo_start_step
        return self.demo_step_index

    def reset_demo(self, step: Optional[int] = None) -> int:
        """Resets the demo simulation to baseline."""
        self.demo_step_index = step if step is not None else self.demo_start_step
        return self.demo_step_index

    def jump_to_hazard(self) -> int:
        """Fast-forwards to developing hazard buildup where ML advance risk spikes."""
        self.demo_step_index = self.demo_hazard_step
        return self.demo_step_index

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = DataService()
        return cls._instance

    def load(self):
        """Loads models, metadata, and default dataset."""
        # Load models
        scaler_file = os.path.join(ARTIFACTS_DIR, "scaler.joblib")
        if os.path.exists(scaler_file):
            try:
                self.predictor = Predictor(ARTIFACTS_DIR)
                print("Predictor loaded successfully.")
            except Exception as e:
                print(f"Failed to load predictor: {e}")
                self.predictor = None
        else:
            self.predictor = None

        metrics_file = os.path.join(ARTIFACTS_DIR, "evaluation_metrics.json")
        if os.path.exists(metrics_file):
            with open(metrics_file, "r") as f:
                self.metrics_data = json.load(f)
        else:
            self.metrics_data = None

        meta_file = os.path.join(ARTIFACTS_DIR, "model_metadata.json")
        if os.path.exists(meta_file):
            with open(meta_file, "r") as f:
                self.metadata = json.load(f)
        else:
            self.metadata = None

        # Prefer standard 150k if available, else demo dataset
        if os.path.exists(DATA_PATH_STANDARD):
            self.load_dataset(DATA_PATH_STANDARD, "synthetic_mine_sensors_150k.csv", "STANDARD_SIMULATION")
        elif os.path.exists(DATA_PATH_DEMO):
            self.load_dataset(DATA_PATH_DEMO, "demo_mine_sensors.csv", "DEMO_CURATED")
        else:
            print("No sensor dataset currently available.")
            self.df = None

    def load_dataset(self, file_path: str, dataset_name: str, dataset_type: str, worksheet: Optional[str] = None):
        """Loads and activates a dataset from file path."""
        print(f"Loading dataset from {file_path} (Type: {dataset_type}, Worksheet: {worksheet})...")
        if file_path.endswith(".xlsx") or file_path.endswith(".xls"):
            df = pd.read_excel(file_path, sheet_name=worksheet or 0)
        else:
            df = pd.read_csv(file_path)

        self.activate_dataframe(df, dataset_name, dataset_type, file_path, worksheet)

    def activate_dataframe(
        self,
        df: pd.DataFrame,
        dataset_name: str,
        dataset_type: str,
        file_path: Optional[str] = None,
        worksheet: Optional[str] = None,
    ):
        """Activates and standardizes a DataFrame as the active operational dataset."""
        df = df.copy()
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

        # Drop invalid timestamps
        df = df.dropna(subset=["timestamp"]).sort_values(by=["timestamp", "zone_id"]).reset_index(drop=True)

        self.df = df
        self.active_dataset_name = dataset_name
        self.active_dataset_type = dataset_type
        self.active_dataset_path = file_path or ""
        self.active_worksheet = worksheet

        # Precompute events cache for snappy responses
        self.cached_events = detect_events_in_dataframe(self.df, threshold_pct=1.0)
        print(f"Dataset activated: {len(self.df)} rows, {len(self.cached_events)} events detected.")

    def load_demo_dataset(self):
        """Loads and activates the prepared demonstration dataset."""
        if os.path.exists(DATA_PATH_DEMO):
            self.load_dataset(DATA_PATH_DEMO, "demo_mine_sensors.csv", "DEMO_CURATED")
        else:
            # Fallback to standard
            if os.path.exists(DATA_PATH_STANDARD):
                self.load_dataset(DATA_PATH_STANDARD, "synthetic_mine_sensors_150k.csv", "STANDARD_SIMULATION")

    def get_metadata(self) -> Dict:
        """Returns metadata about the currently active dataset."""
        if self.df is None or len(self.df) == 0:
            return {
                "active_dataset_name": "None",
                "active_dataset_type": "NOT_LOADED",
                "total_rows": 0,
                "total_episodes": 0,
                "total_zones": 0,
                "zones": [],
                "time_range": {"start": "N/A", "end": "N/A"},
                "has_exceedances": False,
            }

        return {
            "active_dataset_name": self.active_dataset_name,
            "active_dataset_type": self.active_dataset_type,
            "active_worksheet": self.active_worksheet,
            "total_rows": len(self.df),
            "total_episodes": int(self.df["episode_id"].nunique()) if "episode_id" in self.df.columns else 1,
            "total_zones": int(self.df["zone_id"].nunique()),
            "zones": sorted(self.df["zone_id"].unique().tolist()),
            "time_range": {
                "start": str(self.df["timestamp"].min()),
                "end": str(self.df["timestamp"].max()),
            },
            "has_exceedances": bool((self.df["methane_pct"] >= 1.0).any()),
            "total_events": len(self.cached_events) if self.cached_events else 0,
        }


# Module-level accessor
def get_service() -> DataService:
    return DataService.get_instance()
