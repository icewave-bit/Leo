export type LogoBrandVariant = 'app' | 'marketing';

export function LogoBrand({
  className,
  variant = 'marketing',
}: {
  className?: string;
  variant?: LogoBrandVariant;
}) {
  const large = variant === 'app';
  const imgSize = large ? 56 : 28;

  return (
    <span
      className={
        'logo-brand' +
        (large ? ' logo-brand--lg' : '') +
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
        <span className="logo__word">LeO</span>
      </span>
      {variant === 'marketing' ? (
        <span className="logo__tagline">Сделано репетитором для репетиторов</span>
      ) : null}
    </span>
  );
}
