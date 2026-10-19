import React from 'react';

const Select = ({ label, error, id, options = [], placeholder, className = '', ...props }) => {
  const selectId = id || props.name || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-opticolor-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          px-4 py-2 border-2 rounded-lg transition-all duration-200 bg-white
          focus:outline-none focus:ring-2 focus:ring-opticolor-red focus:border-transparent
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
      {error && <p className="text-sm text-opticolor-red-light">{error}</p>}
    </div>
  );
};

export default Select;
