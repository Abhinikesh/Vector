import mongoose, { Schema, Document } from 'mongoose';

export interface IFile {
  filename: string;
  content: string;
  language: string;
  order: number;
}

export interface IRoom extends Document {
  code: string;
  files: IFile[];
  createdAt: Date;
}

const FileSchema: Schema = new Schema({
  filename: { type: String, required: true },
  content: { type: String, default: '' },
  language: { type: String, required: true },
  order: { type: Number, required: true }
});

const RoomSchema: Schema = new Schema({
  code: { type: String, required: true, unique: true, index: true },
  files: [FileSchema],
  createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL 24h
});

export default mongoose.model<IRoom>('Room', RoomSchema);
