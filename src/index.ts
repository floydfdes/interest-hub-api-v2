import express, { Request, Response } from "express";

import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./docs/swagger.json";
import errorHandler from "./middleware/errorHandler";
import logger from "./utils/logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4300;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests, please try again later.",
    })
);

app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", environment: process.env.NODE_ENV || "dev" });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use((_req, _res, next) => {
    const err = new Error("Not Found");
    next(err);
});

app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
});
