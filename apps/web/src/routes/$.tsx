import { createFileRoute } from '@tanstack/react-router';
import App from '../App';
import { preloadHome } from '../lib/top';

// Preserve the old non-API SPA fallback without swallowing API responses.
export const Route = createFileRoute('/$')({
  loader: ({ context }) => preloadHome(context.queryClient),
  component: App
});
