import { createFileRoute, redirect } from "@tanstack/react-router";
import { checkSessionFn } from "@/server/auth/functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await checkSessionFn();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
