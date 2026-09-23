import { Platform } from 'react-native';

/**
 * A physical device or emulator cannot reach the host's `localhost`, so the
 * default differs per platform:
 *   - Android emulator reaches the host at 10.0.2.2
 *   - iOS simulator and web share the host network
 * Override with EXPO_PUBLIC_API_URL when running on a real device (set it to
 * your machine's LAN IP, e.g. http://192.168.1.5:4000).
 */
const fallbackHost = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

export const API_ORIGIN = process.env.EXPO_PUBLIC_API_URL || fallbackHost;
export const API_BASE = `${API_ORIGIN}/api/v1`;

/** Error carrying the server's machine-readable code so callers can branch. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let authToken = null;
export const setAuthToken = (token) => {
  authToken = token;
};
export const getAuthToken = () => authToken;

/**
 * Thin fetch wrapper. Every request carries a timeout - a hung socket on a
 * mobile network otherwise leaves the UI spinning forever with no way out.
 */
export async function request(path, { method = 'GET', body, headers = {}, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const err = payload?.error || {};
      throw new ApiError(res.status, err.code || 'UNKNOWN', err.message || 'Request failed', err.details);
    }
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'The request timed out. Check your connection and try again.');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the server at ${API_ORIGIN}.`);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  devLogin: (email) => request('/auth/dev-login', { method: 'POST', body: { email } }),

  getCompetition: (idOrSlug, locale) => request(`/competitions/${idOrSlug}?locale=${locale}`),

  register: (competitionId, idempotencyKey) =>
    request(`/competitions/${competitionId}/registrations`, {
      method: 'POST',
      body: { idempotencyKey },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  confirmPayment: ({ orderId, paymentId, signature }) =>
    request('/payments/confirm', { method: 'POST', body: { orderId, paymentId, signature } }),

  cancelRegistration: (competitionId) =>
    request(`/competitions/${competitionId}/registrations`, { method: 'DELETE' }),

  submit: (competitionId, mediaUrl, caption) =>
    request(`/competitions/${competitionId}/submission`, {
      method: 'PUT',
      body: { mediaUrl, caption },
    }),

  getWinners: (competitionId) => request(`/competitions/${competitionId}/winners`),
};
