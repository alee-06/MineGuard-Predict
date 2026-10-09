export interface HorizonPrediction {
  horizon_minutes: number;
  probability: number;
  risk_tier: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  predicted_peak_methane_pct: number;
  trend_direction: 'RISING' | 'FALLING' | 'STABLE';
  delta_from_current: number;
}

export interface LocalExplanationDriver {
  feature: string;
  value: number;
  baseline_mean: number;
  delta: number;
  relative_contribution: number;
}

export interface PredictionResponse {
  current_time?: string;
  current_methane_pct: number;
  current_airflow: number;
  model_type: string;
  horizons: {
    '5m': HorizonPrediction;
    '15m': HorizonPrediction;
    '30m': HorizonPrediction;
  };
  explanation: {
    top_drivers: LocalExplanationDriver[];
    all_contributions: LocalExplanationDriver[];
    narrative_explanation: string;
  };
  features_summary: {
    methane_slope_5: number;
    methane_diff_15: number;
    airflow_roll_mean_15: number;
    machine_activity: number;
    ventilation_is_degraded: boolean;
  };
}

export interface OverviewData {
  status: string;
  dataset_name: string;
  total_records: number;
  total_episodes: number;
  total_zones: number;
  simulated_days: number;
  time_range: { start: string; end: string };
  threshold_crossing_events: number;
  threshold_exceedance_minutes?: number;
  threshold_exceedance_percentage?: number;
  highest_risk_zone: string;
  highest_risk_zone_name?: string;
  zone_rankings: Array<{
    zone_id: string;
    zone_name?: string;
    event_count: number;
    peak_methane: number;
    avg_methane: number;
    avg_airflow: number;
    risk_index: number;
  }>;
  scenario_event_breakdown: Record<string, number>;
  model_readiness: {
    model_ready: boolean;
    version: string;
    timestamp: string;
    horizons: number[];
    threshold_pct: number;
  };
  flagship_metrics: {
    flagship_model?: string;
    horizon_minutes?: number;
    decision_threshold?: number;
    validation_tuned_threshold?: number;
    validation_f1_at_tuned_threshold?: number;
    roc_auc?: number;
    pr_auc?: number;
    f1_score?: number;
    precision?: number;
    recall?: number;
    brier_score?: number;
    expected_calibration_error?: number;
    ece?: number;
    false_alarms_per_day?: number;
    false_alarm_incidents_per_day?: number;
    false_alarm_minutes_per_day?: number;
    false_alarm_analysis?: {
      false_alarm_minutes: number;
      false_alarm_minutes_per_day: number;
      false_alarm_incidents: number;
      false_alarm_incidents_per_day: number;
      false_alarm_incidents_merged_5m: number;
      false_alarm_incidents_merged_5m_per_day: number;
      average_incident_duration_minutes: number;
      alert_merging_rule: string;
    };
    confusion_matrix?: {
      tn: number;
      fp: number;
      fn: number;
      tp: number;
    };
    sample_counts?: {
      total_samples: number;
      positive_samples: number;
      negative_samples: number;
      simulated_days: number;
      target_prevalence: number;
    };
    eval_data_fingerprint?: string;
  };
  synthetic_notice: string;
}

export interface ReplayEpisodeItem {
  episode_id: string;
  zone_id: string;
  scenario_type: string;
  hazard_category?: string;
  duration_minutes: number;
  peak_methane_pct: number;
  has_threshold_crossing: boolean;
  start_time: string;
}

export interface ReplayStepResponse {
  episode_id: string;
  current_index: number;
  total_steps: number;
  current_telemetry: {
    timestamp: string;
    zone_id: string;
    episode_id: string;
    methane_pct: number;
    airflow: number;
    temperature_c: number;
    humidity_pct: number;
    pressure_kpa: number;
    machine_activity: number;
    ventilation_state: string;
    scenario_type: string;
  };
  prediction: PredictionResponse;
  past_revealed_outcome: {
    evaluated_step_index: number;
    evaluated_timestamp: string;
    predicted_probability: number;
    actual_observed_peak_ch4: number;
    threshold_exceeded: boolean;
    eval_category: 'TRUE_POSITIVE' | 'FALSE_ALARM' | 'MISSED_EVENT' | 'TRUE_NEGATIVE';
  } | null;
}

export interface TemporalAnalyticsData {
  heatmap: Array<{
    day_idx: number;
    day_name: string;
    hour: number;
    avg_methane: number;
    peak_methane: number;
    event_rate: number;
    count: number;
  }>;
  hourly_profile: Array<{
    hour: number;
    avg_methane: number;
    events: number;
  }>;
  concentration_distribution: Array<{
    bin: string;
    count: number;
    pct: number;
  }>;
  zone_distribution: Array<{
    zone_id: string;
    total_records: number;
    exceedance_minutes: number;
    exceedance_pct: number;
    mean_methane: number;
    peak_methane: number;
  }>;
  duration_distribution: Array<{
    duration_range: string;
    count: number;
  }>;
  scenario_comparison: Array<{
    scenario_type: string;
    records: number;
    avg_methane: number;
    avg_airflow: number;
    exceedance_pct: number;
    peak_methane: number;
  }>;
  total_analyzed_records: number;
}

export interface ZoneItem {
  zone_id: string;
  current_methane_pct: number;
  current_airflow: number;
  current_temperature_c: number;
  current_pressure_kpa: number;
  machine_activity: number;
  ventilation_state: string;
  recent_trend: 'RISING' | 'FALLING' | 'STABLE';
  slope_15m: number;
  risk_score: number;
  risk_category: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  predictions: Record<string, HorizonPrediction>;
  historical_events_count: number;
  historical_exceedance_minutes: number;
  historical_peak_methane: number;
  contributing_drivers: LocalExplanationDriver[];
  schematic_position: { x: number; y: number; type: string };
}

export interface BenchmarkModelMetric {
  model_name: string;
  horizon_minutes: number;
  model_version?: string;
  decision_threshold?: number;
  validation_tuned_threshold?: number;
  validation_f1_at_tuned_threshold?: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  pr_auc: number;
  false_alarms_per_day: number;
  false_alarm_analysis?: {
    false_alarm_minutes: number;
    false_alarm_minutes_per_day: number;
    false_alarm_incidents: number;
    false_alarm_incidents_per_day: number;
    false_alarm_incidents_merged_5m: number;
    false_alarm_incidents_merged_5m_per_day: number;
    average_incident_duration_minutes: number;
    alert_merging_rule: string;
  };
  calibration?: {
    brier_score: number;
    expected_calibration_error: number;
    calibration_description?: string;
    calibration_curve?: Array<{
      bin_index: number;
      bin_range: string;
      count: number;
      predicted_prob: number;
      true_prob: number;
    }>;
  };
  sample_counts?: {
    total_samples: number;
    positive_samples: number;
    negative_samples: number;
    simulated_days: number;
    target_prevalence: number;
  };
  eval_data_fingerprint?: string;
  confusion_matrix: {
    tn: number;
    fp: number;
    fn: number;
    tp: number;
  };
  target_prevalence: number;
  roc_curve: Array<{ fpr: number; tpr: number }>;
  pr_curve: Array<{ recall: number; precision: number }>;
  calibration_curve: Array<{ predicted_prob: number; true_prob: number }>;
}

export interface AnomalyEventItem {
  event_id: string;
  episode_id: string;
  zone_id: string;
  category: string;
  timestamp: string;
  step_index: number;
  peak_value: number;
  rate_of_increase_pct_min: number;
  duration_minutes: number;
  scenario_type: string;
  description: string;
}

// ==========================================
// Workspace 1 — Live Monitoring Interfaces
// ==========================================

export interface LiveStatusResponse {
  is_hardware_connected: boolean;
  connection_status_text: string;
  threshold_pct: number;
  is_demo_mode: boolean;
  demo_episode_id: string;
  demo_step_index: number;
  demo_max_step?: number;
  active_dataset: string;
  total_zones: number;
}

export interface LiveOverviewResponse {
  is_hardware_connected: boolean;
  connection_state?: string;
  status_message: string;
  is_demo_mode: boolean;
  demo_simulation_active?: boolean;
  threshold_pct: number;
  configured_threshold_pct?: number;
  zones_monitored_count: number;
  monitored_areas_count?: number;
  active_warning_zones_count: number;
  areas_meeting_warning_criteria?: number;
  rising_gas_zones_count: number;
  areas_with_rising_gas?: number;
  priority_alert: {
    zone_id: string;
    zone_name: string;
    severity: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
    current_methane: number;
    peak_methane: number;
    trend: string;
    recommendation: string;
    minutes_active: number;
  } | null;
  priority_warning?: any;
  watchlist: Array<{
    zone_id: string;
    zone_name: string;
    current_methane: number;
    current_methane_pct?: number;
    current_airflow: number;
    trend: string;
    recent_trend?: string;
    status: string;
    risk_level: string;
    risk_tier?: string;
    forecast_30m_prob: number;
    risk_5m?: number;
    risk_15m?: number;
    risk_30m?: number;
    active_incident: boolean;
    slope_15m?: number;
    last_reading_time?: string;
    top_drivers?: Array<{ name: string; weight: number }>;
  }>;
  area_watchlist?: any[];
  active_warnings?: any[];
  latest_reading_time?: string;
  live_stream?: {
    zone_id: string;
    zone_name: string;
    current_methane: number;
    current_airflow: number;
    step_index: number;
    max_step?: number;
    simulated_time: string;
    points: Array<{
      timestamp: string;
      time_label: string;
      methane_pct: number;
      airflow: number;
      is_crossing: boolean;
    }>;
  };
}

export interface LiveTrendsResponse {
  zone_id: string;
  zone_name: string;
  current_methane: number;
  current_airflow: number;
  trend_direction: string;
  threshold_pct: number;
  observed_events_count: number;
  history: Array<{
    timestamp: string;
    methane_pct: number;
    airflow: number;
    is_crossing: boolean;
  }>;
  observed_events: Array<{
    event_id: string;
    category: string;
    peak_methane: number;
    duration_minutes: number;
    description: string;
    timestamp: string;
  }>;
  forecast: {
    current_methane: number;
    '5m': {
      probability: number;
      risk_tier: string;
      predicted_peak: number;
      alert_triggered: boolean;
    };
    '15m': {
      probability: number;
      risk_tier: string;
      predicted_peak: number;
      alert_triggered: boolean;
    };
    '30m': {
      probability: number;
      risk_tier: string;
      predicted_peak: number;
      alert_triggered: boolean;
    };
    lead_time_minutes: number;
    operational_recommendation: string;
    confidence_level: string;
    key_drivers: Array<{
      feature: string;
      label: string;
      effect: string;
    }>;
  };
}

export interface LiveWarningsResponse {
  threshold_pct: number;
  total_warnings: number;
  active_count: number;
  warnings: Array<{
    event_id: string;
    zone_id: string;
    zone_name: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    peak_methane: number;
    severity: 'CRITICAL' | 'ELEVATED' | 'MODERATE';
    description: string;
    current_status: string;
    observed_outcome: string;
  }>;
}

// ==========================================
// Workspace 2 — Historical Risk Interfaces
// ==========================================

export interface HistoricalMetaResponse {
  dataset_name: string;
  total_records: number;
  time_range: {
    start: string;
    end: string;
  };
  zones: string[];
  threshold_pct: number;
  total_detected_events: number;
  total_crossings: number;
}

export interface HistoricalPeriodAnalysisResponse {
  summary: {
    analyzed_records: number;
    time_range: {
      start: string;
      end: string;
    };
    zone_id: string;
    threshold_pct: number;
    crossing_events_count: number;
    total_exceedance_minutes: number;
    exceedance_percentage: number;
    peak_observed_methane: number;
    average_methane: number;
    average_airflow: number;
    elevated_forecast_points: number;
  };
  timeline: Array<{
    timestamp: string;
    methane_pct: number;
    airflow: number;
    is_crossing: boolean;
    is_surge: boolean;
  }>;
  observed_crossings: Array<{
    event_id: string;
    zone_id: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    peak_methane: number;
    severity: string;
    description: string;
  }>;
  forecast_comparison: {
    horizon_requested: string;
    model_used: string;
    high_risk_lead_points: number;
    average_predicted_prob: number;
    peak_predicted_prob: number;
    operational_readiness_index: number;
    horizon_breakdown: Record<
      string,
      {
        elevated_pct: number;
        alert_count: number;
        avg_probability: number;
      }
    >;
  };
  risk_by_area: Array<{
    zone_id: string;
    zone_name: string;
    records: number;
    crossing_count: number;
    peak_methane: number;
    avg_methane: number;
    avg_airflow: number;
    risk_tier: string;
  }>;
  preparation_guidance: Array<{
    priority: 'IMMEDIATE' | 'PREVENTATIVE' | 'INFORMATIONAL';
    title: string;
    detail: string;
    target_area: string;
  }>;
}

export interface HistoricalEventsResponse {
  total_events: number;
  category_counts: Record<string, number>;
  events: Array<{
    event_id: string;
    category: string;
    zone_id: string;
    zone_name: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    peak_value: number;
    severity: string;
    description: string;
  }>;
}

export interface HistoricalHeatmapsResponse {
  matrix_7x24: Array<{
    day_idx: number;
    day_name: string;
    hour: number;
    avg_methane: number;
    peak_methane: number;
    crossing_count: number;
    risk_intensity: number;
  }>;
  calendar_timeline: Array<{
    date: string;
    avg_methane: number;
    peak_methane: number;
    crossings: number;
    risk_level: string;
  }>;
}

export interface HistoricalStatisticsResponse {
  total_records: number;
  concentration_distribution: Array<{
    bin: string;
    count: number;
    pct: number;
  }>;
  duration_distribution: Array<{
    range: string;
    count: number;
  }>;
  zone_distribution: Array<{
    zone_id: string;
    records: number;
    exceedance_minutes: number;
    exceedance_pct: number;
    mean_methane: number;
    peak_methane: number;
  }>;
}

export interface InspectFileResponse {
  token: string;
  file_token?: string;
  filename: string;
  format: string;
  available_sheets: string[];
  selected_sheet: string | null;
  total_rows: number;
  columns: string[];
  detected_mapping: Record<string, string | null>;
  validation: {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
    matched_canonical_count: number;
    total_canonical_count: number;
  };
  is_valid?: boolean;
  validation_errors?: string[];
  validation_warnings?: string[];
  preview: Record<string, any>[];
}

export interface ActivateDatasetResponse {
  status: string;
  total_records: number;
  total_rows: number;
  total_zones: number;
  time_range: {
    start: string;
    end: string;
  };
  zones: string[];
  detected_events: number;
  threshold_crossings: number;
}

