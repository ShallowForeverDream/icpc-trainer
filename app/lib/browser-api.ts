const BROWSER_API_BASE_URL = "https://114.55.130.137/icpc-api";

export function browserApiUrl(path: string) {
  return `${BROWSER_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
