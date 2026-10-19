import React from 'react';

const Card = ({
  children,
  title,
  subtitle,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white rounded-xl border border-opticolor-gray-100 shadow-card p-6 ${className}`}
      {...props}
    >
      {(title || subtitle) && (
        <div className="mb-4 pb-4 border-b border-opticolor-gray-100">
          {title && <h3 className="text-lg font-semibold text-opticolor-gray-900">{title}</h3>}
          {subtitle && <p className="text-sm text-opticolor-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
