import type { ChangeEvent, ReactNode } from "react";
import { cn } from "../utils/cn";

export function Panel({
  children,
  className,
  title,
  aside,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  aside?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur",
        className,
      )}
    >
      {(title || aside) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-[11px] font-bold tracking-[0.22em] text-zinc-400 uppercase">{title}</h2>
          )}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/5">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-zinc-200">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-transparent bg-[var(--accent)]" : "border-white/15 bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all duration-200",
            checked ? "left-[18px]" : "left-[2px]",
          )}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  columns = 3,
}: {
  value: T;
  options: { value: T; label: string; note?: string }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div className={cn("grid gap-1.5", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-xl border px-2 py-2 text-left transition",
              active
                ? "border-[var(--accent)]/70 bg-[var(--accent)]/15 text-white"
                : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200",
            )}
          >
            <span className="block text-[12px] font-semibold">{o.label}</span>
            {o.note && <span className="block text-[10px] leading-tight text-zinc-500">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  display?: string;
}) {
  return (
    <div className="px-2 py-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-zinc-300">{label}</span>
        <span className="font-mono text-[11px] text-zinc-500">{display ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  className,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "accent";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" &&
          "bg-white text-zinc-900 hover:bg-zinc-200 shadow-[0_10px_30px_-12px_rgba(255,255,255,0.5)]",
        variant === "accent" && "bg-[var(--accent)] text-zinc-950 hover:brightness-110",
        variant === "ghost" && "border border-white/12 bg-white/[0.04] text-zinc-200 hover:border-white/25 hover:bg-white/10",
        variant === "danger" && "border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tag({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        accent ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/8 text-zinc-400",
      )}
    >
      {children}
    </span>
  );
}
