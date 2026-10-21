import React, { useId } from 'react';

const Select = ({ label, error, id, options = [], placeholder, className = '', size = 'md', ...props }) => {
  const generatedId = useId();
  const selectId = id || props.name || generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  const sizes = {
    sm: 'min-h-[2.25rem] px-3 py-1 text-sm',
    md: 'min-h-[2.75rem] px-4 py-2',
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-opticolor-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`
          w-full rounded-lg border-2 bg-white leading-tight transition-all duration-200
          focus:border-transparent focus:outline-none focus:ring-2 focus:ring-opticolor-red
          ${sizes[size] || sizes.md}
          ${error
            ? 'border-opticolor-red-light bg-red-50'
            : 'border-opticolor-gray-200 hover:border-opticolor-gray-300'
          }
          disabled:bg-opticolor-gray-50 disabled:cursor-not-allowed
          ${className}
        `}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => {
          const value = typeof option === 'object' ? option.value : option;
          const labelText = typeof option === 'object' ? option.label : option;
          return (
            <option key={value} value={value}>
              {labelText}
            </option>
          );
        })}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-opticolor-red-light">
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
