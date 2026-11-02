import Badge from './ui/Badge.jsx';
import { conditionInfo } from '../utils/conditions.js';

export default function ConditionBadge({ condition, long = false }) {
  const c = conditionInfo(condition);
  return <Badge tone={c.tone}>{long ? c.label : c.short}</Badge>;
}
