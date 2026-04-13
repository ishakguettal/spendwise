const BASE = import.meta.env.VITE_API_URL ?? '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    if (body.fallback) err.fallback = body.fallback;
    throw err;
  }
  return body;
}

export const api = {
  getTransactions: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    );
    const qs = q.toString();
    return request(`/api/transactions${qs ? `?${qs}` : ''}`);
  },
  getSummary: (month) => request(`/api/summary?month=${month}`),
  createTransaction: (data) =>
    request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) =>
    request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) =>
    request(`/api/transactions/${id}`, { method: 'DELETE' }),

  uploadStatement: (file) => {
    const form = new FormData();
    form.append('file', file);
    // No Content-Type header — let the browser set it with the boundary
    return fetch(`${BASE}/api/statements/upload`, { method: 'POST', body: form })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(body.error ?? `HTTP ${res.status}`);
          if (body.fallback) err.fallback = body.fallback;
          throw err;
        }
        return body;
      });
  },

  uploadStatementText: (text) =>
    request('/api/statements/upload', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  getInsights: (month) => request(`/api/insights?month=${month}`),
  hasAnyTransactions: () => request('/api/transactions/any'),
};
