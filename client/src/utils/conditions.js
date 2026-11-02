export const CONDITIONS = {
  good: { label: 'Good / fully operational', short: 'Good', tone: 'green' },
  partial: { label: 'Partially operational', short: 'Partial', tone: 'amber' },
  not_operational: { label: 'Not operational', short: 'Not operational', tone: 'red' },
  damaged: { label: 'Physically damaged', short: 'Damaged', tone: 'red' },
};

export const conditionInfo = (c) => CONDITIONS[c] || { label: 'Not inspected yet', short: 'Not inspected', tone: 'slate' };

export const EQUIPMENT_STATUS = {
  active: { label: 'In use', tone: 'blue' },
  replaced: { label: 'Replaced', tone: 'slate' },
  disposed: { label: 'Disposed', tone: 'slate' },
};

export const CHECKLISTS = {
  computer: 'Computer / laptop',
  printer: 'Printer / scanner',
  biometric: 'Biometric device',
  cctv: 'CCTV',
  networking: 'Networking',
  ups: 'UPS',
  presentation: 'Smart board / projector',
};
