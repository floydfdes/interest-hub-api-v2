import mongoose, { Document, Schema } from "mongoose";

export type Visibility = "public" | "private" | "followersOnly";

export interface IPost extends Document {
    title: string;
    content: string;
    images: string[];
    category: string;
    tags: string[];
    author: mongoose.Types.ObjectId;
    likes: mongoose.Types.ObjectId[];
    comments: mongoose.Types.ObjectId[];
    visibility: Visibility;
    viewCount: number;
    sharedFrom?: mongoose.Types.ObjectId;
    isEdited: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
    {
        title: { type: String, required: true },
        content: { type: String, required: true },
        images: [{ type: String, required: true }],
        category: { type: String, required: true },
        tags: [{ type: String }],
        author: { type: Schema.Types.ObjectId, ref: "User", required: true },
        likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
        comments: [{ type: Schema.Types.ObjectId, ref: "Comment" }],
        visibility: {
            type: String,
            enum: ["public", "private", "followersOnly"],
            default: "public"
        },
        viewCount: { type: Number, default: 0 },
        sharedFrom: { type: Schema.Types.ObjectId, ref: "Post", default: null },
        isEdited: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default mongoose.model<IPost>("Post", PostSchema);
