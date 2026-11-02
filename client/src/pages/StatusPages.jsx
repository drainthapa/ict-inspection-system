import { Link } from 'react-router-dom';
import { ShieldX, FileQuestion } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState.jsx';
import Button from '../components/ui/Button.jsx';

const home = <Link to="/"><Button variant="secondary">Go to overview</Button></Link>;

export function ForbiddenPage() {
  return (
    <div className="card">
      <EmptyState icon={ShieldX} title="You don't have access to this page" action={home}>
        Your role doesn't include this section. Contact the Super Admin if you need access.
      </EmptyState>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={FileQuestion} title="Page not found" action={home}>
        Check the address, or use the menu to find what you need.
      </EmptyState>
    </div>
  );
}
