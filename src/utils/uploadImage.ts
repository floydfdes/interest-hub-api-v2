import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { logError } from "./logger";

const configureCloudinary = (): void => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary configuration is missing");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

const isRemoteImageUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value.trim());
const isDataUriImage = (value: string): boolean => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim());
const isBase64Image = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 16 || trimmed.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
};

export const uploadImageToCloudinary = async (base64: string, folder: string): Promise<string> => {
  const image = base64.trim();
  if (isRemoteImageUrl(image)) {
    return image;
  }

  if (!isDataUriImage(image) && !isBase64Image(image)) {
    throw new Error("Image must be a data URI, base64 string, or image URL");
  }

  configureCloudinary();

  try {
    const base64Data = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
    const buffer = Buffer.from(base64Data, "base64");

    const resizedBuffer = await sharp(buffer)
      .resize(800, 800, { fit: "inside" })
      .toFormat("jpeg")
      .toBuffer();

    const uploadResult = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url);
        }
      );

      stream.end(resizedBuffer);
    });

    return uploadResult;
  } catch (error) {
    logError("Cloudinary image upload failed", error, {
      folder,
    });
    throw new Error("Image upload failed", { cause: error });
  }
};
