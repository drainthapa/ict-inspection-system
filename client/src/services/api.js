import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // the auth token lives in an httpOnly cookie
  timeout: 30_000,
});

// When a session ends server-side (logout elsewhere, deactivation, expiry),
// tell the AuthContext so it can return the user to the login screen.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/me')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(err);
  },
);

/** Normalise any request failure into { message, fieldErrors }. */
export function getApiError(err) {
  if (!err.response) {
    return {
      message: err.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'Cannot reach the server. Check your internet connection.',
      fieldErrors: {},
    };
  }
  const { status, data } = err.response;
  const body = data && typeof data === 'object' ? data : {};
  if (body.message) return { message: body.message, fieldErrors: body.errors || {} };
  // No JSON body: usually a proxy/gateway error while the API is down
  const message = status >= 500
    ? 'The server is not responding right now. Please try again in a moment.'
    : `Request failed (${status})`;
  return { message, fieldErrors: {} };
}

/** Copy server field errors into a React Hook Form instance. */
export function applyFieldErrors(setError, fieldErrors) {
  Object.entries(fieldErrors).forEach(([field, message]) => {
    setError(field.replace(/\[(\d+)\]/g, '.$1'), { type: 'server', message });
  });
}
