import type { InField } from '../lib/fieldStatus';
import { money } from '../lib/league';
import { CheckIcon, XIcon } from './Icons';
import { Headshot } from './Images';

/** One golfer line in a flight card: headshot, name, role, money, field badge and "YOUR PICK". */
export default function GolferRow({ name, role, inField, counts, pga, mine }: {
  name: string;
  role: string;
  inField: InField;
  counts: boolean;
  pga: number;
  mine: number;
}) {
  return (
    <div className={`grow ${counts ? 'counts' : ''}`}>
      <Headshot name={name} size={34} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div>
          <span className="gname">{name}</span>
          <span className="role">{role}</span>
        </div>
        <span className="money">PGA {money(pga)} · For you <b>{money(mine)}</b></span>
      </div>
      <div className="badges">
        {inField === 'in' && <span className="badge in"><CheckIcon /> In Field</span>}
        {inField === 'out' && <span className="badge out"><XIcon /> Not In Field</span>}
        {inField === 'unknown' && <span className="badge wait">Field TBD</span>}
        {counts && <span className="pick">YOUR PICK</span>}
      </div>
    </div>
  );
}
