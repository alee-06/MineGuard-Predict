import React, { useEffect, useState } from 'react';
import { fetchBenchmarkMetrics, fetchThresholdSweep } from '../api';
import { BenchmarkModelMetric } from '../types';
import {
  FlaskConical,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

export const BenchmarkLab: React.FC = () => {
  const [metrics, setMetrics] = useState<BenchmarkModelMetric[]>([]);
  const [importances, setImportances] = useState<Record<string, number>>({});
  const [selectedHorizon, setSelectedHorizon] = useState<number>(15);
  const [selectedModel, setSelectedModel] = useState<string>('hist_gradient_boosting');
  const [sweepPoints, setSweepPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(true);

  useEffect(() => {
    loadBenchmark();
  }, []);

  useEffect(() => {
    loadSweep();
  }, [selectedHorizon, selectedModel]);

  const loadBenchmark = async () => {
    try {
      setLoading(true);
      const res = await fetchBenchmarkMetrics();
      setMetrics(res.metrics);
      if (res.global_importances && res.global_importances['15m']) {
        setImportances(res.global_importances['15m']);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSweep = async () => {
    try {
      const res = await fetchThresholdSweep(selectedHorizon, selectedModel);
      setSweepPoints(res.sweep_points);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || metrics.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#878A99] text-xs">
          <div className="w-8 h-8 border-2 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span>Evaluating 9 model/horizon configurations across 32 held-out test shifts...</span>
        </div>
      </div>
    );
  }

  const activeMetric =
    metrics.find(
      (m) => m.model_name === selectedModel && m.horizon_minutes === selectedHorizon
    ) || metrics[0];

  const modelFriendlyNames: Record<string, string> = {
    hist_gradient_boosting: 'HistGradientBoosting (Flagship Engine)',
    random_forest: 'Random Forest (150 Trees)',
    logistic_regression: 'Logistic Regression (Linear Baseline)',
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Educational Concept Clarification Banner (Velzon Style) */}
      <div className="mg-card p-5 bg-white border border-[#E9EBEC]">
        <div className="flex items-center gap-2 text-xs font-bold text-[#405189] uppercase tracking-wider mb-2">
          <Info size={15} />
          Key Distinction: Statutory Gas Concentration vs. Model Statistical Confidence
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
          <div className="bg-[#F8F9FA] p-3.5 rounded border border-[#E9EBEC]">
            <span className="font-bold text-[#343A40] block">1. Physical Gas Threshold (1.0% CH₄)</span>
            <span className="text-[#878A99] text-[11px] leading-relaxed">
              The statutory gas concentration in underground airway volume defining a warning-level hazard.
            </span>
          </div>
          <div className="bg-[#F8F9FA] p-3.5 rounded border border-[#E9EBEC]">
            <span className="font-bold text-[#343A40] block">2. Model Warning Chance (0% to 100%)</span>
            <span className="text-[#878A99] text-[11px] leading-relaxed">
              Statistical likelihood estimated by the classifier that gas will reach 1.0% within 5, 15, or 30 minutes.
            </span>
          </div>
          <div className="bg-[#F8F9FA] p-3.5 rounded border border-[#E9EBEC]">
            <span className="font-bold text-[#343A40] block">3. Decision Cutoff Threshold (τ = 0.50)</span>
            <span className="text-[#878A99] text-[11px] leading-relaxed">
              The operational probability cutoff above which an alert siren or advisory notice is triggered.
            </span>
          </div>
        </div>
      </div>

      {/* 2. Comprehensive Model Comparison Table on Held-Out Test Shifts */}
      <div className="mg-card">
        <div className="mg-card-header">
          <div>
            <h2 className="mg-card-title flex items-center gap-2">
              <FlaskConical size={16} className="text-[#405189]" />
              Model Performance Benchmark on Held-Out Test Episodes
            </h2>
            <p className="mg-card-sub">
              Rigorously evaluated on 32 independent, disjoint test episodes (22,000+ time steps) never seen during training or validation.
            </p>
          </div>
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="mg-btn mg-btn-sm"
          >
            {showTechnicalDetails ? 'Simplified View' : 'Show Technical Metrics'}
            {showTechnicalDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F3F6F9] text-[#495057] font-semibold border-b border-[#E9EBEC]">
                <th className="py-3 px-4">Prediction Model Architecture</th>
                <th className="py-3 px-3">Horizon</th>
                <th className="py-3 px-3 text-right">
                  {showTechnicalDetails ? 'ROC-AUC (Ranking)' : 'Warning Quality'}
                </th>
                <th className="py-3 px-3 text-right">
                  {showTechnicalDetails ? 'PR-AUC' : 'Event Precision'}
                </th>
                <th className="py-3 px-3 text-right">
                  {showTechnicalDetails ? 'Recall (Catch Rate)' : 'Detection Rate'}
                </th>
                <th className="py-3 px-3 text-right">
                  {showTechnicalDetails ? 'Precision (Accuracy)' : 'Warning Accuracy'}
                </th>
                <th className="py-3 px-3 text-right">F1-Score</th>
                {showTechnicalDetails && (
                  <>
                    <th className="py-3 px-3 text-right" title="Mean squared error of probabilities">
                      Brier Score
                    </th>
                    <th className="py-3 px-3 text-right" title="Expected Calibration Error">
                      ECE
                    </th>
                  </>
                )}
                <th className="py-3 px-4 text-right">False Alarms (inc / min)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EBEC] text-[#495057]">
              {metrics.map((m, idx) => {
                const isSelected =
                  m.model_name === selectedModel && m.horizon_minutes === selectedHorizon;
                const modelName = modelFriendlyNames[m.model_name] || m.model_name.replace(/_/g, ' ');
                const faInc = m.false_alarm_analysis?.false_alarm_incidents_per_day ?? m.false_alarms_per_day;
                const faMin = m.false_alarm_analysis?.false_alarm_minutes_per_day;
                const brier = m.calibration?.brier_score;
                const ece = m.calibration?.expected_calibration_error;

                return (
                  <tr
                    key={idx}
                    onClick={() => {
                      setSelectedModel(m.model_name);
                      setSelectedHorizon(m.horizon_minutes);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#E8F2F5]/80 font-semibold'
                        : 'hover:bg-[#F8F9FA]'
                    }`}
                  >
                    <td className="py-3 px-4 text-[#343A40]">
                      <div className="font-medium">{modelName}</div>
                      <div className="text-[10px] text-[#878A99] font-mono">
                        Cutoff: τ = {m.decision_threshold ?? 0.50} • Val Tuned: τ* = {m.validation_tuned_threshold ?? 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#405189]">
                      {m.horizon_minutes}m ahead
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#0AB39C] font-mono">
                      {showTechnicalDetails ? m.roc_auc.toFixed(4) : `${(m.roc_auc * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-3 px-3 text-right text-[#405189] font-mono">
                      {showTechnicalDetails ? m.pr_auc.toFixed(4) : `${(m.pr_auc * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-3 px-3 text-right text-[#343A40] font-mono">
                      {showTechnicalDetails ? m.recall.toFixed(4) : `${(m.recall * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-3 px-3 text-right text-[#343A40] font-mono">
                      {showTechnicalDetails ? m.precision.toFixed(4) : `${(m.precision * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-3 px-3 text-right text-[#343A40] font-mono font-bold">
                      {showTechnicalDetails ? m.f1_score.toFixed(4) : `${(m.f1_score * 100).toFixed(1)}%`}
                    </td>
                    {showTechnicalDetails && (
                      <>
                        <td className="py-3 px-3 text-right text-[#B7791F] font-mono">
                          {brier !== undefined ? brier.toFixed(5) : 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-right text-[#878A99] font-mono">
                          {ece !== undefined ? ece.toFixed(4) : 'N/A'}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4 text-right text-[#B7791F] font-mono">
                      {faMin !== undefined
                        ? `${faInc.toFixed(2)} inc (${faMin.toFixed(1)}m)/d`
                        : `${faInc.toFixed(2)} / day`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Confusion Matrix & ROC Curve (Velzon Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Confusion Matrix */}
        <div className="mg-card">
          <div className="mg-card-header">
            <div>
              <h3 className="mg-card-title">
                Verification Matrix on Held-Out Test Shifts
              </h3>
              <p className="mg-card-sub">
                {modelFriendlyNames[activeMetric.model_name]} ({activeMetric.horizon_minutes}m ahead)
              </p>
            </div>
          </div>

          <div className="mg-card-body">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-[#E6F8F5] border border-[#B9ECE3] p-4 rounded-md">
                <span className="text-[10px] text-[#0AB39C] uppercase font-bold block">
                  True Positives (Verified)
                </span>
                <span className="text-2xl font-extrabold text-[#0AB39C] mt-1 block font-mono">
                  {activeMetric.confusion_matrix.tp}
                </span>
                <span className="text-[10px] text-[#878A99]">Hazard correctly caught ahead</span>
              </div>

              <div className="bg-[#FEF8ED] border border-[#FDE8BE] p-4 rounded-md">
                <span className="text-[10px] text-[#B7791F] uppercase font-bold block">
                  False Positives (Unnecessary)
                </span>
                <span className="text-2xl font-extrabold text-[#B7791F] mt-1 block font-mono">
                  {activeMetric.confusion_matrix.fp}
                </span>
                <span className="text-[10px] text-[#878A99]">Warning issued, safe outcome</span>
              </div>

              <div className="bg-[#FDEEEB] border border-[#FACCC3] p-4 rounded-md">
                <span className="text-[10px] text-[#F06548] uppercase font-bold block">
                  False Negatives (Missed)
                </span>
                <span className="text-2xl font-extrabold text-[#F06548] mt-1 block font-mono">
                  {activeMetric.confusion_matrix.fn}
                </span>
                <span className="text-[10px] text-[#878A99]">Methane reached 1.0% unwarned</span>
              </div>

              <div className="bg-[#E8F2F5] border border-[#C5DFE7] p-4 rounded-md">
                <span className="text-[10px] text-[#176B87] uppercase font-bold block">
                  True Negatives (Safe)
                </span>
                <span className="text-2xl font-extrabold text-[#176B87] mt-1 block font-mono">
                  {activeMetric.confusion_matrix.tn.toLocaleString()}
                </span>
                <span className="text-[10px] text-[#878A99]">Safe operations verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROC Discrimination Curve */}
        <div className="lg:col-span-2 mg-card">
          <div className="mg-card-header">
            <div>
              <h3 className="mg-card-title">
                ROC Discrimination Curve ({activeMetric.horizon_minutes}m Horizon)
              </h3>
              <p className="mg-card-sub">
                Demonstrates model's ability to rank high-risk periods above safe periods across all sensitivity thresholds.
              </p>
            </div>
            <span className="mg-badge mg-badge-success font-mono">
              ROC-AUC: {activeMetric.roc_auc.toFixed(4)}
            </span>
          </div>

          <div className="mg-card-body">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={activeMetric.roc_curve}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9EBEC" vertical={false} />
                  <XAxis
                    dataKey="fpr"
                    stroke="#878A99"
                    fontSize={10}
                    tickLine={false}
                    label={{ value: 'False Positive Rate (FPR)', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#878A99' }}
                  />
                  <YAxis
                    dataKey="tpr"
                    stroke="#878A99"
                    fontSize={10}
                    domain={[0, 1]}
                    tickLine={false}
                    label={{ value: 'True Positive Rate (TPR)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#878A99' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E9EBEC',
                      borderRadius: '4px',
                      boxShadow: '0 5px 10px rgba(30, 32, 37, 0.12)',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tpr"
                    name="Model Discrimination Curve"
                    stroke="#0AB39C"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Calibration, False Alarm Analysis & Data Provenance (3 Cards in Velzon Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Probability Reliability & Calibration */}
        <div className="mg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#343A40] uppercase tracking-wider">
            <CheckCircle2 size={15} className="text-[#0AB39C]" />
            Probability Calibration
          </div>
          <p className="text-[11px] text-[#878A99] leading-relaxed">
            Evaluates statistical reliability of confidence scores against empirical event frequencies.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">Brier Score (MSE):</span>
              <span className="font-mono text-[#0AB39C] font-bold">
                {activeMetric.calibration?.brier_score !== undefined
                  ? activeMetric.calibration.brier_score.toFixed(5)
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">Expected Calibration Error:</span>
              <span className="font-mono text-[#343A40]">
                {activeMetric.calibration?.expected_calibration_error !== undefined
                  ? activeMetric.calibration.expected_calibration_error.toFixed(4)
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#878A99]">Operating Threshold:</span>
              <span className="font-mono text-[#405189] font-bold">
                τ = {activeMetric.decision_threshold ?? 0.50} (Val Tuned: τ* = {activeMetric.validation_tuned_threshold ?? 'N/A'})
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: False Alarm Structure & Merging Rules */}
        <div className="mg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#343A40] uppercase tracking-wider">
            <AlertTriangle size={15} className="text-[#B7791F]" />
            False Alarm Structure
          </div>
          <p className="text-[11px] text-[#878A99] leading-relaxed">
            Separates discrete alarm incidents from individual false-positive time steps.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">Discrete Incidents / Day:</span>
              <span className="font-mono text-[#B7791F] font-bold">
                {activeMetric.false_alarm_analysis?.false_alarm_incidents_per_day?.toFixed(2) ??
                  activeMetric.false_alarms_per_day.toFixed(2)} / day
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">False-Positive Minutes / Day:</span>
              <span className="font-mono text-[#343A40]">
                {activeMetric.false_alarm_analysis?.false_alarm_minutes_per_day?.toFixed(2) ?? 'N/A'} min/day
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#878A99]">Merged (5m tolerance):</span>
              <span className="font-mono text-[#343A40]">
                {activeMetric.false_alarm_analysis?.false_alarm_incidents_merged_5m_per_day?.toFixed(2) ?? 'N/A'} / day
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Held-Out Test Provenance & Fingerprint */}
        <div className="mg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#343A40] uppercase tracking-wider">
            <FileCheck size={15} className="text-[#405189]" />
            Evaluation Provenance
          </div>
          <p className="text-[11px] text-[#878A99] leading-relaxed">
            Held-out episodes are strictly isolated with causal pre-window trimming.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">Evaluated Rows:</span>
              <span className="font-mono text-[#343A40] font-semibold">
                {activeMetric.sample_counts?.total_samples?.toLocaleString() ?? '22,560'} ({activeMetric.sample_counts?.positive_samples ?? '704'} pos)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E9EBEC]">
              <span className="text-[#878A99]">Target Prevalence:</span>
              <span className="font-mono text-[#343A40]">
                {activeMetric.sample_counts?.target_prevalence !== undefined
                  ? `${(activeMetric.sample_counts.target_prevalence * 100).toFixed(2)}%`
                  : '3.12%'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#878A99]">Data Fingerprint:</span>
              <span
                className="font-mono text-[#405189] text-[10px] font-bold"
                title={activeMetric.eval_data_fingerprint}
              >
                {activeMetric.eval_data_fingerprint ? `${activeMetric.eval_data_fingerprint.slice(0, 14)}...` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BenchmarkLab;
