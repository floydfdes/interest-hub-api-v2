import "./config/loadEnv";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response } from "express";

import rateLimit from "express-rate-limit";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import connectDB from "./config/database";
import swaggerDocument from "./docs/swagger.json";
import errorHandler from "./middleware/errorHandler";
import requestLogger from "./middleware/requestLogger";
import aiRoutes from "./routes/aiRoutes";
import adminRoutes from "./routes/adminRoutes";
import authRoutes from "./routes/authRoutes";
import commentRoutes from "./routes/commentRoutes";
import contactRoutes from "./routes/contactRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import postRoutes from "./routes/postRoutes";
import reportRoutes from "./routes/reportRoutes";
import searchRoutes from "./routes/searchRoutes";
import shareRoutes from "./routes/shareRoutes";
import tagRoutes from "./routes/tagRoutes";
import userRoutes from "./routes/userRoutes";
import logger, { logError } from "./utils/logger";

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:4300")
  .split(",")
  .map((origin) => origin.trim());

const app = express();
const PORT = process.env.PORT || 4300;
const landingPageHtml = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>InterestHub API</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #20135f;
        --muted: #6f6f8f;
        --brand: #6d3df5;
        --brand-dark: #3b238c;
        --card: rgba(255, 255, 255, 0.82);
        --line: rgba(109, 61, 245, 0.16);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(109, 61, 245, 0.22), transparent 34rem),
          radial-gradient(circle at bottom right, rgba(23, 191, 150, 0.18), transparent 30rem),
          #f8f7ff;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 48px 20px;
      }
      .shell {
        width: min(1040px, 100%);
        padding: 42px;
        border: 1px solid var(--line);
        border-radius: 32px;
        background: var(--card);
        box-shadow: 0 28px 80px rgba(40, 28, 120, 0.14);
        backdrop-filter: blur(18px);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(109, 61, 245, 0.1);
        color: var(--brand-dark);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        max-width: 820px;
        margin: 24px 0 16px;
        font-size: clamp(42px, 7vw, 82px);
        line-height: 0.95;
        letter-spacing: -0.07em;
      }
      p {
        max-width: 720px;
        margin: 0;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.7;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 32px;
      }
      a {
        text-decoration: none;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 22px;
        border-radius: 999px;
        font-weight: 800;
        box-shadow: 0 12px 30px rgba(109, 61, 245, 0.22);
      }
      .primary {
        background: var(--brand);
        color: #fff;
      }
      .secondary {
        background: #fff;
        color: var(--brand);
        border: 1px solid var(--line);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 38px;
      }
      .card {
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.72);
      }
      .card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 16px;
      }
      .card span {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.55;
      }
      .meta {
        margin-top: 26px;
        color: var(--muted);
        font-size: 14px;
      }
      code {
        color: var(--brand-dark);
        font-weight: 800;
      }
      @media (max-width: 760px) {
        .shell {
          padding: 28px;
          border-radius: 24px;
        }
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="shell">
        <div class="badge">InterestHub API</div>
        <h1>Social content backend for communities built around interests.</h1>
        <p>
          InterestHub powers posts, profiles, comments, follows, saved collections, sharing,
          notifications, moderation, admin workflows, search, tags, and AI-ready assistant endpoints.
        </p>
        <div class="actions">
          <a class="button primary" href="/api-docs">Go to API Docs</a>
          <a class="button secondary" href="/api/health">Check API Health</a>
        </div>
        <div class="grid">
          <div class="card">
            <strong>Content and Discovery</strong>
            <span>Posts, drafts, comments, hashtags, tags, global search, feeds, saved collections, and recently viewed posts.</span>
          </div>
          <div class="card">
            <strong>Social Graph</strong>
            <span>Profiles, follows, private accounts, requests, blocking, muting, sharing, pinned posts, and mutual followers.</span>
          </div>
          <div class="card">
            <strong>Safety and Admin</strong>
            <span>Reports, moderation review, bad language detection, notification preferences, rate limits, and AI-ready endpoints.</span>
          </div>
        </div>
        <div class="meta">Base API path: <code>/api</code></div>
      </section>
    </main>
  </body>
</html>
`;

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(requestLogger);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    message: { message: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/", (_req: Request, res: Response) => {
  res.type("html").send(landingPageHtml);
});

app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/contact", contactRoutes);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", environment: process.env.NODE_ENV || "dev" });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use((_req, _res, next) => {
  const err = new Error("Not Found");
  next(err);
});

app.use(errorHandler);

export default app;

if (require.main === module) {
  void connectDB()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      logError("MongoDB connection error", error);
      process.exitCode = 1;
    });
}
