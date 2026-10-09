import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  fetchReplayEpisodes,
  fetchFullEpisodeSeries,
  sendReplayStep,
} from '../api';
import { ReplayEpisodeItem, ReplayStepResponse } from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Activity,
  Wind,
  Thermometer,
  Gauge,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Info,
  Clock,
  ShieldAlert,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

interface EventReplayProps {
  selectedHorizon: number;
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
  VENTILATION_RECOVERY: 'Ventilation Restored',
  MACHINE_ACTIVITY_SURGE: 'High Machine Activity',
  SENSOR_ANOMALY: 'Sensor Irregularity',
};

const formatTimeOnly = (ts?: string) => {
  if (!ts) return 'N/A';
  const clean = ts.replace('T', ' ').split('.')[0];
  const parts = clean.split(' ');
  return parts.length > 1 ? parts[1] : parts[0];
};

const formatFullDateTime = (ts?: string) => {
  if (!ts) return 'N/A';
  return ts.replace('T', ' ').split('.')[0];
};

export const EventReplay: React.FC<EventReplayProps> = ({
  selectedHorizon,
  thresholdPct,
}) => {
  const [episodes, setEpisodes] = useState<ReplayEpisodeItem[]>([]);
  const [selectedEpId, setSelectedEpId] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState<number>(35);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2);

  const selectedEp = episodes.find((e) => e.episode_id === selectedEpId);

  const [stepData, setStepData] = useState<ReplayStepResponse | null>(null);
  const [fullEpisodeRecords, setFullEpisodeRecords] = useState<any[]>([]);

  // Performance counters during playback
  const [stats, setStats] = useState({
    truePositives: 0,
    falseAlarms: 0,
    missedEvents: 0,
    trueNegatives: 0,
  });
  const [auditLog, setAuditLog] = useState<Array<{
    step: number;
    timestamp: string;
    category: string;
    predProb: number;
    actualPeak: number;
  }>>([]);

  const timerRef = useRef<any>(null);
  const inFlightRef = useRef<boolean>(false);
  const currentIndexRef = useRef<number>(35);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    loadEpisodesList();
  }, []);

  const loadEpisodesList = async () => {
    try {
      const epList = await fetchReplayEpisodes();
      setEpisodes(epList);
      if (epList.length > 0) {
        setSelectedEpId(epList[0].episode_id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!selectedEpId) return;
    loadEpisodeData(selectedEpId);
  }, [selectedEpId]);

  const loadEpisodeData = async (epId: string) => {
    setIsPlaying(false);
    clearInterval(timerRef.current);
    try {
      const res = await fetchFullEpisodeSeries(epId);
      setFullEpisodeRecords(res.records);
      setCurrentIndex(35);
      setStats({ truePositives: 0, falseAlarms: 0, missedEvents: 0, trueNegatives: 0 });
      setAuditLog([]);
      executeStep(epId, 35);
    } catch (e) {
      console.error(e);
    }
  };

  const executeStep = async (epId: string, idx: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const stepRes = await sendReplayStep(
        epId,
        idx,
        selectedHorizon,
        'hist_gradient_boosting',
        thresholdPct
      );
      setStepData(stepRes);

      if (stepRes.past_revealed_outcome) {
        const out = stepRes.past_revealed_outcome;
        setStats((prev) => {
          if (out.eval_category === 'TRUE_POSITIVE') return { ...prev, truePositives: prev.truePositives + 1 };
          if (out.eval_category === 'FALSE_ALARM') return { ...prev, falseAlarms: prev.falseAlarms + 1 };
          if (out.eval_category === 'MISSED_EVENT') return { ...prev, missedEvents: prev.missedEvents + 1 };
          return { ...prev, trueNegatives: prev.trueNegatives + 1 };
        });

        setAuditLog((prev) => [
          {
            step: out.evaluated_step_index,
            timestamp: formatTimeOnly(out.evaluated_timestamp),
            category: out.eval_category,
            predProb: out.predicted_probability,
            actualPeak: out.actual_observed_peak_ch4,
          },
          ...prev.slice(0, 7),
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (isPlaying) {
      // 1x = 1000ms, 2x = 500ms, 5x = 200ms, 10x = 100ms
      const intervalMs = Math.max(100, Math.floor(1000 / playbackSpeed));
      timerRef.current = setInterval(() => {
        const cur = currentIndexRef.current;
        if (cur >= fullEpisodeRecords.length - 1) {
          setIsPlaying(false);
          clearInterval(timerRef.current);
          return;
        }
        const next = cur + 1;
        setCurrentIndex(next);
        executeStep(selectedEpId, next);
      }, intervalMs);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, playbackSpeed, selectedEpId, fullEpisodeRecords.length, selectedHorizon, thresholdPct]);

  const handleStepForward = () => {
    if (currentIndex < fullEpisodeRecords.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      executeStep(selectedEpId, next);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    clearInterval(timerRef.current);
    setCurrentIndex(35);
    setStats({ truePositives: 0, falseAlarms: 0, missedEvents: 0, trueNegatives: 0 });
    setAuditLog([]);
    executeStep(selectedEpId, 35);
  };

  const activeRow = fullEpisodeRecords[currentIndex];
  const currentTel = stepData?.current_telemetry || (activeRow ? {
    timestamp: activeRow.timestamp,
    methane_pct: activeRow.methane_pct,
    airflow: activeRow.airflow,
    temperature_c: activeRow.temperature_c,
    humidity_pct: activeRow.humidity_pct,
    pressure_kpa: activeRow.pressure_kpa,
    machine_activity: activeRow.machine_activity,
    ventilation_state: activeRow.ventilation_state,
  } : undefined);

  const currentPred = stepData?.prediction?.horizons?.[`${selectedHorizon}m` as '5m' | '15m' | '30m'];

  // Deduplicate and sanitize series to guarantee clean monotonic curve without interleaved sensor noise
  const chartSeries = useMemo(() => {
    const rawSlice = fullEpisodeRecords.slice(Math.max(0, currentIndex - 60), currentIndex + 1);
    const seen = new Set<string>();
    const cleanSeries: Array<{ time: string; methane_pct: number; airflow: number }> = [];
    for (const r of rawSlice) {
      const t = formatTimeOnly(r.timestamp);
      if (!seen.has(t)) {
        seen.add(t);
        cleanSeries.push({
          time: t,
          methane_pct: typeof r.methane_pct === 'number' ? r.methane_pct : parseFloat(r.methane_pct) || 0,
          airflow: typeof r.airflow === 'number' ? r.airflow : parseFloat(r.airflow) || 0,
        });
      }
    }
    return cleanSeries;
  }, [fullEpisodeRecords, currentIndex]);

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Top Shift Selector & Playback Control Bar */}
        <div className="mg-card">
          <div className="mg-card-body space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#495057] font-semibold">Select Simulated Shift:</span>
                <select
                  value={selectedEpId}
                  onChange={(e) => setSelectedEpId(e.target.value)}
                  className="bg-white border border-[#E9EBEC] text-[#343A40] text-xs rounded px-3 py-1.5 focus:outline-none focus:border-[#405189] font-medium shadow-sm min-w-[320px]"
                >
                  {episodes.map((ep) => {
                    const zoneName = ZONE_LABELS[ep.zone_id] || ep.zone_id;
                    const scName = SCENARIO_LABELS[ep.scenario_type] || ep.scenario_type;
                    const isGlitch = ep.scenario_type === 'SENSOR_ANOMALY';
                    const tag = isGlitch
                      ? '⚡ [Hardware Noise Glitch]'
                      : ep.has_threshold_crossing
                      ? '⚠️ [Predictable Gas Hazard]'
                      : '✅ [Safe Operations]';
                    return (
                      <option key={ep.episode_id} value={ep.episode_id}>
                        {ep.episode_id} — {zoneName} {tag} ({scName}, Peak: {ep.peak_methane_pct}%)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-4 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${
                    isPlaying
                      ? 'bg-[#F7B84B] hover:bg-[#e0a43c] text-white'
                      : 'bg-[#405189] hover:bg-[#364473] text-white'
                  }`}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause Simulation' : 'Play Simulation'}
                </button>

                <button
                  onClick={handleStepForward}
                  disabled={isPlaying}
                  className="px-3 py-2 bg-white hover:bg-[#F3F6F9] border border-[#E9EBEC] disabled:opacity-50 text-[#495057] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <SkipForward size={14} /> Advance 1 Min
                </button>

                <button
                  onClick={handleReset}
                  className="px-3 py-2 bg-white hover:bg-[#F3F6F9] border border-[#E9EBEC] text-[#495057] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw size={14} /> Reset
                </button>

                <div className="flex items-center bg-[#F3F6F9] rounded p-0.5 border border-[#E9EBEC] ml-2">
                  {[1, 2, 5, 10].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                        playbackSpeed === spd
                          ? 'bg-[#405189] text-white'
                          : 'text-[#878A99] hover:text-[#343A40]'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrubber slider */}
            <div className="space-y-1.5 pt-2 border-t border-[#E9EBEC]">
              <div className="flex justify-between text-[11px] text-[#878A99]">
                <span>
                  Shift Progress: <strong className="text-[#343A40] font-mono">{currentIndex}</strong> of {fullEpisodeRecords.length - 1} minutes
                </span>
                <span>
                  Current Simulated Time: <strong className="text-[#343A40] font-mono">{formatFullDateTime(currentTel?.timestamp)}</strong>
                </span>
              </div>
              <input
                type="range"
                min={35}
                max={Math.max(35, fullEpisodeRecords.length - 1)}
                value={currentIndex}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setCurrentIndex(val);
                  executeStep(selectedEpId, val);
                }}
                className="w-full h-1.5 bg-[#E9EBEC] rounded appearance-none cursor-pointer accent-[#405189]"
              />
            </div>

            {/* Contextual Shift Safety Information Banner */}
            {selectedEp && (
              <div className="pt-2 border-t border-[#E9EBEC]">
                {selectedEp.hazard_category === 'PHYSICAL_HAZARD' || (selectedEp.has_threshold_crossing && selectedEp.scenario_type !== 'SENSOR_ANOMALY') ? (
                  <div className="p-3 bg-[#E6F8F5] border border-[#0AB39C]/30 rounded flex items-start gap-2.5 text-xs text-[#0AB39C]">
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#0AB39C]" />
                    <div>
                      <strong className="font-semibold">Physical Atmospheric Hazard ({SCENARIO_LABELS[selectedEp.scenario_type] || selectedEp.scenario_type}):</strong>
                      <span className="text-[#343A40] ml-1">
                        Progressive aerodynamic ventilation restriction causes methane buildup over 30–45 minutes. The ML model observes early airway velocity decay and rate-of-rise to issue advance warnings 15–30 minutes before gas breaches the 1.0% statutory threshold.
                      </span>
                    </div>
                  </div>
                ) : selectedEp.scenario_type === 'SENSOR_ANOMALY' || selectedEp.hazard_category === 'SENSOR_ANOMALY' ? (
                  <div className="p-3 bg-[#FEF8ED] border border-[#F7B84B]/40 rounded flex items-start gap-2.5 text-xs text-[#875A00]">
                    <Info size={16} className="shrink-0 mt-0.5 text-[#F7B84B]" />
                    <div>
                      <strong className="font-semibold">Sensor Hardware Anomaly (1-Minute Electrical Noise Glitch):</strong>
                      <span className="text-[#495057] ml-1">
                        This shift contains an isolated 1-minute electrical telemetry spike to {selectedEp.peak_methane_pct}% with normal airflow and baseline gas. Because there is no gradual gas accumulation preceding the spike, time-series predictive models correctly do not forecast it ahead of time; it is captured instantly by the Outlier & Anomaly Detection system.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#E8EEF8] border border-[#405189]/20 rounded flex items-start gap-2.5 text-xs text-[#405189]">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5 text-[#405189]" />
                    <div>
                      <strong className="font-semibold">Normal Safe Atmospheric Operations:</strong>
                      <span className="text-[#495057] ml-1">
                        Ventilation airflow remains steady and gas concentrations stay safely below the 1.0% statutory threshold. The AI model correctly maintains a 0% warning chance and suppresses false alarms.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Telemetry & Model Prediction Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Telemetry at time t */}
          <div className="mg-card">
            <div className="mg-card-header">
              <h2 className="mg-card-title flex items-center gap-2">
                <Activity size={15} className="text-[#405189]" />
                Sensor Readings at Current Time t
              </h2>
              <span className="text-[11px] bg-[#F3F6F9] text-[#878A99] px-2.5 py-0.5 rounded font-medium border border-[#E9EBEC]">
                Strictly past & present visible to model
              </span>
            </div>

            <div className="mg-card-body">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Methane Reading</div>
                  <div className={`text-xl font-bold font-mono mt-1 ${
                    (currentTel?.methane_pct || 0) >= thresholdPct ? 'text-[#F06548]' : 'text-[#405189]'
                  }`}>
                    {currentTel?.methane_pct.toFixed(3) ?? '0.000'}%
                  </div>
                </div>

                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Ventilation Airflow</div>
                  <div className="text-xl font-bold font-mono text-[#343A40] mt-1">
                    {currentTel?.airflow.toFixed(1) ?? '0.0'} m³/s
                  </div>
                </div>

                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Air Temperature</div>
                  <div className="text-xl font-bold font-mono text-[#343A40] mt-1">
                    {currentTel?.temperature_c.toFixed(1) ?? '0.0'}°C
                  </div>
                </div>

                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Barometric Pressure</div>
                  <div className="text-xl font-bold font-mono text-[#343A40] mt-1">
                    {currentTel?.pressure_kpa.toFixed(2) ?? '101.3'} kPa
                  </div>
                </div>

                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Machine Cutting</div>
                  <div className="text-xl font-bold font-mono text-[#F7B84B] mt-1">
                    Level {currentTel?.machine_activity ?? 0}
                  </div>
                </div>

                <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                  <div className="text-[10px] text-[#878A99] uppercase font-semibold">Ventilation Fan State</div>
                  <div className={`text-xs font-bold mt-2 ${
                    currentTel?.ventilation_state === 'DEGRADED' ? 'text-[#F06548]' : 'text-[#0AB39C]'
                  }`}>
                    {currentTel?.ventilation_state === 'DEGRADED' ? 'DEGRADED / REDUCED' : 'NORMAL FULL'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Live Model Prediction Output */}
          <div className="mg-card">
            <div className="mg-card-header">
              <h2 className="mg-card-title flex items-center gap-2">
                <Gauge size={15} className="text-[#F7B84B]" />
                Live Advance Forecast (Predicting {selectedHorizon}m Ahead)
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  currentPred?.risk_tier === 'CRITICAL'
                    ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                    : currentPred?.risk_tier === 'ELEVATED'
                    ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30'
                    : 'bg-[#E6F8F5] text-[#0AB39C] border border-[#0AB39C]/30'
                }`}
              >
                {currentPred?.risk_tier ?? 'NORMAL'} RISK
              </span>
            </div>

            <div className="mg-card-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F3F6F9] p-4 rounded border border-[#E9EBEC]">
                  <div className="text-[11px] text-[#878A99] uppercase font-semibold">Chance of Warning Level</div>
                  <div className={`text-3xl font-extrabold font-mono mt-1 ${
                    (currentPred?.probability || 0) >= 0.70
                      ? 'text-[#F06548]'
                      : (currentPred?.probability || 0) >= 0.30
                      ? 'text-[#F7B84B]'
                      : 'text-[#0AB39C]'
                  }`}>
                    {currentPred ? (currentPred.probability * 100).toFixed(0) : '0'}%
                  </div>
                  <div className="text-[10px] text-[#878A99] mt-1">Warning level: {thresholdPct}% methane</div>
                </div>

                <div className="bg-[#F3F6F9] p-4 rounded border border-[#E9EBEC]">
                  <div className="text-[11px] text-[#878A99] uppercase font-semibold">Estimated Peak Reading</div>
                  <div className="text-3xl font-extrabold font-mono text-[#343A40] mt-1">
                    {currentPred?.predicted_peak_methane_pct.toFixed(3) ?? '0.000'}%
                  </div>
                  <div className="text-[10px] text-[#878A99] mt-1">
                    Trend: <strong className="text-[#343A40]">{currentPred?.trend_direction}</strong>
                  </div>
                </div>
              </div>

              <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC] text-[11px] text-[#495057]">
                <strong className="text-[#343A40]">Diagnostic Rationale:</strong>{' '}
                {stepData?.prediction.explanation.narrative_explanation}
              </div>
            </div>
          </div>
        </div>

        {/* Progressive Line Chart */}
        <div className="mg-card">
          <div className="mg-card-header">
            <h3 className="mg-card-title">
              Methane Sensor Readings (Past 60 Minutes up to Current Time t)
            </h3>
            <span className="text-[11px] text-[#878A99] font-medium">
              Future readings strictly hidden until time advances
            </span>
          </div>
          <div className="mg-card-body">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartSeries} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" />
                  <XAxis dataKey="time" stroke="#878A99" fontSize={10} tickLine={false} />
                  <YAxis stroke="#878A99" fontSize={10} domain={[0, 'auto']} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E9EBEC',
                      borderRadius: '6px',
                      fontSize: '11px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <ReferenceLine
                    y={thresholdPct}
                    stroke="#F06548"
                    strokeDasharray="4 4"
                    label={{ value: `Warning Level (${thresholdPct}%)`, fill: '#F06548', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="methane_pct"
                    name="Methane Reading (%)"
                    stroke="#405189"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Outcome Verification & Plain Language Detection Counters */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h3 className="mg-card-title flex items-center gap-2">
                <Eye size={15} className="text-[#176B87]" />
                How Accurate Was the Warning? (Outcome Verification)
              </h3>
              <p className="mg-card-sub">
                Verified only after the {selectedHorizon}-minute prediction window has fully elapsed in the simulation.
              </p>
            </div>
          </div>

          <div className="mg-card-body space-y-4">
            {/* 4 Verification Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#E6F8F5] border border-[#0AB39C]/30 p-3.5 rounded">
                <div className="text-[10px] text-[#0AB39C] font-bold uppercase flex items-center gap-1">
                  <CheckCircle size={12} /> Correct Warning Issued
                </div>
                <div className="text-2xl font-bold font-mono text-[#0AB39C] mt-1">
                  {stats.truePositives}
                </div>
                <div className="text-[10px] text-[#878A99]">Warning verified by gas rise</div>
              </div>

              <div className="bg-[#E8EEF8] border border-[#405189]/20 p-3.5 rounded">
                <div className="text-[10px] text-[#405189] font-bold uppercase flex items-center gap-1">
                  <CheckCircle size={12} /> Normal Safe Operation
                </div>
                <div className="text-2xl font-bold font-mono text-[#405189] mt-1">
                  {stats.trueNegatives}
                </div>
                <div className="text-[10px] text-[#878A99]">Correctly stayed quiet</div>
              </div>

              <div className="bg-[#FEF8ED] border border-[#F7B84B]/30 p-3.5 rounded">
                <div className="text-[10px] text-[#F7B84B] font-bold uppercase flex items-center gap-1">
                  <AlertTriangle size={12} /> Unnecessary Warning
                </div>
                <div className="text-2xl font-bold font-mono text-[#F7B84B] mt-1">
                  {stats.falseAlarms}
                </div>
                <div className="text-[10px] text-[#878A99]">Warning issued but stayed safe</div>
              </div>

              <div className="bg-[#FDEEEB] border border-[#F06548]/30 p-3.5 rounded">
                <div className="text-[10px] text-[#F06548] font-bold uppercase flex items-center gap-1">
                  <XCircle size={12} /> Unwarned Rise
                </div>
                <div className="text-2xl font-bold font-mono text-[#F06548] mt-1">
                  {stats.missedEvents}
                </div>
                <div className="text-[10px] text-[#878A99]">Exceeded {thresholdPct}% without alert</div>
              </div>
            </div>

            {/* Audit Log Table */}
            {auditLog.length > 0 && (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9EBEC] text-[#878A99] font-semibold bg-[#F3F6F9]">
                      <th className="py-2.5 px-3">Time Prediction Was Made</th>
                      <th className="py-2.5 px-3">Predicted Chance of Warning</th>
                      <th className="py-2.5 px-3">Subsequent Peak Methane in Next {selectedHorizon}m</th>
                      <th className="py-2.5 px-3">Verification Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EBEC] font-sans text-[11px]">
                    {auditLog.map((log, i) => {
                      const label =
                        log.category === 'TRUE_POSITIVE'
                          ? 'Correct Warning'
                          : log.category === 'FALSE_ALARM'
                          ? 'Unnecessary Warning'
                          : log.category === 'MISSED_EVENT'
                          ? 'Unwarned Rise'
                          : 'Normal Safe';

                      return (
                        <tr key={i} className="hover:bg-[#F3F6F9] transition-colors">
                          <td className="py-2.5 px-3 text-[#343A40] font-mono">{log.timestamp}</td>
                          <td className="py-2.5 px-3 text-[#343A40] font-mono">{(log.predProb * 100).toFixed(0)}%</td>
                          <td className="py-2.5 px-3 text-[#343A40] font-bold font-mono">{log.actualPeak.toFixed(3)}%</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.category === 'TRUE_POSITIVE'
                                  ? 'bg-[#E6F8F5] text-[#0AB39C] border border-[#0AB39C]/30'
                                  : log.category === 'FALSE_ALARM'
                                  ? 'bg-[#FEF8ED] text-[#F7B84B] border border-[#F7B84B]/30'
                                  : log.category === 'MISSED_EVENT'
                                  ? 'bg-[#FDEEEB] text-[#F06548] border border-[#F06548]/30'
                                  : 'bg-[#E8EEF8] text-[#405189] border border-[#405189]/20'
                              }`}
                            >
                              {label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
