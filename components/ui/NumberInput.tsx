// components/ui/NumberInput.tsx — integer-only input. Drop-in for <Input type="number">:
// same value/onChange(e) contract, but actually blocks letters/e/+/- (native type="number"
// does not) by stripping non-digits from e.target.value before the handler sees it.
import React from 'react';
import { Input } from './UIComponents';

export const NumberInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ onChange, ...props }, ref) => (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      onChange={(e) => {
        const clean = e.target.value.replace(/\D/g, '');
        if (clean !== e.target.value) e.target.value = clean;
        onChange?.(e);
      }}
      {...props}
    />
  )
);
NumberInput.displayName = 'NumberInput';
