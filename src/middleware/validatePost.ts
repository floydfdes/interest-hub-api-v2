import { body } from "express-validator";

export const createPostValidation = [
    body("title").notEmpty().withMessage("Title is required"),
    body("content").notEmpty().withMessage("Content is required"),
    body("visibility")
        .isIn(["public", "private", "followersOnly"])
        .withMessage("Visibility must be one of: public, private, followersOnly"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("images").optional().isArray().withMessage("Images must be an array of URLs"),
    body("category").optional().isString().withMessage("Category must be a string")
];

export const updatePostValidation = [
    body("title").optional().isString(),
    body("content").optional().isString(),
    body("visibility")
        .optional()
        .isIn(["public", "private", "followersOnly"])
        .withMessage("Invalid visibility value"),
    body("tags").optional().isArray(),
    body("images").optional().isArray(),
    body("category").optional().isString()
];
