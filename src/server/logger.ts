import pino from "pino";

const level = process.env.LOG_LEVEL || "info";

export const logger = pino({
  name: "hub.stx.pub",
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['set-cookie']",
      "authorization",
      "cookie",
      "set-cookie",
      "token",
      "apiKey",
      "apikey",
    ],
    censor: "[Redacted]",
  },
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      singleLine: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});
