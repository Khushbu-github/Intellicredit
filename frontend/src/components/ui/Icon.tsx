import React from 'react';

/**
 * A single stroke-based icon set at a consistent 24px grid / 1.6 stroke,
 * so weight stays even across the whole product.
 */
const PATHS = {
    upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    gauge: 'M12 20a8 8 0 1 1 8-8M12 12l4.5-3',
    notes: 'M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2ZM9 9h6M9 13h4',
    trail: 'M6 4v16M6 8h9a3 3 0 0 1 0 6H9',
    document: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h4',
    download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
    plus: 'M12 5v14M5 12h14',
    check: 'm5 13 4 4L19 7',
    alert: 'M12 9v4m0 3.5h.01M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
    info: 'M12 16v-5m0-3.5h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z',
    shield: 'M12 3l7 3v5c0 4.2-2.9 8.1-7 10-4.1-1.9-7-5.8-7-10V6l7-3Z',
    sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
    chevronRight: 'm9 6 6 6-6 6',
    chevronLeft: 'm15 6-6 6 6 6',
    arrowRight: 'M5 12h14m0 0-5-5m5 5-5 5',
    spinner: 'M12 3a9 9 0 1 0 9 9',
    close: 'M6 6l12 12M18 6 6 18',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
    trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7',
    refresh: 'M20 11A8 8 0 0 0 6.3 6.3L4 8.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M4 4v4.5h4.5M20 20v-4.5h-4.5',
    building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3 21h18M8 8h3M8 12h3M8 16h3',
    scales: 'M12 4v16M7 20h10M12 7 5 9l3 5a3.5 3.5 0 0 1-6 0l3-5m14 0-7-2m7 2 3 5a3.5 3.5 0 0 1-6 0l3-5Z',
    print: 'M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7v-6Z',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
    star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
    chat: 'M21 12a8 8 0 0 1-8 8H8l-4 3v-5.6A8 8 0 0 1 13 4a8 8 0 0 1 8 8ZM9 11h8M9 15h5',
    sparkle: 'M12 3.5 13.6 8l4.4 1.6L13.6 11 12 15.5 10.4 11 6 9.6 10.4 8 12 3.5ZM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends React.SVGProps<SVGSVGElement> {
    name: IconName;
    size?: number;
    filled?: boolean;
}

const Icon: React.FC<IconProps> = ({ name, size = 18, filled = false, className, ...rest }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        {...rest}
    >
        <path d={PATHS[name]} />
    </svg>
);

export default Icon;
