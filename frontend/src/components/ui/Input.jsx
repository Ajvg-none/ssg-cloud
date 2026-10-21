import React, { useId } from 'react';

const Input = ({
  label,
  error,
  id,
  readOnly,
  className = '',
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || props.name || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
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
          min-h-[2.75rem] w-full rounded-lg border-2 px-4 py-2 transition-all duration-200
          focus:border-transparent focus:outline-none focus:ring-2 focus:ring-opticolor-red
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
