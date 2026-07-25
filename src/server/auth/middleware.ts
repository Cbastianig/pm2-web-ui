import { createMiddleware } from "@tanstack/react-start";
import { getSession } from "./store";

export const authMiddleware = createMiddleware({ type: "function" })
  .server(async ({ next }) => {
    const session = await getSession();
    if (!session) {
      throw new Error("Unauthorized");
    }
    return next({ context: { session } });
  });
