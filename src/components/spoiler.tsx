"use client";

import { useState } from "react";

export function Spoiler(props: { showLabel: string; hideLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-accent hover:underline"
        aria-expanded={open}
      >
        {open ? props.hideLabel : props.showLabel}
      </button>
      {open && <div className="mt-3">{props.children}</div>}
    </div>
  );
}
