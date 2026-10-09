import {
  OverviewData,
  PredictionResponse,
  ReplayEpisodeItem,
  ReplayStepResponse,
  TemporalAnalyticsData,
  ZoneItem,
  BenchmarkModelMetric,
  AnomalyEventItem,
  LiveStatusResponse,
  LiveOverviewResponse,
  LiveTrendsResponse,
  LiveWarningsResponse,
  HistoricalMetaResponse,
  HistoricalPeriodAnalysisResponse,
  HistoricalEventsResponse,
  HistoricalHeatmapsResponse,
  HistoricalStatisticsResponse,
  InspectFileResponse,
  ActivateDatasetResponse,
} from './types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{
  status: string;
  dataset_loaded: boolean;
  models_loaded: boolean;
  total_records: number;
}> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchOverview(horizon?: number): Promise<OverviewData> {
  const url = horizon ? `${API_BASE}/overview?horizon=${horizon}` : `${API_BASE}/overview`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch overview metrics');
  return res.json();
}

export async function fetchForecastSample(
  zoneId?: string,
  scenarioType?: string
): Promise<{
  episode_id: string;
  zone_id: string;
  scenario_type: string;
  cut_timestamp: string;
  forecast: PredictionResponse;
  series: Array<{
    timestamp: string;
    methane_pct: number;
    airflow: number;
    type: 'HISTORICAL' | 'FUTURE_ACTUAL';
  }>;
}> {
  const params = new URLSearchParams();
  if (zoneId) params.append('zone_id', zoneId);
  if (scenarioType) params.append('scenario_type', scenarioType);
  const res = await fetch(`${API_BASE}/forecast/sample-series?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch sample forecast series');
  return res.json();
}

export async function runForecastPredict(
  recentRecords: any[],
  modelType: string = 'hist_gradient_boosting',
  preferredHorizon: number = 15
): Promise<PredictionResponse> {
  const res = await fetch(`${API_BASE}/forecast/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recent_records: recentRecords,
      model_type: modelType,
      preferred_horizon: preferredHorizon,
    }),
  });
  if (!res.ok) throw new Error('Prediction API failed');
  return res.json();
}

export async function fetchReplayEpisodes(): Promise<ReplayEpisodeItem[]> {
  const res = await fetch(`${API_BASE}/replay/episodes`);
  if (!res.ok) throw new Error('Failed to fetch replay episodes');
  return res.json();
}

export async function fetchFullEpisodeSeries(episodeId: string): Promise<{
  episode_id: string;
  zone_id: string;
  scenario_type: string;
  total_steps: number;
  records: any[];
}> {
  const res = await fetch(`${API_BASE}/replay/episode/${episodeId}`);
  if (!res.ok) throw new Error('Failed to fetch full episode series');
  return res.json();
}

export async function sendReplayStep(
  episodeId: string,
  currentIndex: number,
  horizonMinutes: number = 15,
  modelType: string = 'hist_gradient_boosting',
  thresholdPct: number = 1.0
): Promise<ReplayStepResponse> {
  const res = await fetch(`${API_BASE}/replay/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episode_id: episodeId,
      current_index: currentIndex,
      horizon_minutes: horizonMinutes,
      threshold_pct: thresholdPct,
      model_type: modelType,
    }),
  });
  if (!res.ok) throw new Error('Failed to evaluate replay step');
  return res.json();
}

export async function fetchTemporalAnalytics(zoneId?: string): Promise<TemporalAnalyticsData> {
  const q = zoneId ? `?zone_id=${zoneId}` : '';
  const res = await fetch(`${API_BASE}/analytics/temporal${q}`);
  if (!res.ok) throw new Error('Failed to fetch temporal analytics');
  return res.json();
}

export async function fetchZones(): Promise<{
  zones: ZoneItem[];
  total_zones: number;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/zones`);
  if (!res.ok) throw new Error('Failed to fetch zones data');
  return res.json();
}

export async function fetchAnomalyEvents(
  anomalyType?: string,
  zoneId?: string
): Promise<{
  events: AnomalyEventItem[];
  total_detected: number;
  categories: string[];
}> {
  const params = new URLSearchParams();
  if (anomalyType) params.append('anomaly_type', anomalyType);
  if (zoneId) params.append('zone_id', zoneId);
  const res = await fetch(`${API_BASE}/anomalies/events?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch anomalies');
  return res.json();
}

export async function fetchEventInspection(
  episodeId: string,
  stepIndex: number
): Promise<{
  episode_id: string;
  zone_id: string;
  scenario_type: string;
  trigger_step_index: number;
  trigger_timestamp: string;
  series: any[];
  forecast_at_trigger: PredictionResponse | null;
}> {
  const res = await fetch(`${API_BASE}/anomalies/event/${episodeId}/${stepIndex}`);
  if (!res.ok) throw new Error('Failed to inspect event');
  return res.json();
}

export async function fetchBenchmarkMetrics(): Promise<{
  threshold_pct: number;
  horizons: number[];
  metrics: BenchmarkModelMetric[];
  global_importances: Record<string, Record<string, number>>;
  dataset_stats: any;
}> {
  const res = await fetch(`${API_BASE}/benchmark/metrics`);
  if (!res.ok) throw new Error('Failed to fetch benchmark metrics');
  return res.json();
}

export async function fetchThresholdSweep(
  horizon: number,
  modelName: string
): Promise<{
  model_name: string;
  horizon_minutes: number;
  sweep_points: Array<{
    decision_threshold: number;
    precision: number;
    recall: number;
    f1_score: number;
    false_alarms_per_day: number;
  }>;
  conceptual_explanation: Record<string, string>;
}> {
  const res = await fetch(
    `${API_BASE}/benchmark/threshold-sweep?horizon=${horizon}&model_name=${modelName}`
  );
  if (!res.ok) throw new Error('Failed to fetch threshold sweep');
  return res.json();
}

export async function simulateScenario(params: {
  initial_methane_pct: number;
  gas_inflow_rate: number;
  airflow_m3s: number;
  machine_activity: number;
  ventilation_state: string;
  noise_level: number;
  simulation_minutes: number;
  inject_surge_minute?: number;
  surge_magnitude?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/scenario/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Scenario simulation failed');
  return res.json();
}

export async function fetchDatasetSummary(): Promise<any> {
  const res = await fetch(`${API_BASE}/dataset/summary`);
  if (!res.ok) throw new Error('Failed to fetch dataset summary');
  return res.json();
}

export async function fetchDatasetPreview(
  page: number = 1,
  pageSize: number = 25,
  zoneId?: string,
  scenarioType?: string
): Promise<any> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (zoneId && zoneId !== 'ALL') params.append('zone_id', zoneId);
  if (scenarioType && scenarioType !== 'ALL') params.append('scenario_type', scenarioType);
  const res = await fetch(`${API_BASE}/dataset/preview?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch preview');
  return res.json();
}

export async function regenerateDataset(targetRows: number, seed: number): Promise<any> {
  const res = await fetch(`${API_BASE}/dataset/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_rows: targetRows, seed }),
  });
  if (!res.ok) throw new Error('Dataset generation failed');
  return res.json();
}

export async function uploadDatasetCSV(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/dataset/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json();
    throw errData;
  }
  return res.json();
}

export async function fetchReportSummary(): Promise<any> {
  const res = await fetch(`${API_BASE}/reports/summary`);
  if (!res.ok) throw new Error('Failed to fetch report summary');
  return res.json();
}

// ==========================================
// Workspace 1 — Live Monitoring Endpoints
// ==========================================

export async function fetchLiveStatus(): Promise<LiveStatusResponse> {
  const res = await fetch(`${API_BASE}/live/status`);
  if (!res.ok) throw new Error('Failed to fetch live monitoring status');
  return res.json();
}

export async function toggleLiveDemo(enable?: boolean, episodeId?: string): Promise<{
  status: string;
  is_demo_mode: boolean;
  demo_episode_id: string;
  demo_step_index: number;
}> {
  const params = new URLSearchParams();
  if (enable !== undefined) params.append('enable', enable.toString());
  if (episodeId) params.append('episode_id', episodeId);
  const res = await fetch(`${API_BASE}/live/toggle-demo?${params.toString()}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to toggle demo feed');
  return res.json();
}

export async function tickLiveDemo(steps: number = 1): Promise<{
  status: string;
  is_demo_mode: boolean;
  demo_step_index: number;
  episode_id: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/live/tick?steps=${steps}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to advance simulation step');
  return res.json();
}

export async function jumpToLiveHazard(): Promise<{
  status: string;
  is_demo_mode: boolean;
  demo_step_index: number;
  episode_id: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/live/jump-hazard`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to fast forward to hazard buildup');
  return res.json();
}

export async function resetLiveDemo(): Promise<{
  status: string;
  is_demo_mode: boolean;
  demo_step_index: number;
  episode_id: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/live/reset-demo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset simulation baseline');
  return res.json();
}

export async function fetchLiveOverview(): Promise<LiveOverviewResponse> {
  const res = await fetch(`${API_BASE}/live/overview`);
  if (!res.ok) throw new Error('Failed to fetch live overview');
  return res.json();
}

export async function fetchLiveTrends(zoneId?: string): Promise<LiveTrendsResponse> {
  const params = new URLSearchParams();
  if (zoneId) params.append('zone_id', zoneId);
  const res = await fetch(`${API_BASE}/live/trends?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch live sensor trends');
  return res.json();
}

export async function fetchLiveWarnings(
  severity?: string,
  zoneId?: string,
  activeOnly: boolean = false
): Promise<LiveWarningsResponse> {
  const params = new URLSearchParams();
  if (severity) params.append('severity', severity);
  if (zoneId) params.append('zone_id', zoneId);
  if (activeOnly) params.append('active_only', 'true');
  const res = await fetch(`${API_BASE}/live/warnings?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch live warnings');
  return res.json();
}

// ==========================================
// Workspace 2 — Historical Risk Endpoints
// ==========================================

export async function fetchHistoricalMeta(): Promise<HistoricalMetaResponse> {
  const res = await fetch(`${API_BASE}/historical/meta`);
  if (!res.ok) throw new Error('Failed to fetch historical metadata');
  return res.json();
}

export async function analyzeHistoricalPeriod(params: {
  start_time?: string;
  end_time?: string;
  zone_id?: string;
  horizon?: number;
}): Promise<HistoricalPeriodAnalysisResponse> {
  const res = await fetch(`${API_BASE}/historical/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to analyze historical period');
  return res.json();
}

export async function fetchHistoricalEvents(
  category?: string,
  zoneId?: string,
  severity?: string
): Promise<HistoricalEventsResponse> {
  const params = new URLSearchParams();
  if (category && category !== 'ALL') params.append('category', category);
  if (zoneId && zoneId !== 'ALL') params.append('zone_id', zoneId);
  if (severity && severity !== 'ALL') params.append('severity', severity);
  const res = await fetch(`${API_BASE}/historical/events?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch historical events');
  return res.json();
}

export async function fetchHistoricalHeatmaps(zoneId?: string): Promise<HistoricalHeatmapsResponse> {
  const params = new URLSearchParams();
  if (zoneId && zoneId !== 'ALL') params.append('zone_id', zoneId);
  const res = await fetch(`${API_BASE}/historical/heatmaps?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch historical heatmaps');
  return res.json();
}

export async function fetchHistoricalStatistics(zoneId?: string): Promise<HistoricalStatisticsResponse> {
  const params = new URLSearchParams();
  if (zoneId && zoneId !== 'ALL') params.append('zone_id', zoneId);
  const res = await fetch(`${API_BASE}/historical/statistics?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch historical statistics');
  return res.json();
}

// ==========================================
// Excel & CSV File Inspect & Activation
// ==========================================

export async function inspectUploadedFile(
  file: File,
  sheetName?: string
): Promise<InspectFileResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (sheetName) formData.append('sheet_name', sheetName);

  const res = await fetch(`${API_BASE}/dataset/inspect-file`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to inspect uploaded file');
  }
  return res.json();
}

export async function activateUploadedDataset(
  token: string,
  sheetName?: string,
  columnMapping?: Record<string, string>
): Promise<ActivateDatasetResponse> {
  const res = await fetch(`${API_BASE}/dataset/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      sheet_name: sheetName,
      column_mapping: columnMapping,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to activate dataset');
  }
  return res.json();
}

export async function loadDemoDataset(): Promise<any> {
  const res = await fetch(`${API_BASE}/dataset/load-demo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to load demo dataset');
  return res.json();
}

