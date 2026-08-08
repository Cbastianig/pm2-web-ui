import { createStart } from "@tanstack/react-start";
import { securityMiddleware, csrfMiddleware } from "./security";
import { authMiddleware } from "./auth/middleware";

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityMiddleware],
}));

export { authMiddleware };
