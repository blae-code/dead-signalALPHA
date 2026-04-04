function trimTrailingSlash(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function getBrowserOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }
  return trimTrailingSlash(window.location.origin);
}

const configuredBackendUrl = trimTrailingSlash(process.env.REACT_APP_BACKEND_URL);

// Use same-origin API calls when on a custom domain to avoid CORS issues.
// Only use the configured backend URL if we're on the same host.
function resolveApiBase() {
  const browserOrigin = getBrowserOrigin();
  if (!configuredBackendUrl) return browserOrigin;
  // If we're on the configured host, use it directly (same-origin)
  if (browserOrigin === configuredBackendUrl) return configuredBackendUrl;
  // If we're on a custom domain (e.g., dead-signal.ca), use same-origin
  // so requests go through the same ingress without CORS
  if (browserOrigin && !browserOrigin.includes('localhost')) return browserOrigin;
  return configuredBackendUrl;
}

export const API_BASE = resolveApiBase();
export const API_ROOT = API_BASE ? `${API_BASE}/api` : '/api';
export const WS_BASE = API_BASE
  ? API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  : '';
