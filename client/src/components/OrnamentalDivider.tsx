/** Outer acanthus-style volute (right half, mirrored for left). */
const VOLUTE_OUTER =
  'M0 0 L13 0 C23 0 29 -7 26 -14 C23 -21 11 -18 12 -10' +
  ' C13 -2 21 2 31 0';

/** Inner counter-curl for baroque depth. */
const VOLUTE_INNER =
  'M0 0 L7 0 C11 -1 12 -5 10 -8 C8 -11 4 -9 5 -6 C6 -3 10 -1 14 -3' +
  ' C18 -5 16 -9 11 -7 C6 -5 5 -1 10 0';

export function OrnamentalDivider({ className }: { className?: string }) {
  return (
    <div
      className={'ornamental-divider' + (className ? ` ${className}` : '')}
      aria-hidden="true"
    >
      <span className="ornamental-divider__rule ornamental-divider__rule--l" />
      <svg className="ornamental-divider__ornament" viewBox="0 0 72 44" preserveAspectRatio="xMidYMid meet">
        <g
          transform="translate(36, 22)"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g strokeWidth="1.05" opacity="0.8">
            <path d={VOLUTE_OUTER} />
            <g transform="scale(-1, 1)">
              <path d={VOLUTE_OUTER} />
            </g>
          </g>
          <g strokeWidth="0.9" opacity="0.5">
            <path d={VOLUTE_INNER} />
            <g transform="scale(-1, 1)">
              <path d={VOLUTE_INNER} />
            </g>
          </g>
          <path
            d="M0 -7 L2.6 -0.4 L0 6.4 L-2.6 -0.4 Z"
            fill="currentColor"
            fillOpacity="0.05"
            strokeWidth="0.85"
            opacity="0.85"
          />
          <path d="M0 -9.5V9.5" strokeWidth="0.65" opacity="0.2" />
        </g>
      </svg>
      <span className="ornamental-divider__rule ornamental-divider__rule--r" />
    </div>
  );
}
