// DOM markers for MapLibre, styled with token classes only (A4 "Map" markers):
// reports = amber lamp pin (dot + 16% halo), alerts = coral pin with white outline (pulses),
// rides = mint dot, selected = ink pin with a white ring, clusters = ink circle with a white count.

export type PointKind = "report" | "alert" | "ride" | "live";

export interface MapPoint {
  id: string;
  kind: PointKind;
  lat: number;
  lng: number;
  /** Used for the accessible name and the list alternative. */
  label: string;
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

const KIND_LABEL: Record<PointKind, string> = { report: "Report", alert: "Alert", ride: "Ride", live: "Live location" };

export function pointMarker(p: MapPoint, selected: boolean, onSelect: (id: string) => void): HTMLElement {
  const btn = el("button", "relative flex h-11 w-11 items-center justify-center rounded-avatar") as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", `${KIND_LABEL[p.kind]}: ${p.label}`);
  btn.dataset.markerKind = p.kind;
  btn.dataset.markerId = p.id;
  if (selected) btn.dataset.selected = "true";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect(p.id);
  });

  if (selected) {
    btn.appendChild(el("span", "block h-5 w-5 rounded-avatar border-[3px] border-white bg-ink shadow-popover"));
    return btn;
  }
  if (p.kind === "report") {
    btn.appendChild(el("span", "absolute h-9 w-9 rounded-avatar bg-amber opacity-[0.16]"));
    btn.appendChild(el("span", "relative block h-3 w-3 rounded-avatar bg-amber"));
  } else if (p.kind === "alert") {
    btn.appendChild(el("span", "pulse-ring absolute h-5 w-5 rounded-avatar bg-coral opacity-40"));
    btn.appendChild(el("span", "relative block h-4 w-4 rounded-avatar border-2 border-white bg-coral shadow-hover"));
  } else if (p.kind === "live") {
    btn.appendChild(el("span", "pulse-ring absolute h-7 w-7 rounded-avatar bg-ink opacity-30"));
    btn.appendChild(el("span", "relative block h-4 w-4 rounded-avatar border-2 border-white bg-ink shadow-popover"));
  } else {
    btn.appendChild(el("span", "relative block h-3 w-3 rounded-avatar border-2 border-white bg-mint shadow-hover"));
  }
  return btn;
}

export function clusterMarker(count: number, onClick: () => void): HTMLElement {
  const size = count < 10 ? "h-9 w-9" : count < 100 ? "h-11 w-11" : "h-12 w-12";
  const b = el(
    "button",
    `${size} flex items-center justify-center rounded-avatar bg-ink font-display text-[14px] leading-5 font-semibold text-white`,
  ) as HTMLButtonElement;
  b.type = "button";
  b.textContent = String(count);
  b.dataset.cluster = String(count);
  b.setAttribute("aria-label", `${count} items here. Zoom in.`);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** The pin used by the location picker: ink pin with a white ring. */
export function pickerPin(): HTMLElement {
  const wrap = el("div", "flex h-11 w-11 items-center justify-center");
  wrap.dataset.pickerPin = "true";
  wrap.appendChild(el("span", "block h-5 w-5 rounded-avatar border-[3px] border-white bg-ink shadow-popover"));
  return wrap;
}
