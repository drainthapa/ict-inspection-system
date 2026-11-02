import { api } from './api.js';

export const equipmentService = {
  list: (params) => api.get('/equipment', { params }).then((r) => r.data),
  get: (id) => api.get(`/equipment/${id}`).then((r) => r.data.data),
  create: (data) => api.post('/equipment', data).then((r) => r.data.data),
  update: (id, data) => api.put(`/equipment/${id}`, data).then((r) => r.data.data),
  remove: (id) => api.delete(`/equipment/${id}`),
  nextAssetId: (wardId, categoryId) => api.get('/equipment/next-asset-id', {
    params: { ward_id: wardId, category_id: categoryId },
  }).then((r) => r.data.data.asset_id),
};

export const categoryService = {
  list: (params) => api.get('/equipment/categories', { params }).then((r) => r.data.data),
  groups: () => api.get('/equipment/categories/groups').then((r) => r.data.data),
  create: (data) => api.post('/equipment/categories', data).then((r) => r.data.data),
  update: (id, data) => api.put(`/equipment/categories/${id}`, data).then((r) => r.data.data),
  remove: (id) => api.delete(`/equipment/categories/${id}`),
};

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data.data),
  save: (values) => api.put('/settings', { values }).then((r) => r.data.data),
};
