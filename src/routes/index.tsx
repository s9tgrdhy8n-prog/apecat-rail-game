import { createFileRoute } from "@tanstack/react-router";
import { RailShell } from "@/components/rail-shell";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <RailShell key="face-down-tunnel" />;
}
