import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => number | string | null;
  numeric?: boolean;
}

/** Sortable, optionally paginated table. Rows are rendered as React text, never as HTML. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  pageSize,
  initialSort,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key);
    if (!column?.sortValue || !sort) return rows;
    const get = column.sortValue;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * factor;
    });
  }, [rows, columns, sort]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? sorted.slice(current * pageSize, (current + 1) * pageSize) : sorted;

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const ariaSort = active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined;
                return (
                  <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined} aria-sort={ariaSort}>
                    {c.sortValue ? (
                      <button
                        type="button"
                        className="sort"
                        onClick={() => {
                          setSort(
                            active
                              ? { key: c.key, dir: sort?.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: c.key, dir: c.numeric ? 'desc' : 'asc' },
                          );
                          setPage(0);
                        }}
                      >
                        {c.header}
                        {active ? (
                          sort?.dir === 'asc' ? (
                            <ArrowUp size={12} aria-hidden />
                          ) : (
                            <ArrowDown size={12} aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown size={12} aria-hidden style={{ opacity: 0.4 }} />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 && (
        <nav className="row small" aria-label={`${caption} pages`}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={14} aria-hidden /> Previous
          </button>
          <span className="muted tabular">
            Page {current + 1} of {pages} · {sorted.length} rows
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next <ChevronRight size={14} aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
