import type { SVGProps } from 'react';

type EchoesIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Concentric-arcs / ripple mark shared by library header and notebook Echoes tab. */
export function EchoesIcon({ size = 18, className, ...props }: EchoesIconProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.75}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      aria-hidden='true'
      {...props}
    >
      <circle cx='12' cy='12' r='1.25' fill='currentColor' stroke='none' />
      <path d='M8.2 8.2a5.4 5.4 0 0 0 0 7.6' />
      <path d='M15.8 8.2a5.4 5.4 0 0 1 0 7.6' />
      <path d='M5.2 5.2a9.5 9.5 0 0 0 0 13.6' />
      <path d='M18.8 5.2a9.5 9.5 0 0 1 0 13.6' />
    </svg>
  );
}

export default EchoesIcon;
