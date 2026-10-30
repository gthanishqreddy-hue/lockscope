import { Fragment } from 'react';
import { Lock } from 'lucide-react';
import type { FrameNode, SimNode } from '../sim/listSim';

/** Renders a linked list. Locked, marked and cursor nodes carry text tags, not only color. */
export function ListView({
  nodes,
  listLocked = false,
  label,
}: {
  nodes: (FrameNode | SimNode)[];
  listLocked?: boolean;
  label: string;
}) {
  return (
    <div
      className="list-viz"
      role="list"
      aria-label={label}
      style={listLocked ? { outline: '2px dashed var(--warning)', borderRadius: 8 } : undefined}
    >
      {nodes.map((n, i) => {
        const frame = 'locked' in n ? n : null;
        const sentinel = typeof n.key !== 'number';
        const classes = [
          'node',
          sentinel ? 'sentinel' : '',
          frame?.locked ? 'locked' : '',
          n.marked ? 'marked' : '',
          frame?.role ? 'cursor' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const tags = [frame?.role, frame?.locked ? 'locked' : null, n.marked ? 'marked' : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <Fragment key={`${String(n.key)}-${i}`}>
            {i > 0 && (
              <span className="arrow" aria-hidden>
                →
              </span>
            )}
            <span
              className={classes}
              role="listitem"
              aria-label={`${String(n.key)}${tags ? `, ${tags}` : ''}`}
            >
              {tags && <span className="tag">{tags}</span>}
              {frame?.locked && (
                <Lock size={10} aria-hidden style={{ position: 'absolute', top: 3, right: 3 }} />
              )}
              {String(n.key)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
