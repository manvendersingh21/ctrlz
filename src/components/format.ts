export const time = (d: string | Date) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const money = (n?: number | null) => (n == null ? "" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

export const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
