import React from 'react';

const Input = ({
  label,
  error,
  id,
  readOnly,
  className = '',
  children,
  ...props
}) => {
  const inputId = id || props.name || undefined;
  const errorId = error ? `${inputId || 'input'}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-opticolor-gray-700">
          {label}
        </label>
      )}

      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        readOnly={readOnly}
        className={`
          px-4 py-2 border-2 rounded-lg transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-opticolor-red focus:border-transparent
          ${error 
            ? 'border-opticolor-red-light bg-red-50 animate-shake' 
            : 'border-opticolor-gray-200 hover:border-opticolor-gray-300'
          }
          disabled:bg-opticolor-gray-50 disabled:cursor-not-allowed
          read-only:bg-opticolor-gray-50 read-only:cursor-default read-only:text-opticolor-gray-600
          ${className}
        `}
        {...props}
      />

      {error && (
        <p id={errorId} className="text-sm text-opticolor-red-light animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
