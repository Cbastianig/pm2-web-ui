import { afterEach } from "vitest";
import { _resetEnv } from "../src/lib/env";

process.env.AUTH_PASSWORD_SALT = "6465765f73616c745f31365f62797465735f";
process.env.AUTH_PASSWORD_HASH =
  "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92" +
  "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
process.env.AUTH_USERNAME ||= "admin";

afterEach(() => {
  _resetEnv();
});
