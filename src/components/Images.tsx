import { useState } from 'react';
import { eventLogoUrls, golferImageUrl } from '../lib/images';
import { FlagIcon, Silhouette } from './Icons';

/** Golfer headshot from Storage, or a gray silhouette if there's no file for him yet. */
export function Headshot({ name, size = 44 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {failed ? <Silhouette size={size * 0.86} /> : <img src={golferImageUrl(name)} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

/** Tournament logo from Storage, or the green flag tile. */
export function EventLogo({ t, size }: { t: { name: string; logo?: string | null }; size?: number }) {
  const urls = eventLogoUrls(t);
  const [i, setI] = useState(0);
  return (
    <div className="logo-tile" style={size ? { width: size, height: size, borderRadius: size / 5 } : undefined}>
      {i >= urls.length
        ? <FlagIcon size={size ? size * 0.6 : undefined} />
        : <img key={urls[i]} src={urls[i]} alt={`${t.name} logo`} loading="lazy" onError={() => setI((n) => n + 1)} />}
    </div>
  );
}
