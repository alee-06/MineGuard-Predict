import React, { useEffect, useState } from 'react';
import {
  fetchLiveStatus,
  toggleLiveDemo,
  tickLiveDemo,
  jumpToLiveHazard,
  resetLiveDemo,
  fetchLiveOverview,
  fetchLiveTrends,
  fetchLiveWarnings,
} from '../api';
import {
  LiveStatusResponse,
  LiveOverviewResponse,
  LiveTrendsResponse,
  LiveWarningsResponse,
} from '../types';
import {
  Activity,
  AlertTriangle,
  Radio,
  Play,
  Square,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Wind,
  Layers,
  Clock,
  ChevronRight,
  Info,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  ExternalLink,
  FastForward,
  RotateCcw,
  Zap,
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
import { formatDateTime } from '../utils';

export type LiveTabKey = 'overview' | 'trends' | 'warnings';

interface LiveMonitoringWorkspaceProps {
  onNavigateToHistorical?: () => void;
}

const ZONE_LABELS: Record<string, string> = {
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Bleeder Seal Regulator 4B',
  'ZONE-05-BELT-CONVEYOR': 'Belt Conveyor Transfer Point 2',
  'ZONE-06-DEV-HEADING': 'Development Heading 3 North',
};

const humanizePhysicalEffector = (label: string, effect: string) => {
  const l = (label || '').toLowerCase();
  const e = (effect || '').toLowerCase();

  // If already clean human language, return directly
  if (
    l === 'airflow is an issue' ||
    l === 'ventilation is degraded' ||
    l === 'methane is rising' ||
    l === 'humidity is too much' ||
    l === 'airflow is reduced' ||
    l === 'gas level trending upward' ||
    l === 'airflow is adequate' ||
    l === 'gas level normal' ||
    l === 'coal cutting active' ||
    l === 'machinery cutting idle' ||
    l === 'temperature is elevated'
  ) {
    return { label, effect };
  }

  if (
    l.includes('is an issue') ||
    l.includes('is degraded') ||
    l.includes('is rising') ||
    l.includes('is too much') ||
    l.includes('is reduced') ||
    l.includes('adequate') ||
    l.includes('normal') ||
    l.includes('active')
  ) {
    return { label, effect };
  }

  // Translate legacy feature labels or mathematical indicators if ever encountered
  if (l.includes('airflow')) {
    return {
      label: 'Airflow is an issue',
      effect: e.includes('restricted') || e.includes('velocity')
        ? effect
        : 'Ventilation velocity dropped below normal dilution rate',
    };
  }
  if (l.includes('ventilation')) {
    return {
      label: 'Ventilation is degraded',
      effect: 'Primary fan operating below standard capacity',
    };
  }
  if (l.includes('methane') || l.includes('gas') || l.includes('ch4')) {
    return {
      label: 'Methane is rising',
      effect: e.includes('climbing') || e.includes('rise')
        ? effect
        : 'Gas accumulation rate climbing over recent minutes',
    };
  }
  if (l.includes('humidity')) {
    return {
      label: 'Humidity is too much',
      effect: 'High relative moisture detected in airway',
    };
  }
  if (l.includes('machine') || l.includes('cutting') || l.includes('activity')) {
    return {
      label: 'Coal cutting active',
      effect: 'Machinery extraction releasing strata seam gas',
    };
  }
  if (l.includes('temp')) {
    return {
      label: 'Temperature is elevated',
      effect: 'Warm ambient air detected in airway',
    };
  }

  return {
    label: 'Airflow is adequate',
    effect: 'Atmospheric conditions operating within nominal limits',
  };
};

export const LiveMonitoringWorkspace: React.FC<LiveMonitoringWorkspaceProps> = ({
  onNavigateToHistorical,
}) => {
  const [activeTab, setActiveTab] = useState<LiveTabKey>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Live status & overview
  const [status, setStatus] = useState<LiveStatusResponse | null>(null);
  const [overview, setOverview] = useState<LiveOverviewResponse | null>(null);

  // Sensor trends state
  const [selectedZone, setSelectedZone] = useState<string>('ZONE-01-TAILGATE');
  const [trends, setTrends] = useState<LiveTrendsResponse | null>(null);
  const [trendsLoading, setTrendsLoading] = useState<boolean>(false);

  // Warnings state
  const [warningsData, setWarningsData] = useState<LiveWarningsResponse | null>(null);
  const [warningsLoading, setWarningsLoading] = useState<boolean>(false);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [activeOnlyFilter, setActiveOnlyFilter] = useState<boolean>(false);

  // Selected warning for inspection modal
  const [inspectingWarning, setInspectingWarning] = useState<any | null>(null);

  // Initial load
  useEffect(() => {
    loadAllLiveData();
  }, []);

  // When selectedZone changes or trends tab selected
  useEffect(() => {
    if (activeTab === 'trends') {
      loadTrends(selectedZone);
    }
  }, [activeTab, selectedZone]);

  // When warnings tab or filters change
  useEffect(() => {
    if (activeTab === 'warnings') {
      loadWarnings();
    }
  }, [activeTab, severityFilter, zoneFilter, activeOnlyFilter]);

  // Periodic polling if demo mode is running: 2-second live simulation cycle
  useEffect(() => {
    if (status?.is_demo_mode) {
      const interval = setInterval(() => {
        loadAllLiveData(true);
        if (activeTab === 'trends') {
          loadTrends(selectedZone, true);
        } else if (activeTab === 'warnings') {
          loadWarnings(true);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [status?.is_demo_mode, activeTab, selectedZone, severityFilter, zoneFilter, activeOnlyFilter]);

  const loadAllLiveData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const [statusRes, overviewRes] = await Promise.all([
        fetchLiveStatus(),
        fetchLiveOverview(),
      ]);
      setStatus(statusRes);
      setOverview(overviewRes);
    } catch (e) {
      console.error('Failed to load live data:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadTrends = async (zoneId: string, silent: boolean = false) => {
    if (!silent) setTrendsLoading(true);
    try {
      const data = await fetchLiveTrends(zoneId);
      setTrends(data);
    } catch (e) {
      console.error('Failed to load trends:', e);
    } finally {
      if (!silent) setTrendsLoading(false);
    }
  };

  const loadWarnings = async (silent: boolean = false) => {
    if (!silent) setWarningsLoading(true);
    try {
      const sev = severityFilter === 'ALL' ? undefined : severityFilter;
      const z = zoneFilter === 'ALL' ? undefined : zoneFilter;
      const data = await fetchLiveWarnings(sev, z, activeOnlyFilter);
      setWarningsData(data);
    } catch (e) {
      console.error('Failed to load warnings:', e);
    } finally {
      if (!silent) setWarningsLoading(false);
    }
  };

  const handleToggleDemo = async () => {
    setRefreshing(true);
    try {
      await toggleLiveDemo();
      await loadAllLiveData();
      if (activeTab === 'trends') {
        await loadTrends(selectedZone);
      } else if (activeTab === 'warnings') {
        await loadWarnings();
      }
    } catch (e) {
      console.error('Failed to toggle demo:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTickDemo = async (steps: number = 1) => {
    try {
      await tickLiveDemo(steps);
      await loadAllLiveData(true);
      if (activeTab === 'trends') await loadTrends(selectedZone, true);
      if (activeTab === 'warnings') await loadWarnings(true);
    } catch (e) {
      console.error('Failed to step demo:', e);
    }
  };

  const handleJumpHazard = async () => {
    setRefreshing(true);
    try {
      await jumpToLiveHazard();
      await loadAllLiveData(true);
      if (activeTab === 'trends') await loadTrends(selectedZone, true);
      if (activeTab === 'warnings') await loadWarnings(true);
    } catch (e) {
      console.error('Failed to jump to hazard buildup:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleResetDemo = async () => {
    setRefreshing(true);
    try {
      await resetLiveDemo();
      await loadAllLiveData(true);
      if (activeTab === 'trends') await loadTrends(selectedZone, true);
      if (activeTab === 'warnings') await loadWarnings(true);
    } catch (e) {
      console.error('Failed to reset demo simulation:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleInspectZoneTrends = (zoneId: string) => {
    setSelectedZone(zoneId);
    setActiveTab('trends');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Connection & Simulation Status */}
      <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-2.5 rounded-lg shrink-0 ${
                status?.is_demo_mode
                  ? 'bg-[#F7B84B]/15 text-[#B88728] border border-[#F7B84B]/30'
                  : status?.is_hardware_connected
                  ? 'bg-[#0AB39C]/15 text-[#0AB39C] border border-[#0AB39C]/30'
                  : 'bg-[#F06548]/10 text-[#F06548] border border-[#F06548]/20'
              }`}
            >
              {status?.is_demo_mode ? (
                <Radio className="h-6 w-6 animate-pulse" />
              ) : status?.is_hardware_connected ? (
                <Activity className="h-6 w-6" />
              ) : (
                <ShieldAlert className="h-6 w-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#182B3A] tracking-tight">
                  {status?.is_demo_mode
                    ? 'Simulated Shift Telemetry Stream Active'
                    : status?.is_hardware_connected
                    ? 'Physical Underground Sensors Connected'
                    : 'Live Data Source Not Connected'}
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    status?.is_demo_mode
                      ? 'bg-[#0AB39C]/15 text-[#0AB39C] border border-[#0AB39C]/30 animate-pulse'
                      : status?.is_hardware_connected
                      ? 'bg-[#0AB39C]/15 text-[#0AB39C] border border-[#0AB39C]/30'
                      : 'bg-[#F06548]/15 text-[#F06548] border border-[#F06548]/30'
                  }`}
                >
                  {status?.is_demo_mode
                    ? 'Live Telemetry Simulating'
                    : status?.is_hardware_connected
                    ? 'Live HW Stream'
                    : 'Hardware Offline'}
                </span>
              </div>
              <p className="text-xs text-[#8797A8] mt-0.5">
                {status?.is_demo_mode
                  ? `Replaying episode ${status.demo_episode_id || 'EP-0001'} · Step ${overview?.live_stream?.step_index ?? status.demo_step_index} / ${status.demo_max_step || overview?.live_stream?.max_step || 719} · Clock ${overview?.live_stream?.simulated_time ?? '06:15'} · Continuous 2s telemetry advance.`
                  : status?.is_hardware_connected
                  ? 'Receiving telemetry from subterranean wireless mesh gateway.'
                  : 'Physical telemetry receiver is offline. Click "Start Live Simulation" to stream realistic sensor telemetry and evaluate advance AI risk.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleToggleDemo}
              disabled={refreshing}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-colors cursor-pointer shadow-xs ${
                status?.is_demo_mode
                  ? 'bg-[#F06548] hover:bg-[#D95338] text-white'
                  : 'bg-[#405189] hover:bg-[#364473] text-white'
              }`}
            >
              {status?.is_demo_mode ? (
                <>
                  <Square size={13} className="fill-white" />
                  <span>Pause Stream</span>
                </>
              ) : (
                <>
                  <Play size={13} className="fill-white" />
                  <span>Start Live Simulation</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleTickDemo(1)}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#D9DDE3] bg-white hover:bg-[#F3F3F9] text-[#182B3A] text-xs font-semibold transition-colors cursor-pointer"
              title="Advance simulation by 1 minute"
            >
              <FastForward size={13} className="text-[#405189]" />
              <span>Step +1m</span>
            </button>

            <button
              onClick={handleJumpHazard}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#F7B84B]/60 bg-[#F7B84B]/15 hover:bg-[#F7B84B]/25 text-[#B88728] text-xs font-semibold transition-colors cursor-pointer"
              title="Jump to developing hazard buildup (99.7% advance ML risk)"
            >
              <Zap size={13} />
              <span>Jump to Hazard</span>
            </button>

            <button
              onClick={handleResetDemo}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#D9DDE3] bg-white hover:bg-[#F3F3F9] text-[#495057] text-xs font-medium transition-colors cursor-pointer"
              title="Reset simulation to safe baseline"
            >
              <RotateCcw size={13} />
              <span>Reset Baseline</span>
            </button>

            <button
              onClick={() => loadAllLiveData()}
              disabled={loading || refreshing}
              className="p-1.5 rounded-md border border-[#D9DDE3] bg-white hover:bg-[#F3F3F9] text-[#495057] transition-colors cursor-pointer"
              title="Refresh Telemetry"
              aria-label="Refresh Telemetry"
            >
              <RefreshCw size={14} className={refreshing || loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#E9EBEC]">
          <span className="text-xs font-semibold text-[#8797A8] mr-2">Live Views:</span>
          {(
            [
              { key: 'overview', label: 'Overview', icon: Activity, badge: undefined },
              { key: 'trends', label: 'Sensor Trends', icon: TrendingUp, badge: undefined },
              {
                key: 'warnings',
                label: 'Warnings',
                icon: AlertTriangle,
                badge: overview?.active_warning_zones_count
                  ? `${overview.active_warning_zones_count}`
                  : undefined,
              },
            ] as Array<{ key: LiveTabKey; label: string; icon: any; badge?: string }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                data-tab={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#405189] text-white shadow-xs'
                    : 'bg-[#F3F3F9] text-[#495057] hover:bg-[#E9EBEC]'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="bg-[#F06548] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Monitored Areas */}
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider">
                  Monitored Areas
                </p>
                <p className="text-2xl font-bold text-[#182B3A] mt-1">
                  {overview?.zones_monitored_count ?? 6}
                </p>
                <p className="text-[11px] text-[#0AB39C] mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 size={12} />
                  <span>All sensors reporting</span>
                </p>
              </div>
              <div className="p-3 bg-[#F3F3F9] rounded-lg text-[#405189]">
                <Layers size={22} />
              </div>
            </div>

            {/* Card 2: Areas Under Warning */}
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider">
                  Active Warnings
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    (overview?.active_warning_zones_count ?? 0) > 0
                      ? 'text-[#F06548]'
                      : 'text-[#182B3A]'
                  }`}
                >
                  {overview?.active_warning_zones_count ?? 0}
                </p>
                <p className="text-[11px] text-[#8797A8] mt-1">
                  {(overview?.active_warning_zones_count ?? 0) > 0
                    ? 'Immediate safety check required'
                    : 'No threshold exceedances'}
                </p>
              </div>
              <div
                className={`p-3 rounded-lg ${
                  (overview?.active_warning_zones_count ?? 0) > 0
                    ? 'bg-[#F06548]/10 text-[#F06548]'
                    : 'bg-[#F3F3F9] text-[#8797A8]'
                }`}
              >
                <AlertTriangle size={22} />
              </div>
            </div>

            {/* Card 3: Rising Gas Areas */}
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider">
                  Areas with Rising Gas
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    (overview?.rising_gas_zones_count ?? 0) > 0
                      ? 'text-[#F7B84B]'
                      : 'text-[#182B3A]'
                  }`}
                >
                  {overview?.rising_gas_zones_count ?? 0}
                </p>
                <p className="text-[11px] text-[#8797A8] mt-1">Positive 15m methane slope</p>
              </div>
              <div
                className={`p-3 rounded-lg ${
                  (overview?.rising_gas_zones_count ?? 0) > 0
                    ? 'bg-[#F7B84B]/10 text-[#B88728]'
                    : 'bg-[#F3F3F9] text-[#8797A8]'
                }`}
              >
                <TrendingUp size={22} />
              </div>
            </div>

            {/* Card 4: Demonstration Threshold */}
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider">
                  Safety Threshold
                </p>
                <p className="text-2xl font-bold text-[#182B3A] mt-1">
                  {overview?.threshold_pct ? `${overview.threshold_pct.toFixed(1)}%` : '1.0%'} CH₄
                </p>
                <p className="text-[11px] text-[#405189] mt-1 font-medium">Standard Warning Limit</p>
              </div>
              <div className="p-3 bg-[#F3F3F9] rounded-lg text-[#0AB39C]">
                <ShieldCheck size={22} />
              </div>
            </div>
          </div>

          {/* Live Dynamic Telemetry Stream & Advance Forecasting Monitor */}
          {overview?.live_stream && overview.live_stream.points && overview.live_stream.points.length > 0 && (
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-5">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#E9EBEC]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0AB39C] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0AB39C]"></span>
                    </span>
                    <h3 className="text-sm font-bold text-[#182B3A] tracking-tight">
                      Live Telemetry Stream — {overview.live_stream.zone_name}
                    </h3>
                    <span className="bg-[#405189]/10 text-[#405189] text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                      {overview.live_stream.zone_id}
                    </span>
                  </div>
                  <p className="text-xs text-[#8797A8] mt-0.5">
                    Continuous underground sensor feed replayed with genuine rolling-window AI hazard forecasting.
                  </p>
                </div>

                {/* Live Real-time Readings Ribbon */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Current Methane */}
                  <div className="flex items-center gap-1.5 bg-[#F8F9FA] border border-[#E9EBEC] px-3 py-1.5 rounded-md">
                    <span className="text-[#8797A8] font-medium">Current CH₄:</span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        overview.live_stream.current_methane >= 1.0
                          ? 'text-[#F06548]'
                          : overview.live_stream.current_methane >= 0.7
                          ? 'text-[#B88728]'
                          : 'text-[#0AB39C]'
                      }`}
                    >
                      {overview.live_stream.current_methane.toFixed(3)}%
                    </span>
                  </div>

                  {/* Airflow */}
                  <div className="flex items-center gap-1.5 bg-[#F8F9FA] border border-[#E9EBEC] px-3 py-1.5 rounded-md">
                    <Wind size={14} className="text-[#405189]" />
                    <span className="text-[#8797A8] font-medium">Ventilation:</span>
                    <span className="font-mono font-bold text-sm text-[#182B3A]">
                      {overview.live_stream.current_airflow.toFixed(1)} m³/s
                    </span>
                  </div>

                  {/* 15m Ahead Forecast Risk */}
                  {overview.watchlist && overview.watchlist[0]?.risk_15m !== undefined && (
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border ${
                        overview.watchlist[0].risk_15m >= 70
                          ? 'bg-[#F06548]/10 border-[#F06548]/30 text-[#F06548]'
                          : overview.watchlist[0].risk_15m >= 30
                          ? 'bg-[#F7B84B]/15 border-[#F7B84B]/30 text-[#B88728]'
                          : 'bg-[#0AB39C]/10 border-[#0AB39C]/30 text-[#0AB39C]'
                      }`}
                    >
                      <Zap size={14} />
                      <span className="font-medium text-[11px]">15-Min Forecast Risk:</span>
                      <span className="font-mono font-bold text-sm">
                        {overview.watchlist[0].risk_15m.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {/* Full Analytics Shortcut */}
                  <button
                    onClick={() => handleInspectZoneTrends(overview.live_stream!.zone_id)}
                    className="flex items-center gap-1 text-xs text-[#405189] hover:underline font-semibold cursor-pointer"
                  >
                    <span>Full Analytics</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* Dynamic Line Chart */}
              <div className="h-[250px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={overview.live_stream.points}
                    margin={{ top: 10, right: 30, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F5" vertical={false} />
                    <XAxis
                      dataKey="time_label"
                      stroke="#8797A8"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="methane"
                      stroke="#8797A8"
                      fontSize={11}
                      domain={[0, (dataMax: number) => Math.max(1.3, Number((dataMax + 0.1).toFixed(2)))]}
                      tickFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                    <YAxis
                      yAxisId="airflow"
                      orientation="right"
                      stroke="#8797A8"
                      fontSize={11}
                      domain={[0, 25]}
                      tickFormatter={(v) => `${v} m³/s`}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => {
                        if (name === 'Methane Concentration') return [`${Number(val).toFixed(3)}% CH₄`, name];
                        if (name === 'Ventilation Airflow') return [`${Number(val).toFixed(1)} m³/s`, name];
                        return [val, name];
                      }}
                      labelFormatter={(lbl) => `Time: ${lbl}`}
                      contentStyle={{
                        backgroundColor: '#182B3A',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                    <ReferenceLine
                      yAxisId="methane"
                      y={1.0}
                      stroke="#F06548"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{
                        value: '1.0% Threshold',
                        fill: '#F06548',
                        position: 'top',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                    <Line
                      yAxisId="methane"
                      type="monotone"
                      dataKey="methane_pct"
                      name="Methane Concentration"
                      stroke={overview.live_stream.current_methane >= 1.0 ? '#F06548' : '#F7B84B'}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="airflow"
                      type="monotone"
                      dataKey="airflow"
                      name="Ventilation Airflow"
                      stroke="#405189"
                      strokeWidth={1.8}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Operational Safety Interpretation Ribbon */}
              <div className="mt-3 pt-3 border-t border-[#F0F2F5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#182B3A]">Atmospheric Status:</span>
                  {overview.live_stream.current_methane >= 1.0 ? (
                    <span className="text-[#F06548] font-bold flex items-center gap-1">
                      <AlertTriangle size={13} />
                      CRITICAL: Statutory 1.0% limit exceeded. Cease coal cutting and maximize auxiliary ventilation.
                    </span>
                  ) : overview.watchlist && overview.watchlist[0]?.risk_15m !== undefined && overview.watchlist[0].risk_15m >= 50 ? (
                    <span className="text-[#B88728] font-bold flex items-center gap-1">
                      <AlertCircle size={13} />
                      ADVANCE WARNING: Airflow restriction detected. AI forecasts imminent threshold breach within 15 minutes.
                    </span>
                  ) : (
                    <span className="text-[#0AB39C] font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      NOMINAL: Ventilation intake stable. Concentration well below the 1.0% warning threshold.
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-[#8797A8] font-mono">
                  Clock: {overview.live_stream.simulated_time} (Step {overview.live_stream.step_index} / {overview.live_stream.max_step || status?.demo_max_step || 719})
                </div>
              </div>
            </div>
          )}

          {/* Priority Alert Panel */}
          {overview?.priority_alert ? (
            <div
              className={`rounded-lg border p-5 shadow-xs ${
                overview.priority_alert.severity === 'CRITICAL'
                  ? 'bg-[#F06548]/8 border-[#F06548]/30'
                  : 'bg-[#F7B84B]/8 border-[#F7B84B]/30'
              }`}
            >
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-2.5 rounded-lg shrink-0 mt-0.5 ${
                      overview.priority_alert.severity === 'CRITICAL'
                        ? 'bg-[#F06548] text-white shadow-xs'
                        : 'bg-[#F7B84B] text-[#182B3A] shadow-xs'
                    }`}
                  >
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#8797A8]">
                        Priority Operational Alert
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                          overview.priority_alert.severity === 'CRITICAL'
                            ? 'bg-[#F06548] text-white'
                            : 'bg-[#F7B84B] text-[#182B3A]'
                        }`}
                      >
                        {overview.priority_alert.severity} RISK
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#182B3A] mt-1">
                      {overview.priority_alert.zone_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-[#495057]">
                      <div>
                        Current Methane:{' '}
                        <span className="font-mono font-bold text-[#F06548]">
                          {overview.priority_alert.current_methane.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        Peak Concentration:{' '}
                        <span className="font-mono font-bold">
                          {overview.priority_alert.peak_methane.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        Trend:{' '}
                        <span className="font-bold">{overview.priority_alert.trend}</span>
                      </div>
                      <div>
                        Duration Active:{' '}
                        <span className="font-mono">
                          {overview.priority_alert.minutes_active} min
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-[#182B3A] mt-2.5 bg-white/70 p-2.5 rounded border border-black/5">
                      <strong>Recommended Operational Action:</strong>{' '}
                      {overview.priority_alert.recommendation}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleInspectZoneTrends(overview.priority_alert!.zone_id)}
                  className="px-4 py-2.5 bg-[#182B3A] hover:bg-[#25394B] text-white text-xs font-semibold rounded-md shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>Inspect Area Trends</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0AB39C]/8 border border-[#0AB39C]/25 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#0AB39C] text-white rounded-md shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#182B3A]">
                    Underground Atmospheric Status: Safe
                  </h4>
                  <p className="text-xs text-[#55697A]">
                    All monitored production sectors and bleeders are operating below the 1.0% CH₄
                    demonstration warning threshold.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#0AB39C] bg-white px-2.5 py-1 rounded border border-[#0AB39C]/20">
                Nominal
              </span>
            </div>
          )}

          {/* Mine Area Watchlist */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#E9EBEC] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A]">Underground Area Watchlist</h3>
                <p className="text-xs text-[#8797A8]">
                  Current telemetry, atmospheric trend, and 30-minute advance forecast by sector
                </p>
              </div>
              <span className="text-xs text-[#8797A8]">
                {overview?.watchlist?.length ?? 0} sectors active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FA] text-[#8797A8] uppercase font-semibold text-[10px] tracking-wider border-b border-[#E9EBEC]">
                  <tr>
                    <th className="px-4 py-3">Monitoring Area</th>
                    <th className="px-4 py-3">Current Methane</th>
                    <th className="px-4 py-3">Ventilation Airflow</th>
                    <th className="px-4 py-3">Atmospheric Trend</th>
                    <th className="px-4 py-3">30-Min Advance Risk</th>
                    <th className="px-4 py-3">Operational Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBEC]">
                  {overview?.watchlist?.map((area) => {
                    const isExceeding = area.current_methane >= 1.0;
                    const isWarning = area.status === 'WARNING';
                    const isElevated = area.risk_level === 'CRITICAL' || area.risk_level === 'ELEVATED';

                    return (
                      <tr
                        key={area.zone_id}
                        className={`hover:bg-[#F9FAFC] transition-colors ${
                          area.active_incident ? 'bg-[#F06548]/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-[#182B3A]">
                          <div>{area.zone_name}</div>
                          <span className="text-[10px] text-[#8797A8] font-mono">
                            {area.zone_id}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              isExceeding
                                ? 'bg-[#F06548]/15 text-[#F06548]'
                                : area.current_methane >= 0.8
                                ? 'bg-[#F7B84B]/15 text-[#B88728]'
                                : 'bg-[#0AB39C]/10 text-[#0AB39C]'
                            }`}
                          >
                            {area.current_methane.toFixed(2)}% CH₄
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-[#495057]">
                          <span className="flex items-center gap-1.5">
                            <Wind size={13} className="text-[#8797A8]" />
                            {area.current_airflow.toFixed(1)} m³/s
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold text-xs ${
                              area.trend === 'RISING'
                                ? 'text-[#F7B84B]'
                                : area.trend === 'FALLING'
                                ? 'text-[#0AB39C]'
                                : 'text-[#8797A8]'
                            }`}
                          >
                            {area.trend === 'RISING' && <TrendingUp size={13} />}
                            {area.trend === 'FALLING' && <TrendingDown size={13} />}
                            {area.trend === 'STABLE' && <Minus size={13} />}
                            {area.trend}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-[#E9EBEC] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  area.forecast_30m_prob >= 0.7
                                    ? 'bg-[#F06548]'
                                    : area.forecast_30m_prob >= 0.4
                                    ? 'bg-[#F7B84B]'
                                    : 'bg-[#0AB39C]'
                                }`}
                                style={{ width: `${Math.round(area.forecast_30m_prob * 100)}%` }}
                              />
                            </div>
                            <span className="font-bold">
                              {(area.forecast_30m_prob * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              area.active_incident
                                ? 'bg-[#F06548] text-white'
                                : isElevated
                                ? 'bg-[#F7B84B]/20 text-[#B88728] border border-[#F7B84B]/30'
                                : 'bg-[#0AB39C]/10 text-[#0AB39C] border border-[#0AB39C]/20'
                            }`}
                          >
                            {area.active_incident
                              ? 'Active Warning'
                              : isElevated
                              ? 'Elevated Risk'
                              : 'Nominal'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleInspectZoneTrends(area.zone_id)}
                            className="px-2.5 py-1 bg-[#F3F3F9] hover:bg-[#E9EBEC] text-[#405189] font-medium rounded text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Inspect</span>
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SENSOR TRENDS */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="area-selector" className="text-xs font-semibold text-[#8797A8]">Select Area:</label>
              <select
                id="area-selector"
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-[#F8F9FA] border border-[#D9DDE3] rounded-md px-3 py-1.5 text-xs font-semibold text-[#182B3A] focus:outline-none focus:border-[#405189] cursor-pointer"
              >
                {Object.entries(ZONE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label} ({k})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#8797A8]">Current Methane:</span>
                <span className="font-mono font-bold text-sm text-[#182B3A]">
                  {trends?.current_methane !== undefined
                    ? `${trends.current_methane.toFixed(2)}% CH₄`
                    : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#8797A8]">Airflow:</span>
                <span className="font-mono font-bold text-sm text-[#182B3A]">
                  {trends?.current_airflow !== undefined
                    ? `${trends.current_airflow.toFixed(1)} m³/s`
                    : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* 3 Forecast Cards (5m, 15m, 30m) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                { key: '5m', label: '5-Minute Ahead Forecast', horizon: 5 },
                { key: '15m', label: '15-Minute Ahead Forecast', horizon: 15 },
                { key: '30m', label: '30-Minute Ahead Forecast', horizon: 30 },
              ] as const
            ).map((card) => {
              const f = trends?.forecast?.[card.key];
              const prob = f ? f.probability : 0;
              const isAlert = f ? f.alert_triggered : false;
              const tier = f ? f.risk_tier : 'NORMAL';

              return (
                <div
                  key={card.key}
                  className={`bg-white rounded-lg border p-4 shadow-xs ${
                    isAlert
                      ? 'border-[#F06548]/40 bg-[#F06548]/4'
                      : tier === 'ELEVATED'
                      ? 'border-[#F7B84B]/40'
                      : 'border-[#E9EBEC]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#8797A8] uppercase tracking-wider">
                      {card.label}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                        isAlert
                          ? 'bg-[#F06548] text-white'
                          : tier === 'ELEVATED'
                          ? 'bg-[#F7B84B]/20 text-[#B88728]'
                          : 'bg-[#0AB39C]/15 text-[#0AB39C]'
                      }`}
                    >
                      {tier} RISK
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div>
                      <span className="text-3xl font-extrabold font-mono text-[#182B3A]">
                        {(prob * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs text-[#8797A8] ml-1.5">threshold probability</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#E9EBEC] flex items-center justify-between text-xs">
                    <span className="text-[#8797A8]">Predicted Peak:</span>
                    <span className="font-mono font-bold text-[#182B3A]">
                      {f?.predicted_peak ? `${f.predicted_peak.toFixed(2)}%` : '--'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Operational Guidance & Key Drivers */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
            <h4 className="text-xs font-bold text-[#8797A8] uppercase tracking-wider mb-2">
              Advance Operational Assessment
            </h4>
            <div className="p-3 bg-[#F3F3F9] rounded-md border border-[#E9EBEC] text-xs text-[#182B3A] font-medium">
              {trends?.forecast?.operational_recommendation ||
                'Atmospheric parameters remain nominal. Maintain standard crosscut ventilation.'}
            </div>

            {trends?.forecast?.key_drivers && trends.forecast.key_drivers.length > 0 && (() => {
              const seen = new Set<string>();
              const sanitizedDrivers = trends.forecast.key_drivers
                .map((rawDrv) => humanizePhysicalEffector(rawDrv.label, rawDrv.effect))
                .filter((drv) => {
                  if (seen.has(drv.label)) return false;
                  seen.add(drv.label);
                  return true;
                })
                .slice(0, 3);

              return (
                <div className="mt-4">
                  <span className="text-xs font-semibold text-[#8797A8]">
                    Primary Physical Influencing Factors:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
                    {sanitizedDrivers.map((drv, idx) => {
                      const isIssue =
                        drv.label.includes('is an issue') ||
                        drv.label.includes('degraded') ||
                        drv.label.includes('is rising') ||
                        drv.label.includes('too much') ||
                        drv.label.includes('elevated');

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded border text-xs transition-all ${
                            isIssue ? 'bg-[#FEF6F5] border-[#FBD6D0]' : 'bg-white border-[#E9EBEC]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-[#182B3A]">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isIssue ? 'bg-[#F06548]' : 'bg-[#0AB39C]'
                              }`}
                            />
                            <span>{drv.label}</span>
                          </div>
                          <div className="text-[11px] text-[#8797A8] mt-1 pl-3.5">
                            {drv.effect}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Interactive Chart with 1.0% Threshold Line */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A]">
                  Sensor History & Warning Threshold
                </h3>
                <p className="text-xs text-[#8797A8]">
                  Telemetry progression for {ZONE_LABELS[selectedZone] || selectedZone}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 font-mono text-[#F06548] font-bold">
                  <span className="w-2.5 h-0.5 bg-[#F06548]" /> 1.0% Warning Level
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              {trends?.history && trends.history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends.history} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(val) => {
                        try {
                          return val.split(' ')[1] || val;
                        } catch {
                          return val;
                        }
                      }}
                      tick={{ fill: '#8797A8', fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="methane"
                      domain={[0, (dataMax: number) => Math.max(1.5, Math.ceil((dataMax + 0.2) * 10) / 10)]}
                      tick={{ fill: '#8797A8', fontSize: 10 }}
                      unit="%"
                    />
                    <YAxis
                      yAxisId="airflow"
                      orientation="right"
                      domain={[0, 35]}
                      tick={{ fill: '#8797A8', fontSize: 10 }}
                      unit=" m³/s"
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => {
                        if (name === 'Methane') return [`${Number(value).toFixed(2)}%`, 'Methane (CH₄)'];
                        if (name === 'Airflow') return [`${Number(value).toFixed(1)} m³/s`, 'Ventilation Airflow'];
                        return [value, name];
                      }}
                      labelFormatter={(lbl) => `Time: ${lbl}`}
                      contentStyle={{ backgroundColor: '#182B3A', border: 'none', borderRadius: '6px', color: '#fff' }}
                    />
                    <Legend />
                    <ReferenceLine
                      yAxisId="methane"
                      y={1.0}
                      stroke="#F06548"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{ value: '1.0% Threshold', fill: '#F06548', position: 'top', fontSize: 10 }}
                    />
                    <Line
                      yAxisId="methane"
                      type="monotone"
                      dataKey="methane_pct"
                      name="Methane"
                      stroke="#F7B84B"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="airflow"
                      type="monotone"
                      dataKey="airflow"
                      name="Airflow"
                      stroke="#405189"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#8797A8]">
                  Loading sensor readings...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WARNINGS */}
      {activeTab === 'warnings' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label htmlFor="severity-filter" className="text-xs text-[#8797A8] mr-2">Severity:</label>
                <select
                  id="severity-filter"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-[#F8F9FA] border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-semibold text-[#182B3A]"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="ELEVATED">Elevated</option>
                  <option value="MODERATE">Moderate</option>
                </select>
              </div>

              <div>
                <label htmlFor="area-filter" className="text-xs text-[#8797A8] mr-2">Area:</label>
                <select
                  id="area-filter"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  className="bg-[#F8F9FA] border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-semibold text-[#182B3A]"
                >
                  <option value="ALL">All Areas</option>
                  {Object.entries(ZONE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-[#495057] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeOnlyFilter}
                  onChange={(e) => setActiveOnlyFilter(e.target.checked)}
                  className="rounded border-[#D9DDE3]"
                />
                <span>Active Incidents Only</span>
              </label>
            </div>

            <span className="text-xs font-semibold text-[#8797A8]">
              {warningsData?.warnings?.length ?? 0} Incidents Logged
            </span>
          </div>

          {/* Warnings List / Table */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FA] text-[#8797A8] uppercase font-semibold text-[10px] tracking-wider border-b border-[#E9EBEC]">
                  <tr>
                    <th className="px-4 py-3">Event ID</th>
                    <th className="px-4 py-3">Monitoring Area</th>
                    <th className="px-4 py-3">Start Time</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Peak CH₄</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBEC]">
                  {warningsData?.warnings && warningsData.warnings.length > 0 ? (
                    warningsData.warnings.map((w) => (
                      <tr key={w.event_id} className="hover:bg-[#F9FAFC] transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-[#405189]">
                          {w.event_id}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#182B3A]">
                          {w.zone_name}
                        </td>
                        <td className="px-4 py-3 text-[#8797A8] font-mono">
                          {formatDateTime(w.start_time)}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {w.duration_minutes} min
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#F06548]">
                          {w.peak_methane.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              w.severity === 'CRITICAL'
                                ? 'bg-[#F06548] text-white'
                                : w.severity === 'ELEVATED'
                                ? 'bg-[#F7B84B]/20 text-[#B88728]'
                                : 'bg-[#405189]/10 text-[#405189]'
                            }`}
                          >
                            {w.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              w.current_status === 'ACTIVE'
                                ? 'bg-[#F06548]/15 text-[#F06548] animate-pulse'
                                : 'bg-[#0AB39C]/10 text-[#0AB39C]'
                            }`}
                          >
                            {w.current_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#495057] max-w-xs truncate">
                          {w.observed_outcome}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setInspectingWarning(w)}
                            className="p-1 rounded hover:bg-[#E9EBEC] text-[#405189] cursor-pointer"
                            title="Inspect details"
                            aria-label="Inspect details"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs text-[#8797A8]">
                        No warning events found matching the selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal / Drawer for Inspecting a Warning */}
          {inspectingWarning && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#182B3A]">
                      Incident Inspection — {inspectingWarning.event_id}
                    </h3>
                    <p className="text-xs text-[#8797A8]">{inspectingWarning.zone_name}</p>
                  </div>
                  <button
                    onClick={() => setInspectingWarning(null)}
                    className="p-1 text-[#8797A8] hover:text-[#182B3A] cursor-pointer"
                    aria-label="Close modal"
                  >
                    <XCircle size={18} />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                    <span className="text-[#8797A8]">Start Time:</span>
                    <span className="font-mono font-bold text-[#182B3A]">{formatDateTime(inspectingWarning.start_time)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                    <span className="text-[#8797A8]">Peak Concentration:</span>
                    <span className="font-mono font-bold text-[#F06548]">{inspectingWarning.peak_methane.toFixed(2)}% CH₄</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                    <span className="text-[#8797A8]">Duration Exceeding 1.0%:</span>
                    <span className="font-mono font-bold text-[#182B3A]">{inspectingWarning.duration_minutes} minutes</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
                    <span className="text-[#8797A8]">Severity Rating:</span>
                    <span className="font-bold text-[#F06548]">{inspectingWarning.severity}</span>
                  </div>
                  <div className="py-2">
                    <span className="text-[#8797A8] block mb-1">Description:</span>
                    <p className="bg-[#F8F9FA] p-2.5 rounded border border-[#E9EBEC] text-[#495057]">
                      {inspectingWarning.description}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#E9EBEC]">
                  <button
                    onClick={() => {
                      setSelectedZone(inspectingWarning.zone_id);
                      setInspectingWarning(null);
                      setActiveTab('trends');
                    }}
                    className="px-3 py-1.5 bg-[#405189] text-white rounded text-xs font-semibold hover:bg-[#364473] cursor-pointer"
                  >
                    View Sensor Trends
                  </button>
                  <button
                    onClick={() => setInspectingWarning(null)}
                    className="px-3 py-1.5 border border-[#D9DDE3] text-[#495057] rounded text-xs font-medium hover:bg-[#F3F3F9] cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
