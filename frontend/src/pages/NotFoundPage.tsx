import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Card, EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={<Compass size={28} aria-hidden />} title="Page not found">
        <Link to="/">Go to the overview</Link>
      </EmptyState>
    </Card>
  );
}
