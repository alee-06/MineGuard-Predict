import React, { useState, useEffect } from 'react';
import { WorkspaceKey } from './Sidebar';
import { Clock, Target, RefreshCw, Activity, TrendingUp, Menu } from 'lucide-react';

interface HeaderProps {
  currentWorkspace: WorkspaceKey;
  selectedHorizon?: number;
  onSelectHorizon?: (h: number) => void;
  thresholdPct: number;
  onRefresh?: () => void;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

const WORKSPACE_METAS: Record<WorkspaceKey, { title: string; category: string; subtitle: string; icon: any }> = {
  live: {
    title: 'Live Monitoring',
    category: 'Mine Operations',
    subtitle: 'Real-time telemetry, active hazard alarms & advance forecasts',
    icon: Activity,
  },
  historical: {
    title: 'Historical Risk Analysis',
    category: 'Analytics & Forensics',
    subtitle: 'CSV/Excel analytics, genuine ML forecasting & risk patterns',
    icon: TrendingUp,
  },
};

export const Header: React.FC<HeaderProps> = ({
  currentWorkspace,
  thresholdPct,
  onRefresh,
  onToggleSidebar,
  isSidebarCollapsed,
}) => {
  const meta = WORKSPACE_METAS[currentWorkspace] || WORKSPACE_METAS.live;
  const [timeStr, setTimeStr] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = () => {
    if (onRefresh) {
      setIsRefreshing(true);
      onRefresh();
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const Icon = meta.icon;

  return (
    <header className="h-[70px] bg-white border-b border-[#E9EBEC] shadow-topbar px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Sidebar Toggle & Clean Workspace Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 -ml-2 rounded-md text-[#495057] hover:text-[#405189] hover:bg-[#F3F3F9] transition-colors cursor-pointer"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-md bg-[#405189]/10 text-[#405189] shrink-0">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#182B3A] tracking-tight leading-tight truncate">
              {meta.title}
            </h1>
            <p className="hidden md:block text-[11px] text-[#878A99] truncate leading-none mt-0.5">
              {meta.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Warning Threshold Pill */}
        <div
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FEF8ED] border border-[#FDE8BE] text-xs font-medium text-[#B7791F]"
          title="Demonstration statutory warning cutoff for threshold-crossing events"
        >
          <Target size={13} className="text-[#F7B84B]" />
          <span>Cutoff:</span>
          <span className="font-bold font-mono text-[#B7791F]">{thresholdPct.toFixed(1)}% CH₄</span>
        </div>

        {/* Live Simulation Clock */}
        <div className="hidden sm:flex items-center space-x-1.5 text-xs text-[#495057] px-2.5 py-1.5 bg-[#F3F3F9] rounded-md border border-[#E9EBEC] font-mono">
          <Clock className="h-3.5 w-3.5 text-[#878A99]" />
          <span className="tabular-nums font-semibold">{timeStr || '00:00:00'}</span>
          <span className="text-[10px] text-[#878A99]">SYS</span>
        </div>

        {/* Status indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0AB39C]/10 border border-[#0AB39C]/20 text-[11px] font-semibold text-[#0AB39C]">
          <span className="w-2 h-2 rounded-full bg-[#0AB39C] animate-pulse"></span>
          <span>ONLINE</span>
        </div>

        {/* Manual Refresh Button */}
        {onRefresh && (
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-md border border-[#E9EBEC] bg-white flex items-center justify-center text-[#878A99] hover:text-[#405189] hover:bg-[#F3F3F9] transition-colors cursor-pointer"
            title="Refresh operational telemetry"
            aria-label="Refresh operational telemetry"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-[#405189]' : ''} />
          </button>
        )}

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E9EBEC]">
          <div className="w-8 h-8 rounded-full bg-[#405189] text-white font-bold flex items-center justify-center text-xs shadow-2xs">
            SO
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
