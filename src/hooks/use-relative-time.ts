import { useEffect, useState } from "react";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < MS_PER_MINUTE) {
    return "Just now";
  }

  if (diffMs < MS_PER_HOUR) {
    const mins = Math.floor(diffMs / MS_PER_MINUTE);
    return `${mins} min${mins === 1 ? "" : "s"} ago`;
  }

  if (diffMs < MS_PER_DAY) {
    const hours = Math.floor(diffMs / MS_PER_HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  if (diffMs < 2 * MS_PER_DAY) {
    return "Yesterday";
  }

  if (diffMs < 7 * MS_PER_DAY) {
    const days = Math.floor(diffMs / MS_PER_DAY);
    return `${days} days ago`;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function useRelativeTime(isoString: string | null | undefined): string {
  const [label, setLabel] = useState(() =>
    isoString ? formatRelative(new Date(isoString)) : ""
  );

  useEffect(() => {
    if (!isoString) {
      setLabel("");
      return;
    }

    const update = () => setLabel(formatRelative(new Date(isoString)));
    update();

    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [isoString]);

  return label;
}
