import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import "@/i18n/extra";
import { AdminI18nProvider } from "@/i18n/runtime";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AdminI18nProvider>
        <Outlet />
      </AdminI18nProvider>
    </QueryClientProvider>
  );
}
