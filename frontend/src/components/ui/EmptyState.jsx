import React from 'react';
import { Inbox } from 'lucide-react';

const EmptyState = ({ title, description, action, className = '' }) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-opticolor-gray-100">
        <Inbox className="h-8 w-8 text-opticolor-gray-400" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-opticolor-gray-800">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-opticolor-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
