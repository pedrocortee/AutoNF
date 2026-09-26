import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "jan.", "fev.", "mar.", "abr.",
  "mai.", "jun.", "jul.", "ago.",
  "set.", "out.", "nov.", "dez.",
];

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MonthPicker({ value, onChange, placeholder = "Competência", className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(() => {
    if (value) return parseInt(value.split("-")[0]);
    return today.getFullYear();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setViewYear(parseInt(value.split("-")[0]));
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedYear = value ? parseInt(value.split("-")[0]) : null;
  const selectedMonth = value ? parseInt(value.split("-")[1]) - 1 : null;

  const handleSelectMonth = (monthIndex: number) => {
    const mm = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewYear}-${mm}`);
    setOpen(false);
  };

  const displayValue = value
    ? `${MONTHS[parseInt(value.split("-")[1]) - 1]} ${value.split("-")[0]}`
    : "";

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-9 w-full flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-1 text-sm shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className={value ? "text-foreground flex-1 text-left" : "text-muted-foreground flex-1 text-left"}>
          {displayValue || placeholder}
        </span>
        {value && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="ml-auto text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 z-50 min-w-[256px] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="number"
              value={viewYear}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                if (!isNaN(y) && y > 1900 && y < 2100) setViewYear(y);
              }}
              className="w-20 text-center text-sm font-semibold bg-muted rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((m, i) => {
              const isSelected = selectedYear === viewYear && selectedMonth === i;
              const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === i;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMonth(i)}
                  className={cn(
                    "px-1 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isCurrentMonth
                      ? "ring-1 ring-primary/40 text-primary font-semibold hover:bg-primary/10"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                const mm = String(today.getMonth() + 1).padStart(2, "0");
                onChange(`${today.getFullYear()}-${mm}`);
                setOpen(false);
              }}
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Este mês
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
