import { api } from './api.js';

export const wardService = {
  list: (params) => api.get('/wards', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/wards/${id}`).then((r) => r.data.data),
  create: (data) => api.post('/wards', data).then((r) => r.data.data),
  update: (id, data) => api.put(`/wards/${id}`, data).then((r) => r.data.data),
  remove: (id) => api.delete(`/wards/${id}`),
  setUsers: (id, userIds) => api.put(`/wards/${id}/users`, { user_ids: userIds }).then((r) => r.data.data),
};
