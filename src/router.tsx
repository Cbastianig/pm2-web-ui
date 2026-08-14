import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const basepath =
    import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    basepath,
    trailingSlash: "never",
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
