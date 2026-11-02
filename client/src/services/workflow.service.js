import { api } from './api.js';

const data = (r) => r.data.data;

export const inspectionService = {
  list: (params) => api.get('/inspections', { params }).then((r) => r.data),
  get: (id) => api.get(`/inspections/${id}`).then(data),
  checklist: (categoryId) => api.get('/inspections/checklist', { params: { category_id: categoryId } }).then(data),
  create: (body) => api.post('/inspections', body).then(data),
  update: (id, body) => api.put(`/inspections/${id}`, body).then(data),
  remove: (id) => api.delete(`/inspections/${id}`),
  uploadPhotos: (id, files, photoType) => {
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    if (photoType) form.append('photo_type', photoType);
    return api.post(`/inspections/${id}/photos`, form, { timeout: 120_000 }).then(data);
  },
  deletePhoto: (id, photoId) => api.delete(`/inspections/${id}/photos/${photoId}`),
};

export const maintenanceService = {
  list: (params) => api.get('/maintenance', { params }).then((r) => r.data),
  get: (id) => api.get(`/maintenance/${id}`).then(data),
  create: (body) => api.post('/maintenance', body).then(data),
  update: (id, body) => api.put(`/maintenance/${id}`, body).then(data),
  uploadPhotos: (id, files, stage) => {
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    form.append('stage', stage);
    return api.post(`/maintenance/${id}/photos`, form, { timeout: 120_000 }).then(data);
  },
  deletePhoto: (id, photoId) => api.delete(`/maintenance/${id}/photos/${photoId}`),
};

export const replacementService = {
  list: (params) => api.get('/replacements', { params }).then((r) => r.data),
  create: (body) => api.post('/replacements', body).then(data),
  update: (id, body) => api.put(`/replacements/${id}`, body).then(data),
};

export const dashboardService = {
  summary: (params) => api.get('/dashboard/summary', { params }).then(data),
  charts: (params) => api.get('/dashboard/charts', { params }).then(data),
};

export const reportService = {
  types: () => api.get('/reports').then(data),
  get: (type, params) => api.get(`/reports/${type}`, { params }).then(data),
  /** Download through axios so the auth cookie and error messages work the same as other calls */
  download: async (format, type, params) => {
    const res = await api.get(`/reports/export/${format}`, { params: { ...params, type }, responseType: 'blob', timeout: 120_000 });
    const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1] || `report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    const url = URL.createObjectURL(res.data);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
