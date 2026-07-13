const path = require('path')
const fs = require('fs')
const express = require('express')
const multer = require('multer')
const { protect } = require('../middleware/auth')

const uploadsDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10)
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed.'))
    }
    cb(null, true)
  },
})

const router = express.Router()
router.use(protect)

router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed.' })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' })
    }
    const url = `/uploads/${req.file.filename}`
    res.status(201).json({
      success: true,
      data: {
        url,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    })
  })
})

module.exports = router
