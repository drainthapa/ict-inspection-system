import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

export const UPLOAD_ROOT = path.resolve(env.uploads.dir);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Identify the real type from the file's first bytes; never trust the client's MIME. */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Multer in memory: files are checked before anything touches the disk. */
export const photoUpload = (field = 'photos', maxCount = 10) => (req, res, next) => {
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.uploads.maxBytes, files: maxCount },
    fileFilter: (_req, file, cb) => {
      if (!EXT[file.mimetype]) return cb(new ApiError(400, `${file.originalname}: only JPG, PNG or WEBP images are allowed`));
      cb(null, true);
    },
  }).array(field, maxCount)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `Each photo must be smaller than ${Math.round(env.uploads.maxBytes / 1048576)} MB`));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ApiError(400, `Upload at most ${maxCount} photos at a time`));
    }
    next(err);
  });
};

/**
 * Validate and write files to uploads/<folder>/<yyyy>/<mm>/<random>.<ext>.
 * Returns metadata rows; on any failure, removes what was written and throws.
 */
export async function saveImages(files, folder) {
  const now = new Date();
  const rel = path.join(folder, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const dir = path.join(UPLOAD_ROOT, rel);
  await fs.mkdir(dir, { recursive: true });
  const saved = [];
  try {
    for (const f of files) {
      const real = sniff(f.buffer);
      if (!real) throw new ApiError(400, `${f.originalname} is not a valid JPG, PNG or WEBP image`);
      const name = `${crypto.randomUUID()}.${EXT[real]}`;
      await fs.writeFile(path.join(dir, name), f.buffer, { flag: 'wx' });
      saved.push({
        file_path: path.posix.join(...rel.split(path.sep), name),
        original_name: f.originalname.slice(0, 255),
        mime_type: real,
        size_bytes: f.size,
      });
    }
    return saved;
  } catch (err) {
    await removeFiles(saved.map((s) => s.file_path));
    throw err;
  }
}

export async function removeFiles(relPaths) {
  await Promise.all(relPaths.map(async (p) => {
    const full = path.resolve(UPLOAD_ROOT, p);
    if (!full.startsWith(UPLOAD_ROOT + path.sep)) return; // never leave the upload root
    await fs.unlink(full).catch(() => {});
  }));
}
