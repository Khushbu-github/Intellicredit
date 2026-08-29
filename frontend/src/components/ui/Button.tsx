import React from 'react';
import { cn } from '../../lib/cn';
import Icon, { type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
    primary:
        'bg-[var(--accent)] text-white border border-transparent hover:brightness-[1.08] active:brightness-95 shadow-xs',
    secondary:
        'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-[var(--accent)] active:bg-surface-3',
    ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-3 hover:text-ink',
    danger:
        'bg-[var(--status-critical)] text-white border border-transparent hover:brightness-110 active:brightness-95 shadow-xs',
};

const SIZES: Record<Size, string> = {
    sm: 'h-8 px-3 text-[13px] gap-1.5 rounded',
    md: 'h-9 px-4 text-[13px] gap-2 rounded-md',
    lg: 'h-11 px-5 text-sm gap-2 rounded-md',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    icon?: IconName;
    iconRight?: IconName;
    loading?: boolean;
    block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
}) => (
    <button
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
            'inline-flex items-center justify-center font-medium transition-[background-color,border-color,filter,box-shadow] duration-150',
            'disabled:opacity-45 disabled:pointer-events-none select-none whitespace-nowrap',
            VARIANTS[variant],
            SIZES[size],
            block && 'w-full',
            className,
        )}
        {...rest}
    >
        {loading ? (
            <Icon name="spinner" size={size === 'lg' ? 17 : 15} className="animate-spin" />
        ) : icon ? (
            <Icon name={icon} size={size === 'lg' ? 17 : 15} />
        ) : null}
        {children}
        {iconRight && !loading && <Icon name={iconRight} size={size === 'lg' ? 17 : 15} />}
    </button>
);

/** Anchor styled as a button — used for the CAM download, which is a real link. */
interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    variant?: Variant;
    size?: Size;
    icon?: IconName;
}

export const LinkButton: React.FC<LinkButtonProps> = ({
    variant = 'primary',
    size = 'md',
    icon,
    className,
    children,
    ...rest
}) => (
    <a
        className={cn(
            'inline-flex items-center justify-center font-medium transition-[background-color,border-color,filter] duration-150 select-none',
            VARIANTS[variant],
            SIZES[size],
            className,
        )}
        {...rest}
    >
        {icon && <Icon name={icon} size={size === 'lg' ? 17 : 15} />}
        {children}
    </a>
);

export default Button;
