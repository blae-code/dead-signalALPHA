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

export const API_BASE = configuredBackendUrl || getBrowserOrigin();
export const API_ROOT = API_BASE ? `${API_BASE}/api` : '/api';
export const WS_BASE = API_BASE
  ? API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  : '';
