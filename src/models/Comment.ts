import mongoose, { Document, Schema } from "mongoose";

interface IReply {
    user: mongoose.Types.ObjectId;
    content: string;
    likes: mongoose.Types.ObjectId[];
    createdAt: Date;
}

export interface IComment extends Document {
    user: mongoose.Types.ObjectId;
    post: mongoose.Types.ObjectId;
    content: string;
    likes: mongoose.Types.ObjectId[];
    replies: IReply[];
    createdAt: Date;
    updatedAt: Date;
}

const ReplySchema = new Schema<IReply>(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        content: { type: String, required: true },
        likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
        createdAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const CommentSchema = new Schema<IComment>(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
        content: { type: String, required: true },
        likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
        replies: [ReplySchema]
    },
    { timestamps: true }
);

export default mongoose.model<IComment>("Comment", CommentSchema);
