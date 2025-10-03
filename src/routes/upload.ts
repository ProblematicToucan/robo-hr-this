import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { AppDataSource } from "../db/data-source";
import { File } from "../db/entities/file.entity";
import { logger } from "../config/logger";

const router = Router();

// Create storage directory if it doesn't exist
const storageDir = process.env.STORAGE_DIR || './storage';
if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, storageDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

/**
 * POST /upload
 * 
 * Upload CV and project report files.
 * Returns file IDs for use in evaluation requests.
 */
router.post('/', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'report', maxCount: 1 }
]), async (req: Request, res: Response) => {
    try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (!files.cv || !files.report) {
            return res.status(400).json({
                error: 'Both CV and report files are required'
            });
        }

        const cvFile = files.cv[0];
        const reportFile = files.report[0];

        // Calculate file checksums
        const cvChecksum = crypto.createHash('sha256')
            .update(fs.readFileSync(cvFile.path))
            .digest('hex');

        const reportChecksum = crypto.createHash('sha256')
            .update(fs.readFileSync(reportFile.path))
            .digest('hex');

        // Save file metadata to database
        const fileRepository = AppDataSource.getRepository(File);

        const cvFileRecord = await fileRepository.save({
            type: 'cv',
            storage_uri: cvFile.path,
            checksum: cvChecksum
        });

        const reportFileRecord = await fileRepository.save({
            type: 'report',
            storage_uri: reportFile.path,
            checksum: reportChecksum
        });

        logger.info({
            cvFileId: cvFileRecord.id,
            reportFileId: reportFileRecord.id,
            cvSize: cvFile.size,
            reportSize: reportFile.size
        }, 'Files uploaded successfully');

        res.json({
            cvFileId: cvFileRecord.id,
            reportFileId: reportFileRecord.id
        });

    } catch (error: any) {
        logger.error('File upload failed:', error);
        res.status(500).json({
            error: 'File upload failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export { router as uploadRoutes };
