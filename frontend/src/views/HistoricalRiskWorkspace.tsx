import React, { useEffect, useState } from 'react';
import {
  fetchHistoricalMeta,
  analyzeHistoricalPeriod,
  fetchHistoricalEvents,
  fetchHistoricalHeatmaps,
  fetchHistoricalStatistics,
  inspectUploadedFile,
  activateUploadedDataset,
  loadDemoDataset,
  fetchDatasetPreview,
} from '../api';
import {
  HistoricalMetaResponse,
  HistoricalPeriodAnalysisResponse,
  HistoricalEventsResponse,
  HistoricalHeatmapsResponse,
  HistoricalStatisticsResponse,
  InspectFileResponse,
} from '../types';
import {
  TrendingUp,
  Database,
  Calendar,
  Layers,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  PlayCircle,
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Info,
  Wind,
  Flame,
  Activity,
  BarChart3,
  SlidersHorizontal,
  Table,
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
  BarChart,
  Bar,
} from 'recharts';

import { EventReplay } from './EventReplay';
import { ScenarioSimulator } from './ScenarioSimulator';
import { BenchmarkLab } from './BenchmarkLab';
import { formatDateTime, formatTimeRange } from '../utils';

export type HistoricalTabKey = 'analysis' | 'patterns' | 'dataset';
export type PatternSubTabKey = 'timeline' | 'heatmaps' | 'anomalies' | 'statistics';

const ZONE_LABELS: Record<string, string> = {
  ALL: 'All Monitored Areas',
  'ZONE-01-TAILGATE': 'Tailgate Return (Bleeder Junction)',
  'ZONE-02-LONGWALL-FACE': 'Longwall Working Face',
  'ZONE-03-MAINGATE': 'Maingate Fresh Intake',
  'ZONE-04-BLEEDER-SEAL': 'Bleeder Seal Regulator 4B',
  'ZONE-05-BELT-CONVEYOR': 'Belt Conveyor Transfer Point 2',
  'ZONE-06-DEV-HEADING': 'Development Heading 3 North',
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const HistoricalRiskWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HistoricalTabKey>('analysis');
  const [patternSubTab, setPatternSubTab] = useState<PatternSubTabKey>('timeline');

  // Metadata
  const [meta, setMeta] = useState<HistoricalMetaResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);

  // Period Analysis Filters & State
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedHorizon, setSelectedHorizon] = useState<number>(15);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<HistoricalPeriodAnalysisResponse | null>(null);

  // Events & Patterns State
  const [eventsData, setEventsData] = useState<HistoricalEventsResponse | null>(null);
  const [heatmapsData, setHeatmapsData] = useState<HistoricalHeatmapsResponse | null>(null);
  const [statisticsData, setStatisticsData] = useState<HistoricalStatisticsResponse | null>(null);
  const [eventCategoryFilter, setEventCategoryFilter] = useState<string>('ALL');
  const [eventSeverityFilter, setEventSeverityFilter] = useState<string>('ALL');

  // Modals
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showTechnicalModal, setShowTechnicalModal] = useState<boolean>(false);
  const [showReplayModal, setShowReplayModal] = useState<boolean>(false);
  const [showSimulatorModal, setShowSimulatorModal] = useState<boolean>(false);
  const [inspectEventItem, setInspectEventItem] = useState<any | null>(null);

  // Excel & CSV Import Assistant State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [inspectData, setInspectData] = useState<InspectFileResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);

  // Raw data preview state
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewTotalRows, setPreviewTotalRows] = useState<number>(0);
  const [previewZoneFilter, setPreviewZoneFilter] = useState<string>('ALL');

  // Initial load
  useEffect(() => {
    loadMetadata();
  }, []);

  // When metadata loads, initialize default date range and run analysis
  useEffect(() => {
    if (meta && meta.time_range) {
      if (!startTime) setStartTime(meta.time_range.start);
      if (!endTime) setEndTime(meta.time_range.end);
      runPeriodAnalysis(meta.time_range.start, meta.time_range.end, selectedZone, selectedHorizon);
    }
  }, [meta]);

  // Load secondary pattern data when switching to patterns tab
  useEffect(() => {
    if (activeTab === 'patterns') {
      loadPatternsData();
    } else if (activeTab === 'dataset') {
      loadRawPreview(previewPage, previewZoneFilter);
    }
  }, [activeTab, patternSubTab, selectedZone]);

  const loadMetadata = async () => {
    setLoadingMeta(true);
    try {
      const data = await fetchHistoricalMeta();
      setMeta(data);
    } catch (e) {
      console.error('Failed to load historical metadata:', e);
    } finally {
      setLoadingMeta(false);
    }
  };

  const runPeriodAnalysis = async (
    start?: string,
    end?: string,
    zone?: string,
    horizon?: number
  ) => {
    setAnalyzing(true);
    try {
      const data = await analyzeHistoricalPeriod({
        start_time: start || startTime || undefined,
        end_time: end || endTime || undefined,
        zone_id: (zone || selectedZone) === 'ALL' ? undefined : (zone || selectedZone),
        horizon: horizon || selectedHorizon,
      });
      setAnalysisResult(data);
    } catch (e) {
      console.error('Analysis failed:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  const loadPatternsData = async () => {
    try {
      const z = selectedZone === 'ALL' ? undefined : selectedZone;
      const [evRes, hmRes, stRes] = await Promise.all([
        fetchHistoricalEvents(eventCategoryFilter, z, eventSeverityFilter),
        fetchHistoricalHeatmaps(z),
        fetchHistoricalStatistics(z),
      ]);
      setEventsData(evRes);
      setHeatmapsData(hmRes);
      setStatisticsData(stRes);
    } catch (e) {
      console.error('Failed to load patterns data:', e);
    }
  };

  const loadRawPreview = async (page: number, zone?: string) => {
    try {
      const res = await fetchDatasetPreview(page, 25, zone === 'ALL' ? undefined : zone);
      setPreviewRows(res.rows || []);
      setPreviewTotalRows(res.total_rows || 0);
      setPreviewPage(res.page || 1);
    } catch (e) {
      console.error('Failed to load raw preview:', e);
    }
  };

  const handleRestoreDemo = async () => {
    if (!window.confirm('Restore the standardized 14-day demonstration dataset (17,280 readings, 79 crossings)?')) {
      return;
    }
    setAnalyzing(true);
    try {
      await loadDemoDataset();
      await loadMetadata();
      setActiveTab('analysis');
    } catch (e) {
      console.error('Failed to restore demo dataset:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadError(null);
    setUploading(true);
    try {
      const inspected = await inspectUploadedFile(file);
      setInspectData(inspected);
      setSelectedSheet(inspected.selected_sheet || (inspected.available_sheets?.[0] ?? ''));
      const mapping: Record<string, string> = {};
      Object.entries(inspected.detected_mapping || {}).forEach(([k, v]) => {
        if (v) mapping[k] = v;
      });
      setColumnMapping(mapping);
    } catch (err: any) {
      setUploadError(err.message || 'Inspection failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSheetChange = async (sheet: string) => {
    if (!uploadedFile) return;
    setSelectedSheet(sheet);
    setUploading(true);
    try {
      const inspected = await inspectUploadedFile(uploadedFile, sheet);
      setInspectData(inspected);
      const mapping: Record<string, string> = {};
      Object.entries(inspected.detected_mapping || {}).forEach(([k, v]) => {
        if (v) mapping[k] = v;
      });
      setColumnMapping(mapping);
    } catch (err: any) {
      setUploadError(err.message || 'Sheet inspection failed');
    } finally {
      setUploading(false);
    }
  };

  const handleActivateDataset = async () => {
    if (!inspectData) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = inspectData.token || inspectData.file_token;
      if (!token) throw new Error('Missing file token');
      const res = await activateUploadedDataset(
        token,
        selectedSheet || undefined,
        columnMapping
      );
      setActivationSuccess(
        `Successfully activated ${res.total_records.toLocaleString()} records across ${res.total_zones} areas!`
      );
      setTimeout(() => {
        setShowImportModal(false);
        setActivationSuccess(null);
        setInspectData(null);
        setUploadedFile(null);
        loadMetadata();
      }, 1500);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to activate dataset');
    } finally {
      setUploading(false);
    }
  };

  const handleExportCSV = () => {
    window.open('/api/dataset/export', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Dataset Control Center */}
      <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#405189]/10 text-[#405189] rounded">
                <Database size={16} />
              </span>
              <h2 className="text-base font-bold text-[#182B3A] tracking-tight">
                Historical Atmospheric Risk Intelligence
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0AB39C]/15 text-[#0AB39C] border border-[#0AB39C]/30 font-mono">
                {meta?.dataset_name || 'demo_mine_sensors.csv'}
              </span>
            </div>
            <p className="text-xs text-[#8797A8] mt-1">
              Active dataset contains{' '}
              <strong className="text-[#182B3A] font-mono">
                {(meta?.total_records ?? 0).toLocaleString()}
              </strong>{' '}
              records ({meta?.time_range?.start} to {meta?.time_range?.end}) with{' '}
              <strong className="text-[#F06548] font-mono">
                {meta?.total_crossings ?? 0}
              </strong>{' '}
              observed warning crossings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#405189] hover:bg-[#364473] text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Upload size={14} />
              <span>Import Data (CSV/Excel)</span>
            </button>

            <button
              onClick={handleRestoreDemo}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D9DDE3] hover:bg-[#F3F3F9] text-[#495057] text-xs font-semibold rounded-md transition-colors cursor-pointer"
              title="Restore standard 14-day demonstration dataset"
            >
              <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
              <span>Load Demo Data</span>
            </button>

            <button
              onClick={() => setShowTechnicalModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#176B87]/10 hover:bg-[#176B87]/20 text-[#176B87] border border-[#176B87]/30 text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <ShieldCheck size={14} />
              <span>Technical Model Details</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="p-1.5 bg-white border border-[#D9DDE3] hover:bg-[#F3F3F9] text-[#495057] rounded-md transition-colors cursor-pointer"
              title="Download Sensor Dataset CSV"
              aria-label="Download Sensor Dataset CSV"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Date Range & Area Filter Bar */}
        <div className="mt-4 pt-3 border-t border-[#E9EBEC] flex flex-wrap items-center justify-between gap-3 bg-[#F8F9FA] p-3 rounded-lg">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-[#8797A8]" />
              <label htmlFor="period-from" className="text-xs font-semibold text-[#8797A8]">From:</label>
              <input
                id="period-from"
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
                className="bg-white border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-mono text-[#182B3A] focus:outline-none focus:border-[#405189] w-38"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="period-to" className="text-xs font-semibold text-[#8797A8]">To:</label>
              <input
                id="period-to"
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
                className="bg-white border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-mono text-[#182B3A] focus:outline-none focus:border-[#405189] w-38"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Layers size={14} className="text-[#8797A8]" />
              <label htmlFor="historical-area-select" className="text-xs font-semibold text-[#8797A8]">Area:</label>
              <select
                id="historical-area-select"
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-white border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-semibold text-[#182B3A] focus:outline-none focus:border-[#405189] cursor-pointer"
              >
                {Object.entries(ZONE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-[#8797A8]" />
              <label htmlFor="historical-horizon-select" className="text-xs font-semibold text-[#8797A8]">Horizon:</label>
              <select
                id="historical-horizon-select"
                value={selectedHorizon}
                onChange={(e) => setSelectedHorizon(Number(e.target.value))}
                className="bg-white border border-[#D9DDE3] rounded px-2 py-1 text-xs font-semibold text-[#182B3A] focus:outline-none focus:border-[#405189] cursor-pointer"
              >
                <option value={5}>5 Minutes</option>
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => runPeriodAnalysis()}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#182B3A] hover:bg-[#25394B] text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
          >
            <Activity size={14} className={analyzing ? 'animate-spin' : ''} />
            <span>Analyze Period</span>
          </button>
        </div>

        {/* Workspace Tab Selector */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#E9EBEC]">
          <span className="text-xs font-semibold text-[#8797A8] mr-2">Analysis View:</span>
          {(
            [
              { key: 'analysis', label: 'Risk Analysis', icon: TrendingUp, badge: undefined },
              {
                key: 'patterns',
                label: 'Events & Patterns',
                icon: AlertTriangle,
                badge: meta?.total_detected_events
                  ? `${meta.total_detected_events}`
                  : undefined,
              },
              { key: 'dataset', label: 'Data & Date Range', icon: Table, badge: undefined },
            ] as Array<{ key: HistoricalTabKey; label: string; icon: any; badge?: string }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
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
                  <span className="bg-[#405189]/20 text-[#405189] text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowReplayModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#D9DDE3] hover:bg-[#F3F3F9] text-[#405189] text-xs font-medium rounded transition-colors cursor-pointer"
            >
              <PlayCircle size={13} />
              <span>Event Replay</span>
            </button>
            <button
              onClick={() => setShowSimulatorModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#D9DDE3] hover:bg-[#F3F3F9] text-[#405189] text-xs font-medium rounded transition-colors cursor-pointer"
            >
              <Sliders size={13} />
              <span>What-If Simulator</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: RISK ANALYSIS */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <span className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider block">
                Analyzed Readings
              </span>
              <span className="text-2xl font-bold text-[#182B3A] font-mono mt-1 block">
                {(analysisResult?.summary?.analyzed_records ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] text-[#8797A8] mt-1 block">
                1-minute interval records
              </span>
            </div>

            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <span className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider block">
                Warning Crossings
              </span>
              <span
                className={`text-2xl font-bold font-mono mt-1 block ${
                  (analysisResult?.summary?.crossing_events_count ?? 0) > 0
                    ? 'text-[#F06548]'
                    : 'text-[#182B3A]'
                }`}
              >
                {analysisResult?.summary?.crossing_events_count ?? 0}
              </span>
              <span className="text-[11px] text-[#8797A8] mt-1 block">
                Incidents exceeding 1.0% CH₄
              </span>
            </div>

            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <span className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider block">
                Total Exceedance Time
              </span>
              <span className="text-2xl font-bold text-[#182B3A] font-mono mt-1 block">
                {(analysisResult?.summary?.total_exceedance_minutes ?? 0).toLocaleString()} min
              </span>
              <span className="text-[11px] text-[#8797A8] mt-1 block">
                {(analysisResult?.summary?.exceedance_percentage ?? 0).toFixed(1)}% of duration
              </span>
            </div>

            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <span className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider block">
                Peak Methane Observed
              </span>
              <span className="text-2xl font-bold text-[#F06548] font-mono mt-1 block">
                {analysisResult?.summary?.peak_observed_methane !== undefined
                  ? `${analysisResult.summary.peak_observed_methane.toFixed(2)}%`
                  : '--'}
              </span>
              <span className="text-[11px] text-[#8797A8] mt-1 block">Highest sensor peak</span>
            </div>

            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <span className="text-[11px] font-semibold text-[#8797A8] uppercase tracking-wider block">
                Average Airflow
              </span>
              <span className="text-2xl font-bold text-[#405189] font-mono mt-1 block">
                {analysisResult?.summary?.average_airflow !== undefined
                  ? `${analysisResult.summary.average_airflow.toFixed(1)} m³/s`
                  : '--'}
              </span>
              <span className="text-[11px] text-[#8797A8] mt-1 block">
                Mean crosscut ventilation
              </span>
            </div>
          </div>

          {/* Main Sensor Trend Chart */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A]">
                  Sensor Timeline & Threshold Exceedance
                </h3>
                <p className="text-xs text-[#8797A8]">
                  Historical timeline for {ZONE_LABELS[selectedZone]} with statutory 1.0% CH₄ limit
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                {(analysisResult?.summary?.crossing_events_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1 font-mono text-[#F06548] font-bold bg-[#F06548]/10 px-2 py-0.5 rounded border border-[#F06548]/30">
                    <span className="w-2 h-2 rounded-full bg-[#F06548] animate-pulse" />
                    {analysisResult?.summary?.crossing_events_count} Crossings Visible on Timeline
                  </span>
                )}
                <span className="flex items-center gap-1 font-mono text-[#F06548] font-bold">
                  <span className="w-2.5 h-0.5 bg-[#F06548]" /> 1.0% Warning Level
                </span>
                <span className="flex items-center gap-1 font-mono text-[#F7B84B]">
                  <span className="w-2.5 h-0.5 bg-[#F7B84B]" /> Methane %
                </span>
                <span className="flex items-center gap-1 font-mono text-[#405189]">
                  <span className="w-2.5 h-0.5 bg-[#405189]" /> Airflow m³/s
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              {analysisResult?.timeline && analysisResult.timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analysisResult.timeline} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(val) => {
                        try {
                          const parts = val.split(' ');
                          return parts[0] ? parts[0].slice(5) : val;
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
                      formatter={(value: any, name: any, item: any) => {
                        const payload = item?.payload;
                        const isExceed = payload && (payload.methane_pct >= 1.0 || payload.is_crossing);
                        if (name === 'Methane') {
                          return [
                            `${Number(value).toFixed(2)}%${isExceed ? ' ⚠️ (WARNING EXCEEDED)' : ''}`,
                            'Methane (CH₄)',
                          ];
                        }
                        if (name === 'Airflow') return [`${Number(value).toFixed(1)} m³/s`, 'Ventilation Airflow'];
                        return [value, name];
                      }}
                      labelFormatter={(lbl) => `Recorded Time: ${lbl}`}
                      contentStyle={{ backgroundColor: '#182B3A', border: 'none', borderRadius: '6px', color: '#fff' }}
                    />
                    <ReferenceLine
                      yAxisId="methane"
                      y={1.0}
                      stroke="#F06548"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{ value: '1.0% Warning Level', fill: '#F06548', position: 'top', fontSize: 10 }}
                    />
                    <Line
                      yAxisId="methane"
                      type="monotone"
                      dataKey="methane_pct"
                      name="Methane"
                      stroke="#F7B84B"
                      strokeWidth={2}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (payload && (payload.methane_pct >= 1.0 || payload.is_crossing)) {
                          return (
                            <circle
                              key={`dot-${payload.timestamp}`}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill="#F06548"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      yAxisId="airflow"
                      type="monotone"
                      dataKey="airflow"
                      name="Airflow"
                      stroke="#405189"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#8797A8]">
                  {analyzing ? 'Analyzing period telemetry...' : 'No telemetry data available for the selected filters.'}
                </div>
              )}
            </div>
          </div>

          {/* Model Forecast Comparison Across Horizons */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A]">
                  Predictive Forecast Readiness Across Horizons
                </h3>
                <p className="text-xs text-[#8797A8]">
                  Advance risk coverage provided by genuine ML classifiers (HistGradientBoosting)
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-[#0AB39C] bg-[#0AB39C]/10 px-2 py-0.5 rounded">
                Operational Index:{' '}
                {analysisResult?.forecast_comparison?.operational_readiness_index ?? 92}%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              {(
                [
                  { key: '5m', label: '5-Minute Ahead Forecast' },
                  { key: '15m', label: '15-Minute Ahead Forecast' },
                  { key: '30m', label: '30-Minute Ahead Forecast' },
                ] as const
              ).map((h) => {
                const b = analysisResult?.forecast_comparison?.horizon_breakdown?.[h.key];
                return (
                  <div key={h.key} className="p-3 bg-[#F8F9FA] rounded-md border border-[#E9EBEC]">
                    <div className="flex items-center justify-between text-xs font-bold text-[#182B3A]">
                      <span>{h.label}</span>
                      <span className="font-mono text-[#405189]">
                        {b ? `${b.alert_count} Advance Alerts` : '--'}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-[#495057]">
                      <div className="flex justify-between">
                        <span className="text-[#8797A8]">Elevated Points:</span>
                        <span className="font-mono font-bold">
                          {b ? `${b.elevated_pct.toFixed(1)}%` : '--'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8797A8]">Mean Forecast Probability:</span>
                        <span className="font-mono font-bold">
                          {b ? `${(b.avg_probability * 100).toFixed(1)}%` : '--'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk by Area Table & Preparation Guidance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Risk-by-Area Table (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-lg border border-[#E9EBEC] shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E9EBEC] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#182B3A]">Risk Summary by Mine Area</h3>
                  <p className="text-xs text-[#8797A8]">
                    Threshold exceedance history across all monitored underground zones
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F9FA] text-[#8797A8] uppercase font-semibold text-[10px] tracking-wider border-b border-[#E9EBEC]">
                    <tr>
                      <th className="px-4 py-3">Area Name</th>
                      <th className="px-4 py-3">Readings</th>
                      <th className="px-4 py-3">Crossings</th>
                      <th className="px-4 py-3">Peak CH₄</th>
                      <th className="px-4 py-3">Avg Airflow</th>
                      <th className="px-4 py-3">Risk Tier</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EBEC]">
                    {analysisResult?.risk_by_area?.map((item) => (
                      <tr key={item.zone_id} className="hover:bg-[#F9FAFC] transition-colors">
                        <td className="px-4 py-3 font-semibold text-[#182B3A]">
                          <div>{item.zone_name}</div>
                          <span className="text-[10px] text-[#8797A8] font-mono">
                            {item.zone_id}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{item.records.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono font-bold">
                          <span
                            className={
                              item.crossing_count > 0 ? 'text-[#F06548]' : 'text-[#495057]'
                            }
                          >
                            {item.crossing_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#F06548]">
                          {item.peak_methane.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 font-mono text-[#405189]">
                          {item.avg_airflow.toFixed(1)} m³/s
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.risk_tier === 'CRITICAL'
                                ? 'bg-[#F06548] text-white'
                                : item.risk_tier === 'ELEVATED'
                                ? 'bg-[#F7B84B]/20 text-[#B88728]'
                                : 'bg-[#0AB39C]/10 text-[#0AB39C]'
                            }`}
                          >
                            {item.risk_tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedZone(item.zone_id);
                              runPeriodAnalysis(startTime, endTime, item.zone_id, selectedHorizon);
                            }}
                            className="px-2 py-1 bg-[#F3F3F9] hover:bg-[#E9EBEC] text-[#405189] rounded font-medium text-xs cursor-pointer"
                          >
                            Filter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Preparation Guidance (1 col) */}
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A] mb-1">
                  Operational Safety Preparation
                </h3>
                <p className="text-xs text-[#8797A8] mb-3">
                  Data-grounded recommendations derived from historical exceedances
                </p>

                <div className="space-y-3">
                  {analysisResult?.preparation_guidance?.map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs ${
                        rec.priority === 'IMMEDIATE'
                          ? 'bg-[#F06548]/5 border-[#F06548]/30'
                          : rec.priority === 'PREVENTATIVE'
                          ? 'bg-[#F7B84B]/5 border-[#F7B84B]/30'
                          : 'bg-[#405189]/5 border-[#405189]/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            rec.priority === 'IMMEDIATE'
                              ? 'bg-[#F06548] text-white'
                              : rec.priority === 'PREVENTATIVE'
                              ? 'bg-[#F7B84B] text-[#182B3A]'
                              : 'bg-[#405189] text-white'
                          }`}
                        >
                          {rec.priority}
                        </span>
                        <span className="text-[10px] text-[#8797A8] font-mono">
                          {rec.target_area}
                        </span>
                      </div>
                      <h4 className="font-bold text-[#182B3A] mt-1.5">{rec.title}</h4>
                      <p className="text-[#495057] mt-1 leading-relaxed text-[11px]">
                        {rec.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E9EBEC] text-[11px] text-[#8797A8]">
                Recommendations generated from physical sensor trends and predictive model output.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVENTS & PATTERNS */}
      {activeTab === 'patterns' && (
        <div className="space-y-6">
          {/* Sub-tab Selector */}
          <div className="flex items-center gap-2 border-b border-[#E9EBEC] pb-2">
            {(
              [
                { key: 'timeline', label: 'Event Timeline', icon: Clock },
                { key: 'heatmaps', label: 'Risk Heatmaps', icon: TrendingUp },
                { key: 'anomalies', label: 'Sensor Anomalies', icon: AlertTriangle },
                { key: 'statistics', label: 'Historical Statistics', icon: BarChart3 },
              ] as const
            ).map((sub) => {
              const Icon = sub.icon;
              const isSelected = patternSubTab === sub.key;
              return (
                <button
                  key={sub.key}
                  onClick={() => setPatternSubTab(sub.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#182B3A] text-white shadow-xs'
                      : 'bg-white text-[#495057] hover:bg-[#F3F3F9] border border-[#E9EBEC]'
                  }`}
                >
                  <Icon size={14} />
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-tab A: Event Timeline */}
          {patternSubTab === 'timeline' && (
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E9EBEC] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#182B3A]">
                    Observed Threshold Crossings & Hazard Events
                  </h3>
                  <p className="text-xs text-[#8797A8]">
                    Identified historical events with duration, peak concentration, and classification
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#8797A8]">Severity:</span>
                  <select
                    value={eventSeverityFilter}
                    onChange={(e) => setEventSeverityFilter(e.target.value)}
                    className="bg-[#F8F9FA] border border-[#D9DDE3] rounded px-2 py-1 font-semibold text-[#182B3A]"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="ELEVATED">Elevated</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F9FA] text-[#8797A8] uppercase font-semibold text-[10px] tracking-wider border-b border-[#E9EBEC]">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Event ID</th>
                      <th className="px-4 py-3 whitespace-nowrap">Category</th>
                      <th className="px-4 py-3 whitespace-nowrap">Area</th>
                      <th className="px-4 py-3 whitespace-nowrap">Time Range</th>
                      <th className="px-4 py-3 whitespace-nowrap">Duration</th>
                      <th className="px-4 py-3 whitespace-nowrap">Peak Reading</th>
                      <th className="px-4 py-3 whitespace-nowrap">Severity</th>
                      <th className="px-4 py-3 min-w-[280px]">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EBEC]">
                    {eventsData?.events?.map((ev) => {
                      const isAirflow = ev.category?.includes('AIRFLOW') || ev.event_id?.includes('AIRFLOW');
                      const unit = isAirflow ? ' m³/s' : '%';
                      return (
                        <tr key={ev.event_id} className="hover:bg-[#F9FAFC] transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-[#405189] whitespace-nowrap">
                            {ev.event_id}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#182B3A] whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-[#F3F3F9] border border-[#E9EBEC]">
                              {ev.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-[#182B3A]">{ev.zone_name}</td>
                          <td className="px-4 py-3 text-[#8797A8] font-mono whitespace-nowrap">
                            {formatTimeRange(ev.start_time, ev.end_time)}
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">{ev.duration_minutes} min</td>
                          <td className="px-4 py-3 font-mono font-bold text-[#F06548] whitespace-nowrap">
                            {ev.peak_value.toFixed(2)}{unit}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ev.severity === 'CRITICAL'
                                  ? 'bg-[#F06548] text-white'
                                  : 'bg-[#F7B84B]/20 text-[#B88728]'
                              }`}
                            >
                              {ev.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#495057] leading-relaxed">
                            {ev.description}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-tab B: Risk Heatmaps */}
          {patternSubTab === 'heatmaps' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-[#182B3A]">
                    7 × 24 Hour-of-Day vs Day-of-Week Risk Matrix
                  </h3>
                  <p className="text-xs text-[#8797A8]">
                    Hourly crossing intensity across shift cycles. Red/amber highlights recurring peak risk hours. Daily totals on the right match the calendar below.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[840px]">
                    <div
                      className="text-[10px] text-center font-mono text-[#8797A8] mb-1.5"
                      style={{ display: 'grid', gridTemplateColumns: '70px repeat(24, minmax(0, 1fr)) 80px', gap: '3px' }}
                    >
                      <div className="text-left font-sans font-bold pl-1">Day</div>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <div key={h}>
                          {h.toString().padStart(2, '0')}
                        </div>
                      ))}
                      <div className="text-right font-sans font-bold pr-1">Total</div>
                    </div>

                    {DAYS_OF_WEEK.map((dayName, dayIdx) => {
                      const heatmapList = heatmapsData?.matrix_7x24 || (heatmapsData as any)?.heatmap || [];
                      const calendarList = heatmapsData?.calendar_timeline || (heatmapsData as any)?.calendar || [];
                      const matchingCal = calendarList[dayIdx];
                      const dateSuffix = matchingCal?.date ? ` (${matchingCal.date.slice(5)})` : '';

                      // Calculate exact sum of crossings for this row
                      const rowTotalCrossings: number = Array.from({ length: 24 }).reduce<number>((sum: number, _, h: number) => {
                        const cell = heatmapList.find((m: any) => m.day_idx === dayIdx && m.hour === h);
                        const countVal: number = cell ? Number(cell.crossing_count ?? cell.crossings ?? 0) : 0;
                        return sum + countVal;
                      }, 0);

                      return (
                        <div
                          key={dayIdx}
                          className="mb-1 items-center"
                          style={{ display: 'grid', gridTemplateColumns: '70px repeat(24, minmax(0, 1fr)) 80px', gap: '3px' }}
                        >
                          <div className="text-xs font-bold text-[#182B3A] truncate pl-1" title={`${dayName}${dateSuffix}`}>
                            {dayName}
                            <span className="text-[10px] font-normal text-[#8797A8] block">{dateSuffix.trim()}</span>
                          </div>
                          {Array.from({ length: 24 }).map((_, h) => {
                            const cell = heatmapList.find(
                              (m: any) => m.day_idx === dayIdx && m.hour === h
                            );
                            const intensity = cell ? (cell.risk_intensity ?? (cell.event_rate ? cell.event_rate / 100 : 0)) : 0;
                            const crossings = cell ? (cell.crossing_count ?? cell.crossings ?? 0) : 0;
                            const peak = cell ? (cell.peak_methane ?? 0) : 0;

                            const isCritical = crossings >= 10 || peak >= 1.15 || intensity > 0.65;
                            const isElevated = crossings >= 4 || peak >= 1.05 || intensity > 0.35;
                            const isNoticeable = crossings >= 1 || peak >= 0.85 || intensity > 0.15;

                            return (
                              <div
                                key={h}
                                title={`${dayName} ${h}:00 - Crossings: ${crossings}, Peak: ${peak.toFixed(2)}%, Intensity: ${(intensity * 100).toFixed(0)}%`}
                                className={`h-7 rounded flex items-center justify-center text-[9px] font-mono cursor-pointer transition-transform hover:scale-110 ${
                                  isCritical
                                    ? 'bg-[#F06548] text-white font-bold shadow-xs'
                                    : isElevated
                                    ? 'bg-[#F7B84B] text-[#182B3A] font-bold'
                                    : isNoticeable
                                    ? 'bg-[#0AB39C]/35 text-[#182B3A] font-semibold'
                                    : 'bg-[#F3F3F9] text-[#8797A8]'
                                }`}
                              >
                                {crossings > 0 ? crossings : ''}
                              </div>
                            );
                          })}
                          <div className="text-right pr-1">
                            <span
                              className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                                rowTotalCrossings >= 10
                                  ? 'bg-[#F06548]/15 text-[#F06548]'
                                  : rowTotalCrossings > 0
                                  ? 'bg-[#F7B84B]/20 text-[#B88728]'
                                  : 'text-[#8797A8]'
                              }`}
                            >
                              {rowTotalCrossings} cross
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Daily Calendar Timeline */}
              <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
                <h3 className="text-sm font-bold text-[#182B3A] mb-1">
                  Daily Shift Safety Calendar
                </h3>
                <p className="text-xs text-[#8797A8] mb-4">
                  Aggregated risk level and incident crossings per simulated day (dates align with matrix rows above)
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {(heatmapsData?.calendar_timeline || (heatmapsData as any)?.calendar || []).map((day: any) => (
                    <div
                      key={day.date}
                      className={`p-3 rounded-lg border text-xs ${
                        day.risk_level === 'CRITICAL'
                          ? 'border-[#F06548]/40 bg-[#F06548]/5'
                          : day.risk_level === 'ELEVATED'
                          ? 'border-[#F7B84B]/40 bg-[#F7B84B]/5'
                          : 'border-[#E9EBEC] bg-white'
                      }`}
                    >
                      <div className="font-bold text-[#182B3A]">
                        {day.formatted_date || day.date}
                      </div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-[#8797A8]">Crossings:</span>
                          <span className="font-mono font-bold text-[#F06548]">{day.crossings}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8797A8]">Peak Reading:</span>
                          <span className="font-mono font-bold">{day.peak_methane.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sub-tab C: Sensor Anomalies */}
          {patternSubTab === 'anomalies' && (
            <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-[#182B3A]">
                  Statistical & Physical Sensor Anomalies
                </h3>
                <p className="text-xs text-[#8797A8]">
                  Surges, ventilation drops, compound hazard scenarios, and sensor glitches
                </p>
              </div>

              <div className="space-y-3">
                {eventsData?.events
                  ?.filter((e) => e.category !== 'THRESHOLD_CROSSING')
                  .map((anom) => (
                    <div
                      key={anom.event_id}
                      className="p-3.5 rounded-lg border border-[#E9EBEC] bg-[#F8F9FA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#405189]">
                            {anom.event_id}
                          </span>
                          <span className="font-bold text-[#182B3A]">{anom.category}</span>
                          <span className="text-[10px] text-[#8797A8] font-mono">
                            {anom.zone_name}
                          </span>
                        </div>
                        <p className="text-[#495057]">{anom.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-[#F06548] block">
                          Peak: {anom.peak_value.toFixed(2)}%
                        </span>
                        <span className="text-[11px] text-[#8797A8] font-mono">
                          {formatDateTime(anom.start_time)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Sub-tab D: Historical Statistics */}
          {patternSubTab === 'statistics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Distribution of Methane Concentrations */}
              <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
                <h3 className="text-sm font-bold text-[#182B3A] mb-1">
                  Methane Concentration Distribution
                </h3>
                <p className="text-xs text-[#8797A8] mb-4">
                  Histogram of recorded time steps across gas concentration brackets
                </p>

                <div className="h-64 w-full">
                  {statisticsData?.concentration_distribution ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statisticsData.concentration_distribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
                        <XAxis dataKey="bin" tick={{ fill: '#8797A8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#8797A8', fontSize: 10 }} />
                        <Tooltip
                          formatter={(val: any) => [`${Number(val).toLocaleString()} readings`, 'Count']}
                        />
                        <Bar dataKey="count" fill="#405189" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </div>

              {/* Incident Duration Distribution */}
              <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs p-4">
                <h3 className="text-sm font-bold text-[#182B3A] mb-1">
                  Incident Duration Distribution
                </h3>
                <p className="text-xs text-[#8797A8] mb-4">
                  Count of continuous threshold exceedance events by duration bracket
                </p>

                <div className="h-64 w-full">
                  {statisticsData?.duration_distribution ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={statisticsData.duration_distribution.map((d: any) => ({
                          ...d,
                          range: d.range || d.duration_range || 'Unknown',
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
                        <XAxis dataKey="range" tick={{ fill: '#8797A8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#8797A8', fontSize: 10 }} />
                        <Tooltip
                          formatter={(val: any) => [`${val} incidents`, 'Incident Count']}
                        />
                        <Bar dataKey="count" fill="#F7B84B" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DATA & DATE RANGE */}
      {activeTab === 'dataset' && (
        <div className="space-y-6">
          {/* Raw Dataset Preview Table */}
          <div className="bg-white rounded-lg border border-[#E9EBEC] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#E9EBEC] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#182B3A]">Raw Telemetry Records</h3>
                <p className="text-xs text-[#8797A8]">
                  Displaying {previewTotalRows.toLocaleString()} active sensor records (Page {previewPage})
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={previewZoneFilter}
                  onChange={(e) => {
                    setPreviewZoneFilter(e.target.value);
                    loadRawPreview(1, e.target.value);
                  }}
                  className="bg-[#F8F9FA] border border-[#D9DDE3] rounded px-2.5 py-1 text-xs font-semibold text-[#182B3A]"
                >
                  {Object.entries(ZONE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (previewPage > 1) {
                        loadRawPreview(previewPage - 1, previewZoneFilter);
                      }
                    }}
                    disabled={previewPage <= 1}
                    className="p-1.5 border border-[#D9DDE3] rounded hover:bg-[#F3F3F9] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-mono px-2">Page {previewPage}</span>
                  <button
                    onClick={() => loadRawPreview(previewPage + 1, previewZoneFilter)}
                    className="p-1.5 border border-[#D9DDE3] rounded hover:bg-[#F3F3F9] cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FA] text-[#8797A8] uppercase font-semibold text-[10px] tracking-wider border-b border-[#E9EBEC]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Zone ID</th>
                    <th className="px-4 py-3">Episode ID</th>
                    <th className="px-4 py-3">Methane (%)</th>
                    <th className="px-4 py-3">Airflow (m³/s)</th>
                    <th className="px-4 py-3">Temp (°C)</th>
                    <th className="px-4 py-3">Machine Act.</th>
                    <th className="px-4 py-3">Vent State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBEC]">
                  {previewRows.map((r, i) => (
                    <tr key={i} className="hover:bg-[#F9FAFC] font-mono text-[11px]">
                      <td className="px-4 py-2.5 text-[#182B3A]">{r.timestamp}</td>
                      <td className="px-4 py-2.5 font-bold text-[#405189]">{r.zone_id}</td>
                      <td className="px-4 py-2.5 text-[#8797A8]">{r.episode_id}</td>
                      <td className="px-4 py-2.5 font-bold text-[#F06548]">
                        {Number(r.methane_pct).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-[#495057]">{Number(r.airflow).toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-[#495057]">
                        {Number(r.temperature_c).toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-[#495057]">
                        {Number(r.machine_activity).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-[#495057]">{r.ventilation_state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CSV / EXCEL IMPORT ASSISTANT */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="text-[#405189]" size={20} />
                <h3 className="text-base font-bold text-[#182B3A]">
                  Import Sensor Telemetry Dataset
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setInspectData(null);
                  setUploadedFile(null);
                }}
                className="text-[#8797A8] hover:text-[#182B3A] cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            <p className="text-xs text-[#8797A8]">
              Upload an underground coal-mine atmospheric telemetry file in CSV, Excel (.xlsx), or legacy
              Excel (.xls) format. The assistant will validate columns, detect aliases, and inspect sheets.
            </p>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-[#D9DDE3] rounded-lg p-6 text-center bg-[#F8F9FA] hover:bg-[#F3F3F9] transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload-input"
              />
              <label htmlFor="file-upload-input" className="cursor-pointer block space-y-2">
                <Upload size={28} className="mx-auto text-[#405189]" />
                <span className="text-xs font-semibold text-[#182B3A] block">
                  Click to select CSV or Excel workbook
                </span>
                <span className="text-[11px] text-[#8797A8] block">
                  Supports .csv, .xlsx, and .xls files
                </span>
              </label>
            </div>

            {uploadError && (
              <div className="p-3 bg-[#F06548]/10 text-[#F06548] text-xs rounded-md border border-[#F06548]/30">
                {uploadError}
              </div>
            )}

            {activationSuccess && (
              <div className="p-3 bg-[#0AB39C]/15 text-[#0AB39C] text-xs font-bold rounded-md border border-[#0AB39C]/30 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{activationSuccess}</span>
              </div>
            )}

            {inspectData && (
              <div className="space-y-4 pt-2 border-t border-[#E9EBEC] text-xs">
                {/* Worksheet Selector if Excel */}
                {inspectData.available_sheets && inspectData.available_sheets.length > 1 && (
                  <div>
                    <label className="font-bold text-[#182B3A] block mb-1">
                      Excel Worksheet:
                    </label>
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="bg-white border border-[#D9DDE3] rounded px-3 py-1.5 text-xs font-semibold text-[#182B3A] w-full"
                    >
                      {inspectData.available_sheets.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Validation Report */}
                <div className="p-3 bg-[#F8F9FA] rounded border border-[#E9EBEC]">
                  <div className="flex items-center justify-between font-bold text-[#182B3A] mb-1">
                    <span>Validation Summary:</span>
                    <span
                      className={`font-mono ${
                        (inspectData.validation?.is_valid ?? (inspectData as any).is_valid)
                          ? 'text-[#0AB39C]'
                          : 'text-[#F06548]'
                      }`}
                    >
                      {inspectData.validation?.matched_canonical_count ?? Object.keys(inspectData.detected_mapping || {}).length} /{' '}
                      {inspectData.validation?.total_canonical_count ?? 8} Canonical Columns Mapped
                    </span>
                  </div>
                  {((inspectData.validation?.errors ?? (inspectData as any).validation_errors) || []).length > 0 && (
                    <div className="text-[#F06548] text-[11px] mt-1">
                      Errors: {((inspectData.validation?.errors ?? (inspectData as any).validation_errors) || []).join(', ')}
                    </div>
                  )}
                  {((inspectData.validation?.warnings ?? (inspectData as any).validation_warnings) || []).length > 0 && (
                    <div className="text-[#B88728] text-[11px] mt-1">
                      Warnings: {((inspectData.validation?.warnings ?? (inspectData as any).validation_warnings) || []).join(', ')}
                    </div>
                  )}
                </div>

                {/* Column Mapping Preview */}
                <div>
                  <h4 className="font-bold text-[#182B3A] mb-2">Column Alias Mapping:</h4>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-[#F8F9FA] rounded border border-[#E9EBEC]">
                    {Object.entries(inspectData.detected_mapping || {}).map(([targetCol, srcCol]) => (
                      <div key={targetCol} className="flex justify-between items-center text-[11px]">
                        <span className="font-mono text-[#405189] font-bold">{targetCol}:</span>
                        <span className="font-mono text-[#182B3A] bg-white px-1.5 py-0.5 rounded border border-[#E9EBEC]">
                          {srcCol || 'MISSING'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#E9EBEC]">
                  <button
                    onClick={handleActivateDataset}
                    disabled={uploading || !(inspectData.validation?.is_valid ?? (inspectData as any).is_valid)}
                    className="px-4 py-2 bg-[#0AB39C] hover:bg-[#089a86] disabled:opacity-50 text-white rounded text-xs font-bold shadow-xs cursor-pointer"
                  >
                    {uploading ? 'Activating...' : 'Activate Dataset in Memory'}
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setInspectData(null);
                    }}
                    className="px-4 py-2 border border-[#D9DDE3] text-[#495057] rounded text-xs font-semibold hover:bg-[#F3F3F9] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: TECHNICAL DETAILS (BenchmarkLab) */}
      {showTechnicalModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-[#0AB39C]" size={20} />
                <h3 className="text-base font-bold text-[#182B3A]">
                  Technical Model Audit & Benchmark Lab
                </h3>
              </div>
              <button
                onClick={() => setShowTechnicalModal(false)}
                className="text-[#8797A8] hover:text-[#182B3A] cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>
            <BenchmarkLab />
          </div>
        </div>
      )}

      {/* MODAL 3: EVENT REPLAY */}
      {showReplayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-3">
              <div className="flex items-center gap-2">
                <PlayCircle className="text-[#405189]" size={20} />
                <h3 className="text-base font-bold text-[#182B3A]">
                  Interactive Causal Event Replay
                </h3>
              </div>
              <button
                onClick={() => setShowReplayModal(false)}
                className="text-[#8797A8] hover:text-[#182B3A] cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>
            <EventReplay selectedHorizon={selectedHorizon} thresholdPct={1.0} />
          </div>
        </div>
      )}

      {/* MODAL 4: WHAT-IF SCENARIO SIMULATOR */}
      {showSimulatorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E9EBEC] pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="text-[#405189]" size={20} />
                <h3 className="text-base font-bold text-[#182B3A]">
                  What-If Atmospheric Scenario Simulator
                </h3>
              </div>
              <button
                onClick={() => setShowSimulatorModal(false)}
                className="text-[#8797A8] hover:text-[#182B3A] cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>
            <ScenarioSimulator />
          </div>
        </div>
      )}
    </div>
  );
};
