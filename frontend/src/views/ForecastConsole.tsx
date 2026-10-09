import React, { useEffect, useState } from 'react';
import { fetchForecastSample } from '../api';
import { PredictionResponse, LocalExplanationDriver } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Wind,
  Layers,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  CheckSquare,
  Flame,
  Info,
  ChevronRight,
} from 'lucide-react';

interface ForecastConsoleProps {
  selectedZone?: string;
  onSelectZone?: (z: string) => void;
  selectedHorizon: number;
  onSelectHorizon: (h: number) => void;
  thresholdPct: number;
}

const ZONE_LABELS: Record<string, string> = {
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Goaf / Bleeder Seal Area',
  'ZONE-05-DEVELOPMENT-HEADING': 'Rapid Development Heading',
  'ZONE-06-RETURN-AIRWAY': 'Main Return Airway',
};

const SCENARIO_LABELS: Record<string, string> = {
  GRADUAL_GAS_BUILDUP: 'Gradual Gas Buildup',
  SUDDEN_OUTBURST_SURGE: 'Sudden Gas Surge',
  DEGRADED_VENTILATION: 'Degraded Ventilation',
  NORMAL_BASELINE: 'Normal Safe Operation',
  MACHINE_ACTIVITY_SURGE: 'High Machinery Cutting Activity',
};

const FEATURE_FRIENDLY_NAMES: Record<string, string> = {
  methane_slope_5: 'Speed of methane rise (last 5 min)',
  methane_diff_15: 'Change in methane level (last 15 min)',
  airflow_roll_mean_15: 'Average airflow (last 15 min)',
  airflow: 'Current ventilation airflow',
  machine_activity: 'Mining machinery activity level',
  ventilation_is_degraded: 'Ventilation performance degraded',
  pressure_kpa: 'Barometric atmospheric pressure',
  methane_roll_std_15: 'Methane reading fluctuations',
  temperature_c: 'Ambient mine temperature',
  humidity_pct: 'Relative humidity',
};

export const ForecastConsole: React.FC<ForecastConsoleProps> = ({
  selectedZone: propZone,
  onSelectZone,
  selectedHorizon,
  onSelectHorizon,
  thresholdPct,
}) => {
  const [internalZone, setInternalZone] = useState<string>('ZONE-01-TAILGATE');
  const activeZone = propZone || internalZone;

  const handleZoneChange = (zoneId: string) => {
    setInternalZone(zoneId);
    if (onSelectZone) onSelectZone(zoneId);
  };

  const [selectedScenario, setSelectedScenario] = useState<string>('GRADUAL_GAS_BUILDUP');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
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
  } | null>(null);

  const loadSample = async () => {
    try {
      setLoading(true);
      const res = await fetchForecastSample(activeZone, selectedScenario);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSample();
  }, [activeZone, selectedScenario]);

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#878A99] text-xs">
          <div className="w-8 h-8 border-2 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span>Generating multi-horizon gas-risk forecast and calculating causal feature contributions...</span>
        </div>
      </div>
    );
  }

  const forecast = data.forecast;
  const currentPred = forecast.horizons[`${selectedHorizon}m` as '5m' | '15m' | '30m'];
  const probPercent = Math.round(currentPred.probability * 100);

  // Time-series points: past telemetry vs future observed outcome
  const chartPoints = data.series.map((item) => {
    const isHist = item.type === 'HISTORICAL';
    return {
      time: item.timestamp.split(' ')[1] || item.timestamp,
      measured_ch4: isHist ? Number(item.methane_pct.toFixed(3)) : null,
      future_actual_ch4: !isHist ? Number(item.methane_pct.toFixed(3)) : null,
      airflow: Number(item.airflow.toFixed(1)),
    };
  });

  // Calculate recent 15-minute slope
  const histPoints = data.series.filter((s) => s.type === 'HISTORICAL');
  const latestHist = histPoints[histPoints.length - 1];
  const prevHist = histPoints[Math.max(0, histPoints.length - 15)];
  const slopeVal = latestHist && prevHist ? (latestHist.methane_pct - prevHist.methane_pct) / 15.0 : 0;
  const trendDirection = slopeVal > 0.005 ? 'RISING' : slopeVal < -0.005 ? 'FALLING' : 'STABLE';

  // Future actual outcome verification
  const futurePoints = data.series.filter((s) => s.type === 'FUTURE_ACTUAL');
  const futurePeakCh4 = futurePoints.length > 0 ? Math.max(...futurePoints.map((p) => p.methane_pct)) : null;
  const futureCrossedThreshold = futurePeakCh4 !== null && futurePeakCh4 >= thresholdPct;

  let outcomeLabel = 'Awaiting Horizon Outcome';
  let outcomeBadge = 'mg-badge-neutral';
  if (futurePeakCh4 !== null) {
    if (currentPred.risk_tier === 'CRITICAL' || currentPred.risk_tier === 'ELEVATED') {
      if (futureCrossedThreshold) {
        outcomeLabel = 'Verified Warning (Threshold Crossed)';
        outcomeBadge = 'mg-badge-solid-danger';
      } else {
        outcomeLabel = 'Safe Avoidance (Methane Peaked Below Threshold)';
        outcomeBadge = 'mg-badge-warning';
      }
    } else {
      if (futureCrossedThreshold) {
        outcomeLabel = 'Unexpected Spike (Late Hazard)';
        outcomeBadge = 'mg-badge-danger';
      } else {
        outcomeLabel = 'Verified Safe (Normal Operation Maintained)';
        outcomeBadge = 'mg-badge-success';
      }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Area & Scenario Operational Selectors (Velzon Card) */}
      <div className="mg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#878A99] font-medium">Selected Mine Area:</span>
              <select
                value={activeZone}
                onChange={(e) => handleZoneChange(e.target.value)}
                className="bg-white border border-[#E9EBEC] text-[#343A40] text-xs font-semibold rounded px-3 py-1.5 focus:outline-none focus:border-[#405189]"
              >
                {Object.entries(ZONE_LABELS).map(([zid, label]) => (
                  <option key={zid} value={zid}>
                    {label} ({zid})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#878A99] font-medium">Simulated Condition:</span>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="bg-white border border-[#E9EBEC] text-[#343A40] text-xs font-semibold rounded px-3 py-1.5 focus:outline-none focus:border-[#405189]"
              >
                {Object.entries(SCENARIO_LABELS).map(([scKey, scLabel]) => (
                  <option key={scKey} value={scKey}>
                    {scLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSample}
              className="mg-btn mg-btn-sm"
              title="Reload fresh sample readings for this area"
            >
              <RefreshCw size={13} />
              Reload Telemetry Sample
            </button>
          </div>
        </div>
      </div>

      {/* 2. Operational Action Guidance Banner */}
      <div
        className={`mg-banner ${
          currentPred.risk_tier === 'CRITICAL'
            ? 'mg-banner-danger'
            : currentPred.risk_tier === 'ELEVATED'
            ? 'mg-banner-warning'
            : 'mg-banner-success'
        }`}
      >
        {currentPred.risk_tier === 'CRITICAL' ? (
          <AlertTriangle className="mg-banner-icon animate-pulse" />
        ) : currentPred.risk_tier === 'ELEVATED' ? (
          <AlertCircle className="mg-banner-icon" />
        ) : (
          <ShieldCheck className="mg-banner-icon" />
        )}
        <div className="mg-banner-body">
          <div className="mg-banner-title">
            {currentPred.risk_tier === 'CRITICAL'
              ? `Critical Threshold Risk Predicted for ${ZONE_LABELS[activeZone] || activeZone}`
              : currentPred.risk_tier === 'ELEVATED'
              ? `Elevated Risk Predicted for ${ZONE_LABELS[activeZone] || activeZone}`
              : `Normal Safe Conditions Expected for ${ZONE_LABELS[activeZone] || activeZone}`}
          </div>
          <div className="mg-banner-text">
            Model indicates a <strong>{probPercent}% chance</strong> of crossing the {thresholdPct.toFixed(1)}% warning level within {selectedHorizon} minutes.
            {currentPred.risk_tier !== 'NORMAL' ? ' Recommended check: review ventilation intake and monitor return heading.' : ' Standard shift environmental sweep recommended.'}
          </div>
        </div>
        <div className="mg-badge font-mono">
          Horizon: {selectedHorizon}m
        </div>
      </div>

      {/* 3. Operational Telemetry KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Current Methane */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Current Gas Concentration</span>
              <span
                className={`mg-badge ${
                  forecast.current_methane_pct >= 1.0
                    ? 'mg-badge-solid-danger'
                    : forecast.current_methane_pct >= 0.7
                    ? 'mg-badge-warning'
                    : 'mg-badge-success'
                }`}
              >
                {forecast.current_methane_pct >= 1.0 ? 'Exceeds Warning' : 'Within Limits'}
              </span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {forecast.current_methane_pct.toFixed(3)}
                  <span className="mg-kpi-unit">% CH₄</span>
                </div>
                <div className="mg-kpi-note flex items-center gap-1 font-semibold">
                  {trendDirection === 'RISING' && <TrendingUp size={13} className="text-[#F06548]" />}
                  {trendDirection === 'FALLING' && <TrendingDown size={13} className="text-[#0AB39C]" />}
                  {trendDirection === 'STABLE' && <Minus size={13} className="text-[#878A99]" />}
                  <span className={trendDirection === 'RISING' ? 'text-[#F06548]' : trendDirection === 'FALLING' ? 'text-[#0AB39C]' : 'text-[#878A99]'}>
                    {trendDirection} ({slopeVal > 0 ? '+' : ''}{(slopeVal * 100).toFixed(2)}%/15m)
                  </span>
                </div>
              </div>
              <div className="mg-icon-chip mg-chip-warning">
                <Flame className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Warning Threshold Cutoff */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Statutory Warning Cutoff</span>
              <span className="mg-badge mg-badge-info font-mono">Demo Level</span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {thresholdPct.toFixed(1)}
                  <span className="mg-kpi-unit">% CH₄</span>
                </div>
                <div className="mg-kpi-note">
                  Margin: {(thresholdPct - forecast.current_methane_pct).toFixed(3)}% until cutoff
                </div>
              </div>
              <div className="mg-icon-chip mg-chip-primary">
                <Gauge className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Predicted Risk */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Warning Chance ({selectedHorizon}m ahead)</span>
              <span
                className={`mg-badge ${
                  currentPred.risk_tier === 'CRITICAL'
                    ? 'mg-badge-solid-danger'
                    : currentPred.risk_tier === 'ELEVATED'
                    ? 'mg-badge-warning'
                    : 'mg-badge-success'
                }`}
              >
                {currentPred.risk_tier}
              </span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num text-[#405189]">
                  {probPercent}
                  <span className="mg-kpi-unit">% Risk</span>
                </div>
                <div className="mg-kpi-note">
                  Model statistical confidence
                </div>
              </div>
              <div
                className={`mg-icon-chip ${
                  currentPred.risk_tier === 'CRITICAL'
                    ? 'mg-chip-danger'
                    : currentPred.risk_tier === 'ELEVATED'
                    ? 'mg-chip-warning'
                    : 'mg-chip-success'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Ventilation Airflow */}
        <div className="mg-card">
          <div className="mg-kpi">
            <div className="mg-kpi-top">
              <span className="mg-kpi-label">Intake Dilution Airflow</span>
              <span className="mg-badge mg-badge-success">Online</span>
            </div>
            <div className="mg-kpi-main">
              <div>
                <div className="mg-kpi-value mg-num">
                  {forecast.current_airflow.toFixed(1)}
                  <span className="mg-kpi-unit">m³/s</span>
                </div>
                <div className="mg-kpi-note">
                  {forecast.features_summary.ventilation_is_degraded ? '⚠️ Performance degraded' : 'Nominal dilution volume'}
                </div>
              </div>
              <div className="mg-icon-chip mg-chip-info">
                <Wind className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Time-Series Sensor Readings & Future Outcome Chart */}
      <div className="mg-card">
        <div className="mg-card-header">
          <div>
            <h2 className="mg-card-title flex items-center gap-2">
              <Flame size={16} className="text-[#F06548]" />
              Sensor Telemetry & Forecast Horizon Trace
            </h2>
            <p className="mg-card-sub">
              Actual observed historical readings up to evaluation point, with subsequent simulated outcome comparison.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[#405189]">
              <span className="w-3 h-0.5 bg-[#405189] inline-block" /> Past Readings (Recorded)
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[#F06548]">
              <span className="w-3 h-0.5 bg-[#F06548] border-b border-dashed inline-block" /> Subsequent Outcome
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[#F7B84B]">
              <span className="w-3 h-0.5 bg-[#F7B84B] inline-block" /> 1.0% Warning Level
            </span>
          </div>
        </div>

        <div className="mg-card-body">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartPoints} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#878A99"
                  fontSize={11}
                  tickLine={false}
                  dy={5}
                />
                <YAxis
                  stroke="#878A99"
                  fontSize={11}
                  tickLine={false}
                  domain={[0, (dataMax: number) => Math.max(1.3, Number((dataMax * 1.15).toFixed(1)))]}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E9EBEC',
                    borderRadius: '4px',
                    boxShadow: '0 5px 10px rgba(30, 32, 37, 0.12)',
                    fontSize: '11px',
                  }}
                  formatter={(val: any) => [`${val}% CH₄`, '']}
                />
                <ReferenceLine
                  y={thresholdPct}
                  stroke="#F7B84B"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{ value: 'Warning Cutoff (1.0%)', fill: '#B7791F', fontSize: 11, position: 'insideTopRight' }}
                />
                {/* Historical Observed Readings */}
                <Line
                  type="monotone"
                  dataKey="measured_ch4"
                  name="Recorded Sensor Reading"
                  stroke="#405189"
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: '#405189' }}
                  isAnimationActive={false}
                />
                {/* Subsequent Outcome Window */}
                <Line
                  type="monotone"
                  dataKey="future_actual_ch4"
                  name="Subsequent Observed Outcome"
                  stroke="#F06548"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-[#E9EBEC] flex items-center justify-between text-[11px] text-[#878A99]">
            <span>
              <strong>Note on Operational Boundaries:</strong> The model evaluates sensor signals strictly at the boundary between past readings and the forward forecast horizon.
            </span>
            <span className="font-mono">Sensor ID: {activeZone}-MQ4</span>
          </div>
        </div>
      </div>

      {/* 5. Multi-Horizon Forecast Comparison & Outcome Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): 3 Horizons Side-by-Side */}
        <div className="lg:col-span-2 mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <Clock size={16} className="text-[#405189]" />
                Predicted Threshold-Crossing Risk Across 3 Horizons
              </h2>
              <p className="mg-card-sub">
                Separately trained classifiers forecasting the likelihood of reaching 1.0% CH₄ within 5, 15, and 30 minutes.
              </p>
            </div>
          </div>

          <div className="mg-card-body grid grid-cols-1 md:grid-cols-3 gap-4">
            {[5, 15, 30].map((h) => {
              const pObj = forecast.horizons[`${h}m` as '5m' | '15m' | '30m'];
              const pct = Math.round(pObj.probability * 100);
              const isSelected = selectedHorizon === h;

              return (
                <div
                  key={h}
                  onClick={() => onSelectHorizon(h)}
                  className={`p-4 rounded-md border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E8F2F5]/60 border-[#176B87] shadow-xs'
                      : 'bg-[#F8F9FA] border-[#E9EBEC] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#343A40]">
                      {h} Minutes Ahead
                    </span>
                    <span
                      className={`mg-badge ${
                        pObj.risk_tier === 'CRITICAL'
                          ? 'mg-badge-solid-danger'
                          : pObj.risk_tier === 'ELEVATED'
                          ? 'mg-badge-warning'
                          : 'mg-badge-success'
                      }`}
                    >
                      {pObj.risk_tier}
                    </span>
                  </div>

                  <div className="text-2xl font-bold font-mono text-[#343A40] my-2">
                    {pct}% <span className="text-xs font-normal text-[#878A99]">Chance</span>
                  </div>

                  <div className="text-xs text-[#495057] space-y-1 pt-2 border-t border-[#E9EBEC]">
                    <div className="flex justify-between">
                      <span className="text-[#878A99]">Trend:</span>
                      <span className="font-semibold">{pObj.trend_direction}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#878A99]">Expected Peak:</span>
                      <span className="font-mono font-semibold">{pObj.predicted_peak_methane_pct.toFixed(2)}% CH₄</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mg-card-footer bg-[#F8F9FA]/40 text-xs text-[#878A99]">
            <span>Click any horizon card to switch dashboard advance window.</span>
            <span className="font-mono">Engine: HistGradientBoosting</span>
          </div>
        </div>

        {/* Right (1 col): Observed Outcome Verification */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <CheckSquare size={16} className="text-[#0AB39C]" />
                Observed Outcome Verification
              </h2>
              <p className="mg-card-sub">
                Subsequent simulated readings after the evaluation window elapsed.
              </p>
            </div>
          </div>

          <div className="mg-card-body space-y-3.5">
            <div className="bg-[#F8F9FA] p-3 rounded-md border border-[#E9EBEC] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#878A99]">Observed Peak CH₄:</span>
                <span className="font-mono font-bold text-[#343A40]">
                  {futurePeakCh4 !== null ? `${futurePeakCh4.toFixed(3)}%` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#878A99]">Threshold Reached:</span>
                <span className={`font-semibold ${futureCrossedThreshold ? 'text-[#F06548]' : 'text-[#0AB39C]'}`}>
                  {futureCrossedThreshold ? 'Yes (≥ 1.0%)' : 'No (< 1.0%)'}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#E9EBEC]">
                <span className="text-[#878A99]">Verification Status:</span>
                <span className={outcomeBadge}>
                  {outcomeLabel}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#495057] leading-relaxed">
              This comparison demonstrates the model's forward predictive validity: warnings are verified when gas rises to 1.0% in the subsequent window.
            </div>
          </div>
        </div>
      </div>

      {/* 6. Key Inputs Influencing the Model & Suggested Checks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Drivers */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <Sparkles size={16} className="text-[#405189]" />
                Key Inputs Influencing the Model
              </h2>
              <p className="mg-card-sub">
                Local feature contributions explaining why the model assigned this risk level.
              </p>
            </div>
          </div>

          <div className="mg-card-body space-y-3">
            {forecast.explanation.top_drivers.map((drv, idx) => {
              const friendlyName = FEATURE_FRIENDLY_NAMES[drv.feature] || drv.feature;
              const pct = Math.abs(drv.relative_contribution * 100);

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[#343A40]">{friendlyName}</span>
                    <span className="font-mono font-bold text-[#405189]">
                      {drv.relative_contribution > 0 ? '+' : ''}{pct.toFixed(0)}% Impact
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#E9EBEC] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        drv.relative_contribution > 0 ? 'bg-[#405189]' : 'bg-[#0AB39C]'
                      }`}
                      style={{ width: `${Math.min(100, pct * 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Suggested Checks Grounded in Drivers */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h2 className="mg-card-title flex items-center gap-2">
                <CheckSquare size={16} className="text-[#0AB39C]" />
                Suggested Checks Based on Input Drivers
              </h2>
              <p className="mg-card-sub">
                Actionable decision-support steps tailored to the specific factors driving this prediction.
              </p>
            </div>
          </div>

          <div className="mg-card-body space-y-2.5 text-xs">
            <div className="bg-[#EAF5FB] border border-[#C1E2F5] p-3 rounded-md space-y-1.5">
              <span className="font-bold text-[#176B87] block">
                Primary Driver: {FEATURE_FRIENDLY_NAMES[forecast.explanation.top_drivers[0]?.feature] || 'Gas Rate of Change'}
              </span>
              <p className="text-[#343A40] leading-relaxed">
                The model is primarily responding to rapid changes in methane slopes and ventilation volume over the last 15 minutes.
              </p>
            </div>

            <ul className="space-y-2 text-[#495057] pl-0 list-none">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#405189] mt-1.5 shrink-0" />
                <span><strong>Check Sensor Quality:</strong> Confirm sensor telemetry is stable and not fluctuating due to power or communication noise.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#405189] mt-1.5 shrink-0" />
                <span><strong>Inspect Ventilation:</strong> Verify that intake airways maintain {forecast.current_airflow.toFixed(1)} m³/s of airflow.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#405189] mt-1.5 shrink-0" />
                <span><strong>Observe Downstream Return:</strong> Inspect bleeder junctions downstream of {ZONE_LABELS[activeZone] || activeZone}.</span>
              </li>
            </ul>

            <div className="text-[10px] text-[#878A99] pt-2 border-t border-[#E9EBEC]">
              Decision support recommendations only. Follow statutory coal mine safety protocol and physical detector readings.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastConsole;
