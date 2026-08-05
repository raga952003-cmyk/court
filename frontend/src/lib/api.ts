/** Backend API base. Empty = same origin (Nginx /api proxy) or Vite proxy. */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === null) return '';
  return String(raw).replace(/\/$/, '');
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, init);
}
