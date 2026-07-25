const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${base}${path}`;
}
