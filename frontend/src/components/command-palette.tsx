"use client";

import { Command, defaultFilter } from "cmdk";
import { useEffect, type ReactNode } from "react";

import { SearchIcon } from "@/components/Icons";
import { Badge, Kbd } from "@/components/ui";

const MIN_FILTER_SCORE = 0.1;

function paletteFilter(value: string, search: string, keywords?: string[]) {
  const score = defaultFilter(value, search, keywords);
  return score >= MIN_FILTER_SCORE ? score : 0;
}

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keywords?: string;
  /** Muted trailing text (e.g. a route or driver name). */
  hint?: string;
  /** Status badge shown at the end of the row (e.g. "pending"). */
  badge?: string;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onQueryChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  /** Fires on every keystroke — used to fetch live entity results. */
  onQueryChange?: (query: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
      if (event.key === "Tab") event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const groups: string[] = [];
  for (const item of items) {
    if (!groups.includes(item.group)) groups.push(item.group);
  }

  return (
    <div
      role="presentation"
      onClick={() => onOpenChange(false)}
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-4 pt-[12vh]"
    >
      <Command
        label="Command palette"
        loop
        filter={paletteFilter}
        onClick={(event) => event.stopPropagation()}
        className="animate-scale-in w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <SearchIcon size={16} className="shrink-0 text-muted" />
          <Command.Input
            autoFocus
            placeholder="Search pages, actions, bookings…"
            onValueChange={onQueryChange}
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-10 text-center text-sm text-muted">
            No results found.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted"
            >
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.keywords ?? ""}`}
                    onSelect={() => {
                      onOpenChange(false);
                      item.onSelect();
                    }}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg data-[selected=true]:bg-surface-2"
                  >
                    {item.icon && (
                      <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="hidden max-w-[45%] truncate text-xs text-muted sm:block">
                        {item.hint}
                      </span>
                    )}
                    {item.badge && (
                      <Badge tone={item.badge}>{item.badge.replace(/_/g, " ")}</Badge>
                    )}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
