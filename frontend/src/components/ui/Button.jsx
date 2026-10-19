import React from 'react';

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md',
  loading = false, 
  disabled = false,
  className = '',
  type = 'button',
  ...props 
}) => {
  const baseClasses = 'inline-flex items-center justify-center text-center gap-2 rounded-lg font-semibold transition-all duration-200 select-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-opticolor-red active:scale-[0.98]';
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-3',
    lg: 'px-8 py-3.5 text-lg',
  };

  const variants = {
    primary: 'bg-opticolor-red hover:bg-opticolor-red-dark text-white shadow-md hover:shadow-lg disabled:bg-opticolor-gray-300',
    secondary: 'bg-white hover:bg-opticolor-gray-50 text-opticolor-red border-2 border-opticolor-red disabled:border-opticolor-gray-300 disabled:text-opticolor-gray-400',
    ghost: 'bg-transparent hover:bg-opticolor-gray-100 text-opticolor-gray-700',
    danger: 'bg-opticolor-red-dark hover:bg-opticolor-red text-white shadow-md hover:shadow-lg disabled:bg-opticolor-gray-300',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${baseClasses} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;