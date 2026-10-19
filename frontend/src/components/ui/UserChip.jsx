import React from 'react';

const UserChip = ({ name, subtitle }) => {
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-opticolor-red text-base font-semibold text-white"
      >
        {initial}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-opticolor-gray-800">{name}</p>
        {subtitle && <p className="truncate text-xs text-opticolor-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
};

export default UserChip;
