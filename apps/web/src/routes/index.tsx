import { createFileRoute } from '@tanstack/react-router';
import App from '../App';
import { preloadHome } from '../lib/top';

export const Route = createFileRoute('/')({
  loader: ({ context }) => preloadHome(context.queryClient),
  component: App
});
