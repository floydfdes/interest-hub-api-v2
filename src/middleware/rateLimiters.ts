import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const keyByIpAndUser = (req: { ip?: string; userId?: string }) =>
  `${ipKeyGenerator(req.ip ?? "")}:${req.userId ?? "anon"}`;

const rateLimitMessage = { message: "Too many requests. Please try again later." };

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const createContentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const commentRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const socialActionRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 80,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const shareRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: keyByIpAndUser,
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});
