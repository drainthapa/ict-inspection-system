import {
  LayoutDashboard, Building2, Tags, Boxes, ClipboardPlus, ClipboardList,
  Wrench, History, RefreshCcw, FileBarChart, Users, Settings,
} from 'lucide-react';
import { ROLES } from './roles.js';

const { SUPER_ADMIN: A, INSPECTOR: I, WARD_USER: W } = ROLES;

/**
 * Single source of truth for navigation.
 * `roles` controls visibility (the API enforces the same rules independently).
 */
export const NAV_SECTIONS = [
  {
    title: 'Dashboard',
    items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, roles: [A, I, W], end: true }],
  },
  {
    title: 'ICT management',
    items: [
      { to: '/wards', label: 'Ward offices', icon: Building2, roles: [A, I, W] },
      { to: '/categories', label: 'Equipment categories', icon: Tags, roles: [A] },
      { to: '/equipment', label: 'Equipment inventory', icon: Boxes, roles: [A, I, W] },
    ],
  },
  {
    title: 'Inspection',
    items: [
      { to: '/inspections/new', label: 'New inspection', icon: ClipboardPlus, roles: [A, I] },
      { to: '/inspections', label: 'Inspection records', icon: ClipboardList, roles: [A, I, W] },
    ],
  },
  {
    title: 'Maintenance',
    items: [
      { to: '/maintenance/requests', label: 'Repair requests', icon: Wrench, roles: [A, I, W] },
      { to: '/maintenance', label: 'Maintenance records', icon: History, roles: [A, I, W] },
      { to: '/replacements', label: 'Replacement recommendations', icon: RefreshCcw, roles: [A, I, W] },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/reports', label: 'Reports and export', icon: FileBarChart, roles: [A, I, W] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'User management', icon: Users, roles: [A] },
      { to: '/settings', label: 'Settings', icon: Settings, roles: [A] },
    ],
  },
];

export function navForRole(role) {
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) }))
    .filter((s) => s.items.length);
}
