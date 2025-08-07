import express from 'express';
import Database from 'better-sqlite3';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate environment variables
const requiredEnvVars = ['S3_BUCKET', 'AWS_REGION'];
const missingVars = requiredEnvVars.filter(name => !process.env[name]);
if (missingVars.length) {
  console.error(`Missing environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Security middleware (Helmet 5.x)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    xssFilter: false,
    noSniff: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Separate rate limiter for uploads (stricter)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many upload requests, please try later.' },
});
app.use(uploadLimiter);

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// JSON body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// AWS S3 Client v3 setup
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Database setup
const dbPath = join(__dirname, process.env.DATABASE_PATH || './data/files.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const db = new Database(dbPath);

// Enable WAL and other pragmas for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000000');
db.pragma('temp_store = memory');

// Create files table with new starred + trashed columns
const createTable = db.prepare(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    s3_key TEXT NOT NULL UNIQUE,
    starred INTEGER DEFAULT 0,
    trashed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
createTable.run();

// Migrate columns if missing (ignore error if exists)
try {
  db.prepare('ALTER TABLE files ADD COLUMN starred INTEGER DEFAULT 0').run();
} catch {}
try {
  db.prepare('ALTER TABLE files ADD COLUMN trashed INTEGER DEFAULT 0').run();
} catch {}

// Prepared statements
const insertFile = db.prepare(`
  INSERT INTO files (name, size, content_type, s3_key)
  VALUES (?, ?, ?, ?)
`);

const selectFiles = db.prepare(`
  SELECT * FROM files ORDER BY created_at DESC LIMIT ? OFFSET ?
`);

const countFiles = db.prepare('SELECT COUNT(*) as count FROM files');

const deleteFile = db.prepare('DELETE FROM files WHERE id = ?');

const getFileById = db.prepare('SELECT * FROM files WHERE id = ?');

const updateFileStarred = db.prepare('UPDATE files SET starred = ? WHERE id = ?');

const updateFileTrashed = db.prepare('UPDATE files SET trashed = ? WHERE id = ?');

// Multer config for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = /^(image|video|audio|application|text)\//;
    if (allowedMimes.test(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node_version: process.version,
  });
});

// List files (paginated)
app.get('/api/files', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const files = selectFiles.all(limit, offset);
    const totalCount = countFiles.get().count;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({ files, pagination: { currentPage: page, totalItems: totalCount, totalPages, itemsPerPage: limit, hasNext: page < totalPages, hasPrev: page > 1 } });
  } catch (e) {
    console.error('Error fetching files:', e);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Upload endpoint
app.post('/api/files', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { originalname, mimetype, size, path: tempPath } = req.file;
  const s3Key = `files/${Date.now()}-${originalname}`;

  try {
    const fileBuffer = readFileSync(tempPath);
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimetype,
      Metadata: { originalName: originalname, uploadedAt: new Date().toISOString() },
    });

    await s3Client.send(uploadCommand);
    const result = insertFile.run(originalname, size, mimetype, s3Key);
    unlinkSync(tempPath);

    res.status(201).json({
      id: result.lastInsertRowid,
      name: originalname,
      size,
      content_type: mimetype,
      s3_key: s3Key,
      starred: 0,
      trashed: 0,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Upload error:', e);
    if (existsSync(tempPath)) unlinkSync(tempPath);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download file
app.get('/api/files/:id/download', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const getCommand = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: file.s3_key });
    getSignedUrl(s3Client, getCommand, { expiresIn: 3600 })
      .then((signedUrl) => res.json({ downloadUrl: signedUrl, fileName: file.name, contentType: file.content_type }))
      .catch((e) => {
        console.error('Signed URL error:', e);
        res.status(500).json({ error: 'Failed to generate download link' });
      });
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

// Star a file
app.post('/api/files/:id/star', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    updateFileStarred.run(1, fileId);
    res.json({ message: 'File starred' });
  } catch (e) {
    console.error('Star error:', e);
    res.status(500).json({ error: 'Failed to star file' });
  }
});

// Unstar a file
app.post('/api/files/:id/unstar', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    updateFileStarred.run(0, fileId);
    res.json({ message: 'File unstarred' });
  } catch (e) {
    console.error('Unstar error:', e);
    res.status(500).json({ error: 'Failed to unstar file' });
  }
});

// Move file to trash (soft delete)
app.post('/api/files/:id/trash', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    updateFileTrashed.run(1, fileId);
    res.json({ message: 'File moved to trash' });
  } catch (e) {
    console.error('Trash error:', e);
    res.status(500).json({ error: 'Failed to move file to trash' });
  }
});

// Restore file from trash
app.post('/api/files/:id/restore', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    updateFileTrashed.run(0, fileId);
    res.json({ message: 'File restored' });
  } catch (e) {
    console.error('Restore error:', e);
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

// Permanently delete a file
app.delete('/api/files/:id', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = getFileById.get(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const deleteCommand = new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: file.s3_key });
    s3Client.send(deleteCommand)
      .then(() => {
        deleteFile.run(fileId);
        res.json({ message: 'File deleted permanently' });
      })
      .catch((e) => {
        console.error('S3 Delete error:', e);
        res.status(500).json({ error: 'Failed to delete file' });
      });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  if (error.message === 'Invalid file type') return res.status(400).json({ error: 'Invalid file type' });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, exiting...');
  db.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received, exiting...');
  db.close();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️ Database: ${dbPath}`);
  console.log(`☁️ S3 Bucket: ${process.env.S3_BUCKET}`);
});
