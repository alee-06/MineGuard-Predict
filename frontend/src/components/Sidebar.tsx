import React from 'react';
import {
  Activity,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Database,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';
import { MineGuardLogo } from './MineGuardLogo';

export type WorkspaceKey = 'live' | 'historical';
// Backwards compatibility alias
export type ViewKey = WorkspaceKey | string;

interface SidebarProps {
  currentWorkspace: WorkspaceKey;
  onSelectWorkspace: (workspace: WorkspaceKey) => void;
  datasetRows?: number;
  modelReady?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isLiveConnected?: boolean;
  isDemoMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentWorkspace,
  onSelectWorkspace,
  datasetRows = 17280,
  modelReady = true,
  isCollapsed = false,
  onToggleCollapse,
  isLiveConnected = false,
  isDemoMode = false,
}) => {
  const navItems: Array<{
    key: WorkspaceKey;
    label: string;
    sublabel: string;
    icon: any;
    badge?: string;
    badgeType?: 'warning' | 'info' | 'success';
  }> = [
    {
      key: 'live',
      label: 'Live Monitoring',
      sublabel: 'Real-time telemetry, warnings & forecasts',
      icon: Activity,
      badge: isDemoMode ? 'SIMULATED' : isLiveConnected ? 'ONLINE' : 'OFFLINE',
      badgeType: isLiveConnected ? 'success' : isDemoMode ? 'warning' : 'info',
    },
    {
      key: 'historical',
      label: 'Historical Risk Analysis',
      sublabel: 'CSV/Excel import, ML forecast & risk patterns',
      icon: TrendingUp,
      badge: 'ML ENGINE',
      badgeType: 'success',
    },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-[#182B3A] select-none flex flex-col justify-between transition-all duration-200 border-r border-[#1F3446] ${
        isCollapsed ? 'w-[70px]' : 'w-[260px]'
      }`}
    >
      <div className="flex-1 flex flex-col min-h-0">
        {/* Brand Header */}
        <div
          className={`h-[70px] flex items-center border-b border-white/10 ${
            isCollapsed ? 'justify-center px-2' : 'px-4'
          }`}
        >
          {isCollapsed ? (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded text-[#abb9e8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center group"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <MineGuardLogo collapsed={true} variant="dark" />
            </button>
          ) : (
            <div className="flex items-center min-w-0">
              <MineGuardLogo collapsed={false} variant="dark" />
            </div>
          )}
        </div>

        {/* Primary Navigation Workspaces */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          {!isCollapsed && (
            <div className="px-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-[#7f8fc4] select-none">
              Operational Workspaces
            </div>
          )}

          <div className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentWorkspace === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => onSelectWorkspace(item.key)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full group flex items-start gap-3 p-3 rounded-lg text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#405189] to-[#2E3C62] text-white shadow-md border-l-4 border-[#0AB39C]'
                      : 'text-[#abb9e8] hover:text-white hover:bg-white/6'
                  } ${isCollapsed ? 'justify-center p-3.5' : ''}`}
                >
                  <div
                    className={`p-2 rounded-md shrink-0 transition-colors ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'bg-[#1F3446] text-[#abb9e8] group-hover:text-white group-hover:bg-[#2A445C]'
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>

                  {!isCollapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-sm leading-tight text-white truncate">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                              item.badgeType === 'success'
                                ? 'bg-[#0AB39C]/20 text-[#0AB39C] border border-[#0AB39C]/30'
                                : item.badgeType === 'warning'
                                ? 'bg-[#F7B84B]/20 text-[#F7B84B] border border-[#F7B84B]/30'
                                : 'bg-[#176B87]/30 text-[#8DC2D1] border border-[#176B87]/40'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8797A8] mt-1 leading-snug line-clamp-2">
                        {item.sublabel}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {!isCollapsed && (
            <div className="mt-8 px-3 py-3 rounded-lg bg-[#142431] border border-white/5 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-white/90">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#0AB39C]" />
                  Safety Parameters
                </span>
                <span className="font-mono text-[10px] text-[#0AB39C] bg-[#0AB39C]/10 px-1.5 py-0.5 rounded">
                  Active
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-[#8797A8]">
                <div className="flex justify-between">
                  <span>Warning Threshold:</span>
                  <span className="text-white font-mono font-bold">1.0% CH₄</span>
                </div>
                <div className="flex justify-between">
                  <span>Lead Horizons:</span>
                  <span className="text-white font-mono">5m, 15m, 30m</span>
                </div>
                <div className="flex justify-between">
                  <span>Causal Warmup:</span>
                  <span className="text-white font-mono">15m Window</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status & Console Profile (from OldProj) */}
      <div className="p-3 border-t border-white/10 space-y-2 shrink-0 bg-[#142431]">
        {!isCollapsed ? (
          <>
            <div className="px-1 flex items-center justify-between text-[11px] text-[#abb9e8]">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    modelReady ? 'bg-[#0AB39C] animate-pulse' : 'bg-[#F7B84B]'
                  }`}
                />
                <span className="font-medium text-white/90">Prediction Gateway</span>
              </div>
              <span className="text-[10px] text-[#abb9e8]/80 font-mono">
                {modelReady ? 'Port 8000' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/10">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#176B87] text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                  SO
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    Safety Administrator
                  </div>
                  <div className="text-[10px] text-[#abb9e8] truncate">
                    Mine Operations Console
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-center py-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                modelReady ? 'bg-[#0AB39C]' : 'bg-[#F7B84B]'
              }`}
              title="Prediction Gateway Online"
            />
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
