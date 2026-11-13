import { useState } from 'react';
import { eventLogoUrl, golferImageUrl } from '../lib/images';
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
export function EventLogo({ t }: { t: { name: string; logo?: string | null } }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="logo-tile">
      {failed ? <FlagIcon /> : <img src={eventLogoUrl(t)} alt={`${t.name} logo`} loading="lazy" onError={() => setFailed(true)} />}
    </div>
  );
}
