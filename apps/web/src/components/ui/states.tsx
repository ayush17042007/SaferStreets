// Global state patterns (appendix-04 4.4): empty, error, plus DataTable and list pagination.
import type { ReactNode } from "react";
import { EmptyArt, type EmptyArtKind } from "@/components/brand/EmptyArt";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Skeleton } from "./display";
import { cn } from "./cn";

/** Empty state: illustration, one-line explanation, one primary action. Empty states are invitations. */
export function EmptyState({
  art = "quiet",
  title,
  description,
  actionLabel,
  onAction,
}: {
  art?: EmptyArtKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <EmptyArt kind={art} />
      <h3 className="type-h3">{title}</h3>
      {description ? <p className="max-w-sm text-[14px] leading-5 text-text-secondary">{description}</p> : null}
      {actionLabel ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}

/** Page error: friendly message, "Try again", a "Report a problem" link, small error code. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Try again in a moment.",
  code,
  onRetry,
  reportHref = "/about#contact",
}: {
  title?: string;
  description?: string;
  code?: string;
  onRetry?: () => void;
  reportHref?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" role="alert">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-coral-tint text-coral-text">
        <Icon name="error" size={20} />
      </span>
      <h3 className="type-h3">{title}</h3>
      <p className="max-w-sm text-[14px] leading-5 text-text-secondary">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
        <a
          href={reportHref}
          className="inline-flex min-h-11 items-center text-[14px] leading-5 font-semibold text-ink underline decoration-amber decoration-2 underline-offset-[3px]"
        >
          Report a problem
        </a>
      </div>
      {code ? <p className="text-[12px] leading-4 text-text-secondary">Error code: {code}</p> : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
}

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** Admin table: hairline rows, no card-per-row, sortable headers (A5.10). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  loading,
  emptyLabel = "Nothing to show yet.",
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  onSort?: (key: string) => void;
  loading?: boolean;
  emptyLabel?: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card">
      <table className="w-full border-collapse text-left text-[14px] leading-5">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "px-4 py-3 text-[12px] leading-4 font-medium text-text-secondary",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(c.key)}
                      className="inline-flex min-h-8 items-center gap-1 font-medium"
                    >
                      {c.header}
                      <Icon
                        name="chevronDown"
                        size={14}
                        className={cn(
                          "transition-transform duration-fast",
                          active && sort?.dir === "asc" && "rotate-180",
                          !active && "opacity-40",
                        )}
                      />
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
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((r) => (
                <tr key={rowKey(r)} className="border-b border-line last:border-b-0 hover:bg-cream">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3", c.align === "right" && "text-right")}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[14px] leading-5 text-text-secondary">{emptyLabel}</p>
      ) : null}
    </div>
  );
}

/** Cursor pagination controls for lists that grow (Part B5): "Load more" with an end marker. */
export function InfiniteList({
  children,
  hasMore,
  loadingMore,
  onLoadMore,
  endLabel = "You're all caught up.",
}: {
  children: ReactNode;
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  endLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      {hasMore ? (
        <Button variant="secondary" loading={loadingMore ?? false} onClick={onLoadMore} fullWidth>
          Load more
        </Button>
      ) : (
        <p className="py-2 text-center text-[12px] leading-4 text-text-secondary">{endLabel}</p>
      )}
    </div>
  );
}

/** Previous / next pagination for admin tables (offset style). */
export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <Button
        variant="secondary"
        size="mobile"
        disabled={page <= 1}
        onClick={() => onPageChange?.(page - 1)}
        leadingIcon="back"
      >
        Previous
      </Button>
      <span className="text-[14px] leading-5 text-text-secondary">
        Page {page} of {pageCount}
      </span>
      <Button variant="secondary" size="mobile" disabled={page >= pageCount} onClick={() => onPageChange?.(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
