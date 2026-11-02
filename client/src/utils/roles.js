export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  INSPECTOR: 'inspector',
  WARD_USER: 'ward_user',
});

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  inspector: 'Inspector / Technician',
  ward_user: 'Ward Office User',
};

export const ALL_ROLES = Object.values(ROLES);
