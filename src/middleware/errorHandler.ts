import { NextFunction, Request, Response } from "express";

import { logError } from "../utils/logger";

const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  logError("Unhandled request error", err, {
    method: req.method,
    url: req.originalUrl,
    statusCode,
  });
  res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Something went wrong. Please try again."
        : err.message || "Request failed",
  });
};

export default errorHandler;
