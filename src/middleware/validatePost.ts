import { body } from "express-validator";

const tagValidation = [
  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array")
    .bail()
    .custom((tags: unknown[]) => tags.length <= 10)
    .withMessage("Tags must be an array with at most 10 items"),
  body("tags.*")
    .optional()
    .isString()
    .withMessage("Each tag must be a string")
    .trim()
    .notEmpty()
    .withMessage("Tags cannot be empty")
    .isLength({ max: 30 })
    .withMessage("Tags cannot be longer than 30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Tags can only contain letters, numbers, underscores, and hyphens")
    .not()
    .isIn(["null", "undefined"])
    .withMessage("Tags cannot be null"),
];

export const createPostValidation = [
  body("title").notEmpty().withMessage("Title is required"),
  body("content").notEmpty().withMessage("Content is required"),
  body("image").isString().notEmpty().withMessage("Image is required"),
  body("category").notEmpty().isString().withMessage("Category is required"),
  body("visibility")
    .isIn(["public", "private", "followersOnly"])
    .withMessage("Visibility must be one of: public, private, followersOnly"),
  ...tagValidation,
];

export const updatePostValidation = [
  body("title").optional().isString(),
  body("content").optional().isString(),
  body("image").optional().isString().withMessage("Image must be a data URI, base64 string, or image URL"),
  body("visibility")
    .optional()
    .isIn(["public", "private", "followersOnly"])
    .withMessage("Invalid visibility value"),
  ...tagValidation,
  body("category").optional().isString(),
];
