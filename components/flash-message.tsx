"use client";

import { useEffect, useState } from "react";

type FlashMessageProps = {
  tone: "success" | "error" | "info";
  title: string;
  message: string;
};

export function FlashMessage({ tone, title, message }: FlashMessageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className={`flash-message flash-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="flash-icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "error" ? "!" : "i"}</span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button type="button" onClick={() => setVisible(false)} aria-label="Tutup notifikasi">×</button>
    </div>
  );
}
