import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import AdminLayout from "@/components/AdminLayout";
import BulkContentRouteToolbar from "@/components/BulkContentRouteToolbar";

export const Route = createFileRoute("/_admin")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const token =
        window.localStorage.getItem("admin_token") ||
        window.localStorage.getItem("bdg_token") ||
        window.sessionStorage.getItem("admin_token") ||
        window.sessionStorage.getItem("bdg_token");
      if (!token) throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <AdminLayout>
      <BulkContentRouteToolbar />
      <Outlet />
    </AdminLayout>
  ),
});
