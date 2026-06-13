export type LogoBrandVariant = 'app' | 'marketing' | 'landing-nav';

const variantConfig: Record<
  LogoBrandVariant,
  { imgSize: number; showTagline: boolean; showWord: boolean; large: boolean }
> = {
  app: { imgSize: 56, showTagline: false, showWord: true, large: true },
  marketing: { imgSize: 28, showTagline: true, showWord: true, large: false },
  'landing-nav': { imgSize: 38, showTagline: false, showWord: true, large: false },
};

export function LogoBrand({
  className,
  variant = 'marketing',
}: {
  className?: string;
  variant?: LogoBrandVariant;
}) {
  const { imgSize, showTagline, showWord, large } = variantConfig[variant];

  return (
    <span
      className={
        'logo-brand' +
        (large ? ' logo-brand--lg' : '') +
        (variant.startsWith('landing-') ? ` logo-brand--${variant}` : '') +
        (className ? ` ${className}` : '')
      }
    >
      <span className="logo-brand__row">
        <img
          className="logo__img"
          src="/icons/icon-512.png"
          srcSet="/icons/icon-192.png 192w, /icons/icon-512.png 512w"
          sizes={`${imgSize}px`}
          width={imgSize}
          height={imgSize}
          alt=""
          decoding="async"
        />
        {showWord ? <span className="logo__word">LeO</span> : null}
      </span>
      {showTagline ? (
        <span className="logo__tagline">Сделано репетитором для репетиторов</span>
      ) : null}
    </span>
  );
}
