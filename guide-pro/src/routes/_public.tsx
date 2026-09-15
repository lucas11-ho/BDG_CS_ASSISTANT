import { useEffect } from "react";
import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public/PublicLayout";
import { startPublicTrafficHeartbeat, trackPublicPageView } from "@/lib/traffic-analytics";

export const Route = createFileRoute("/_public")({
  component: PublicRoot,
});

function PublicRoot() {
  const location = useLocation();

  useEffect(() => startPublicTrafficHeartbeat(), []);
  useEffect(() => {
    trackPublicPageView();
  }, [location.pathname, location.searchStr]);

  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
