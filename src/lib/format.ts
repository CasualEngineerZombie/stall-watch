const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

export function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function formatDays(days: number | null): string {
  if (days === null) return "—";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatDuration(start: string, finish: string | null): string {
  if (!finish) return "—";

  const seconds = Math.max(
    0,
    Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 1000),
  );

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}
