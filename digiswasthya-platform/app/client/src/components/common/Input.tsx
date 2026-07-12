import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, className = '', id: idProp, ...props }, ref) => {
    const autoId = useId();
    const inputId = idProp ?? autoId;

    return (
      <div className="w-full space-y-2">
        {label && (
          <label htmlFor={inputId} className="text-body font-medium text-slate-700 block">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:w-4 [&_svg]:h-4 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full py-2 text-sm bg-white border rounded-lg outline-none transition-all
              ${leftIcon ? 'pl-9 pr-3' : 'px-3'}
              ${error
                ? 'border-red-400 ring-1 ring-red-400 focus:ring-red-400'
                : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'}
              placeholder:text-slate-400
              disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-caption text-red-500">{error}</p>
        ) : helperText ? (
          <p className="text-caption">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
