"use client";

import * as RadixAccordion from "@radix-ui/react-accordion";
import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

/** Tabs: text tabs on a hairline; active tab is ink and weight 600 with an amber underline. */
export function Tabs({ items, defaultValue, label }: { items: TabItem[]; defaultValue?: string; label: string }) {
  return (
    <RadixTabs.Root defaultValue={defaultValue ?? items[0]?.value}>
      <RadixTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center px-3 text-[14px] leading-5 font-medium text-text-secondary",
              "transition-colors duration-fast data-[state=active]:font-semibold data-[state=active]:text-ink",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-chip after:bg-transparent data-[state=active]:after:bg-amber",
            )}
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="pt-4">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

export interface AccordionEntry {
  value: string;
  question: string;
  answer: ReactNode;
}

/** FAQ accordion: white cards separated by hairlines. */
export function Accordion({ items }: { items: AccordionEntry[] }) {
  return (
    <RadixAccordion.Root type="single" collapsible className="flex flex-col gap-2">
      {items.map((it) => (
        <RadixAccordion.Item
          key={it.value}
          value={it.value}
          className="overflow-hidden rounded-card border border-line bg-card"
        >
          <RadixAccordion.Header>
            <RadixAccordion.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-[16px] leading-6 font-medium text-ink">
              {it.question}
              <Icon
                name="chevronDown"
                size={20}
                className="shrink-0 text-text-secondary transition-transform duration-fast group-data-[state=open]:rotate-180"
              />
            </RadixAccordion.Trigger>
          </RadixAccordion.Header>
          <RadixAccordion.Content className="px-4 pb-4 text-[14px] leading-5 text-text-secondary">
            {it.answer}
          </RadixAccordion.Content>
        </RadixAccordion.Item>
      ))}
    </RadixAccordion.Root>
  );
}

export interface FilterChip {
  value: string;
  label: string;
}

/** Filter chips row (A5.4, A5.6): selected = ink bg + white text; others white with line-control border. */
export function FilterBar({
  chips,
  selected,
  onSelect,
  label,
}: {
  chips: FilterChip[];
  selected: string;
  onSelect?: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((c) => {
        const on = c.value === selected;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(c.value)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-chip border px-4 text-[14px] leading-5 font-medium transition-colors duration-fast",
              on ? "border-ink bg-ink text-white" : "border-line-control bg-card text-ink hover:bg-neutral-bubble",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
