import { NextFunction, Request, Response } from "express";

import logger from "../utils/logger";

const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    logger.error(`ERROR[${req.method}] ${req.url} → ${err.message}`);
    res.status(statusCode).json({
        status: "error",
        message: err.message || "Internal Server Error",
    });
};

export default errorHandler;
