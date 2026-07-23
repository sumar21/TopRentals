// components/ui/MoneyInput.tsx
import React from 'react';
import { Input } from './UIComponents';
import { maskMoney } from '../../utils/formatMoneyInput';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;                        // string enmascarado (seed con maskFromNumber al editar)
  onChange: (value: string) => void;    // recibe el string enmascarado; parsear con parseMoney() al submit
}
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = '0,00', ...props }, ref) => (
    <Input ref={ref} type="text" inputMode="decimal" value={value}
      onChange={(e) => onChange(maskMoney(e.target.value))} placeholder={placeholder} {...props} />
  )
);
MoneyInput.displayName = 'MoneyInput';
