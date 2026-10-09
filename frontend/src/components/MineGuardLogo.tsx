import React from 'react';

interface MineGuardLogoProps {
  collapsed?: boolean;
  variant?: 'dark' | 'light';
  className?: string;
}

/**
 * MineGuard Official Brand Logo Component (Reused from OldProj)
 * Transparent vector SVG preserving official brand proportions
 * Expanded: official horizontal logo + PREDICT badge
 * Collapsed: favicon mark
 */
export const MineGuardLogo: React.FC<MineGuardLogoProps> = ({
  collapsed = false,
  variant = 'dark',
  className = '',
}) => {
  if (collapsed) {
    return (
      <img
        src="/favicon.svg"
        alt="MineGuard"
        className={`w-7 h-7 object-contain select-none transition-transform duration-200 ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <img
        src={variant === 'light' ? '/mineguard-logo-horizontal.svg' : '/mineguard-logo-horizontal-dark.svg'}
        alt="MineGuard"
        className="h-8 w-auto max-w-[155px] object-contain select-none"
      />
      <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded bg-[#176B87]/30 text-[#8DC2D1] border border-[#176B87]/50 font-mono">
        PREDICT
      </span>
    </div>
  );
};

export default MineGuardLogo;
