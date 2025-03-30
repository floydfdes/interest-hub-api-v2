import express, { Request, Response } from "express";

import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import connectDB from "./config/database";
import swaggerDocument from "./docs/swagger.json";
import errorHandler from "./middleware/errorHandler";
import { restrictExternalAccess } from "./middleware/restrictExternalAccess";
import authRoutes from "./routes/authRoutes";
import postRoutes from "./routes/postRoutes";
import userRoutes from "./routes/userRoutes";
import logger from "./utils/logger";

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:4300",
];

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4300;

app.use(helmet());
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true
    })
);
app.use(cookieParser());
app.use(express.json());
app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms :remote-addr :user-agent')
);
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests, please try again later.",
    })
);
app.use("/api", restrictExternalAccess);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);



app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", environment: process.env.NODE_ENV || "dev" });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use((_req, _res, next) => {
    const err = new Error("Not Found");
    next(err);
});

app.use(errorHandler);
connectDB();

export default app;

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info(`🚀 Server running on port ${PORT}`);
    });
}

