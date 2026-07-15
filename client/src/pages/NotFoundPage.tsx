import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-slate-500">This page could not be found.</p>
      <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
