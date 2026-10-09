import React, { useState } from 'react';
import { simulateScenario } from '../api';
import {
  SlidersHorizontal,
  Play,
  RotateCcw,
  Wind,
  Flame,
  Activity,
  AlertTriangle,
  Info,
  Clock,
  CheckCircle2,
} from 'lucide-react';
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

export const ScenarioSimulator: React.FC = () => {
  const [initialCh4, setInitialCh4] = useState<number>(0.35);
  const [gasInflow, setGasInflow] = useState<number>(1.2);
  const [airflow, setAirflow] = useState<number>(16.0);
  const [activity, setActivity] = useState<number>(2);
  const [ventState, setVentState] = useState<string>('NORMAL');
  const [noise, setNoise] = useState<number>(0.02);
  const [injectSurge, setInjectSurge] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const res = await simulateScenario({
        initial_methane_pct: initialCh4,
        gas_inflow_rate: gasInflow,
        airflow_m3s: airflow,
        machine_activity: activity,
        ventilation_state: ventState,
        noise_level: noise,
        simulation_minutes: 90,
        inject_surge_minute: injectSurge ? 35 : undefined,
        surge_magnitude: injectSurge ? 0.65 : undefined,
      });
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleResetParams = () => {
    setInitialCh4(0.35);
    setGasInflow(1.2);
    setAirflow(16.0);
    setActivity(2);
    setVentState('NORMAL');
    setNoise(0.02);
    setInjectSurge(true);
  };

  const chartData = result
    ? result.records.map((r: any, idx: number) => {
        const pred = result.timeline_predictions.find((p: any) => p.step_minute === idx);
        return {
          minute: idx,
          methane_pct: r.methane_pct,
          airflow: r.airflow,
          prob_15m: pred ? Math.round(pred.prob_15m * 100) : null,
        };
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="p-2 sm:p-4 space-y-6 max-w-7xl mx-auto">
        {/* Top Advisory Banner */}
        <div className="p-4 bg-[#E8EEF8] border border-[#405189]/20 rounded-md flex items-start gap-3 text-xs text-[#405189]">
          <Info size={18} className="shrink-0 text-[#405189] mt-0.5" />
          <div>
            <strong className="font-semibold">What-If Simulation Engine:</strong> Adjust operational variables such as fan airflow, cutting machine intensity, or gas inflow to test how the AI models respond under hypothetical atmospheric conditions. Telemetry is fed live into the trained causal pipeline.
          </div>
        </div>

        {/* Control Panel Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (Parameter Sliders) */}
          <div className="lg:col-span-1 mg-card">
            <div className="mg-card-header">
              <h2 className="mg-card-title flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-[#405189]" />
                Hypothetical Inputs
              </h2>
              <button
                onClick={handleResetParams}
                className="text-[11px] text-[#878A99] hover:text-[#343A40] flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} /> Reset Defaults
              </button>
            </div>

            <div className="mg-card-body space-y-4 text-xs">
              {/* Initial Methane */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#495057] font-medium">Starting Methane Level:</span>
                  <span className="font-mono text-[#343A40] font-bold">{initialCh4.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={initialCh4}
                  onChange={(e) => setInitialCh4(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#E9EBEC] rounded appearance-none cursor-pointer accent-[#405189]"
                />
              </div>

              {/* Fan Airflow */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#495057] font-medium">Ventilation Fan Airflow:</span>
                  <span className="font-mono text-[#343A40] font-bold">{airflow.toFixed(1)} m³/s</span>
                </div>
                <input
                  type="range"
                  min={5.0}
                  max={25.0}
                  step={0.5}
                  value={airflow}
                  onChange={(e) => setAirflow(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#E9EBEC] rounded appearance-none cursor-pointer accent-[#405189]"
                />
              </div>

              {/* Machine Activity */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#495057] font-medium">Mining Machine Activity:</span>
                  <span className="font-mono text-[#F7B84B] font-bold">
                    {activity === 0 ? 'Idle (0)' : activity === 1 ? 'Low (1)' : activity === 2 ? 'Medium (2)' : 'Heavy Cutting (3)'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={activity}
                  onChange={(e) => setActivity(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-[#E9EBEC] rounded appearance-none cursor-pointer accent-[#F7B84B]"
                />
              </div>

              {/* Ventilation State */}
              <div className="space-y-1.5">
                <span className="text-[#495057] font-medium block">Ventilation System Status:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVentState('NORMAL')}
                    className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${
                      ventState === 'NORMAL'
                        ? 'bg-[#E6F8F5] border-[#0AB39C]/40 text-[#0AB39C]'
                        : 'bg-[#F3F6F9] border-[#E9EBEC] text-[#878A99] hover:bg-[#E9EBEC]'
                    }`}
                  >
                    Normal Full
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentState('DEGRADED')}
                    className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${
                      ventState === 'DEGRADED'
                        ? 'bg-[#FDEEEB] border-[#F06548]/40 text-[#F06548]'
                        : 'bg-[#F3F6F9] border-[#E9EBEC] text-[#878A99] hover:bg-[#E9EBEC]'
                    }`}
                  >
                    Degraded / Reduced
                  </button>
                </div>
              </div>

              {/* Gas surge inject checkbox */}
              <div className="pt-2 border-t border-[#E9EBEC] flex items-center justify-between">
                <div>
                  <span className="text-[#495057] font-medium block">Inject Gas Surge at Min 35:</span>
                  <span className="text-[10px] text-[#878A99]">Simulates sudden strata pocket release</span>
                </div>
                <input
                  type="checkbox"
                  checked={injectSurge}
                  onChange={(e) => setInjectSurge(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E9EBEC] text-[#405189] focus:ring-0 accent-[#405189] cursor-pointer"
                />
              </div>

              <button
                onClick={handleSimulate}
                disabled={loading}
                className="w-full mt-4 py-2.5 bg-[#405189] hover:bg-[#364473] disabled:opacity-50 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {loading ? 'Simulating Atmosphere...' : 'Run What-If Simulation'}
              </button>
            </div>
          </div>

          {/* Right 2 Columns (Simulation Output & Chart) */}
          <div className="lg:col-span-2 mg-card">
            <div className="mg-card-header">
              <div>
                <h3 className="mg-card-title flex items-center gap-2">
                  <Activity size={15} className="text-[#0AB39C]" />
                  Simulated Methane Timeline & AI Warning Forecast
                </h3>
                <p className="mg-card-sub">
                  Observe how early the AI model issues advance warnings before gas exceeds the 1.0% warning level.
                </p>
              </div>
            </div>

            <div className="mg-card-body">
              {!result ? (
                <div className="h-80 flex flex-col items-center justify-center text-[#878A99] text-xs gap-3">
                  <SlidersHorizontal size={32} className="opacity-40 text-[#878A99]" />
                  <span>Configure hypothetical parameters on the left and click "Run What-If Simulation".</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Badges */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block font-medium">Peak Simulated Methane</span>
                      <span className="text-lg font-bold font-mono text-[#343A40] mt-1 block">
                        {Math.max(...result.records.map((r: any) => r.methane_pct)).toFixed(3)}%
                      </span>
                      <span className="text-[10px] text-[#878A99] mt-0.5 block">
                        {Math.max(...result.records.map((r: any) => r.methane_pct)) >= 1.0 ? 'Breached warning level (1.0%)' : 'Remained within safe limits'}
                      </span>
                    </div>

                    <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block font-medium">Highest Warning Chance</span>
                      <span className={`text-lg font-bold font-mono mt-1 block ${
                        Math.max(0, ...(result.timeline_predictions?.map((p: any) => p.prob_15m * 100) || [0])) >= 70
                          ? 'text-[#F06548]'
                          : Math.max(0, ...(result.timeline_predictions?.map((p: any) => p.prob_15m * 100) || [0])) >= 30
                          ? 'text-[#F7B84B]'
                          : 'text-[#0AB39C]'
                      }`}>
                        {Math.max(0, ...(result.timeline_predictions?.map((p: any) => p.prob_15m * 100) || [0])).toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-[#878A99] mt-0.5 block">
                        Max model confidence across shift
                      </span>
                    </div>

                    <div className="bg-[#F3F6F9] p-3 rounded border border-[#E9EBEC]">
                      <span className="text-[10px] text-[#878A99] block font-medium">Advance Warning Lead Time</span>
                      <span className="text-lg font-bold font-mono text-[#0AB39C] mt-1 block">
                        {result.advance_warning_lead_time_minutes !== null && result.advance_warning_lead_time_minutes !== undefined
                          ? result.advance_warning_lead_time_minutes > 0
                            ? `${result.advance_warning_lead_time_minutes} Minutes Ahead`
                            : 'Immediate Exceedance'
                          : 'No Warning Breach'}
                      </span>
                      <span className="text-[10px] text-[#878A99] mt-0.5 block">
                        {result.advance_warning_lead_time_minutes
                          ? `Alert at min ${result.earliest_warning_minute}, crossed at min ${result.first_threshold_crossing_minute}`
                          : result.first_threshold_crossing_minute !== null && result.first_threshold_crossing_minute !== undefined
                          ? `Crossed at min ${result.first_threshold_crossing_minute}`
                          : 'Atmosphere stayed normal'}
                      </span>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" />
                        <XAxis
                          dataKey="minute"
                          stroke="#878A99"
                          fontSize={10}
                          tickLine={false}
                          label={{ value: 'Simulation Elapsed Minutes', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#878A99' }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#405189"
                          fontSize={10}
                          tickLine={false}
                          domain={[0, 'auto']}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#F7B84B"
                          fontSize={10}
                          tickLine={false}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#E9EBEC',
                            borderRadius: '6px',
                            fontSize: '11px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <ReferenceLine
                          yAxisId="left"
                          y={1.0}
                          stroke="#F06548"
                          strokeDasharray="4 4"
                          label={{ value: 'Warning Level (1.0% CH₄)', fill: '#F06548', fontSize: 10, position: 'insideTopLeft' }}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="methane_pct"
                          name="Simulated Methane (%)"
                          stroke="#405189"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="prob_15m"
                          name="15m Forecast Warning Chance (%)"
                          stroke="#F7B84B"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls={true}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
