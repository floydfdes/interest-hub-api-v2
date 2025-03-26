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
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import logger from "./utils/logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4300;

app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests, please try again later.",
    })
);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);


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

