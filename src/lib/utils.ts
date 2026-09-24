import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(val: number): string {
  return new Intl.NumberFormat("en-US").format(val);
}

export function formatPercent(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(val);
}

export function formatStx(val: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(val);
}

export function truncateAddress(addr: string, start = 6, end = 4): string {
  if (!addr) return "";
  const clean = addr.replace(/['"]/g, "").trim();
  if (clean.length <= start + end) return clean;
  return `${clean.slice(0, start)}…${clean.slice(-end)}`;
}

export function stringToColor(input: string): string {
  const colors = [
    "#38bdf8", // sky
    "#818cf8", // indigo
    "#c084fc", // purple
    "#f472b6", // pink
    "#fb7185", // rose
    "#fb923c", // orange
    "#facc15", // amber
    "#4ade80", // green
    "#2dd4bf", // teal
    "#34d399", // emerald
    "#60a5fa", // blue
    "#a78bfa", // violet
  ];
  if (!input) return colors[0];
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
}
