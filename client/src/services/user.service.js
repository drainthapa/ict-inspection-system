import { api } from './api.js';

export const userService = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data.data),
  create: (data) => api.post('/users', data).then((r) => r.data.data),
  update: (id, data) => api.put(`/users/${id}`, data).then((r) => r.data.data),
  deactivate: (id) => api.delete(`/users/${id}`),
};
