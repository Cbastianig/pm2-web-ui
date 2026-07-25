import { createStart } from "@tanstack/react-start";
import { securityMiddleware } from "./security";
import { authMiddleware } from "./auth/middleware";

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware],
}));

export { authMiddleware };
