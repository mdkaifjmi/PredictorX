const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8009";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.message || "Request failed");
  return data;
}

export const api = {
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: (token) => request("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
  health: () => request("/api/health"),
  listDatasets: (token) => request("/api/datasets", { headers: { Authorization: `Bearer ${token}` } }),
  getDataset: (token, id) => request(`/api/datasets/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
  listModels: (token) => request("/api/models", { headers: { Authorization: `Bearer ${token}` } }),
  trainModels: (token, datasetId, target, taskType) => request(`/api/models/train?dataset_id=${encodeURIComponent(datasetId)}&target=${encodeURIComponent(target)}${taskType ? `&task_type=${encodeURIComponent(taskType)}` : ""}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  getModel: (token, id) => request(`/api/models/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
  predict: (token, id, features) => request(`/api/models/${id}/predict`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ features }) }),
  explain: (token, id, features, historyId = null) => request(`/api/models/${id}/explain`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ features, history_id: historyId }) }),
  whatIf: (token, id, features, baselineFeatures) => request(`/api/models/${id}/what-if`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ features, baseline_features: baselineFeatures }) }),
  recommend: (token, id, features, baselineFeatures = {}) => request(`/api/models/${id}/recommend`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ features, baseline_features: baselineFeatures }) }),
  listHistory: (token) => request("/api/history", { headers: { Authorization: `Bearer ${token}` } }),
  deleteHistory: (token, id) => request(`/api/history/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  deleteModel: (token, id) => request(`/api/models/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  adminUsers: (token) => request("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
  adminSetUserStatus: (token, id, status) => request(`/api/admin/users/${id}/status`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) }),
  uploadDataset: async (token, file) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_BASE}/api/datasets/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Dataset upload failed");
    return data;
  }
};
