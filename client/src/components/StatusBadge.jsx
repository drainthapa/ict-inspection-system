import Badge from './ui/Badge.jsx';
import { MAINT_STATUS, REPL_STATUS } from '../utils/workflow.js';

export function MaintenanceBadge({ status }) {
  const s = MAINT_STATUS[status] || { label: status, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ReplacementBadge({ status }) {
  const s = REPL_STATUS[status] || { label: status, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
