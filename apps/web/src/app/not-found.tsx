import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="flex justify-center"><FileQuestion className="h-16 w-16 text-muted-foreground" /></div>
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="flex gap-3 justify-center">
          <Button asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
          <Button variant="outline" asChild><Link href="/customers">Customers</Link></Button>
        </div>
      </div>
    </div>
  );
}
