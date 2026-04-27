const router = require("express").Router();
const { upload } = require("../config/cloudinary");
const { protect, admin } = require("../middleware/auth");

// POST /api/upload  (admin, multipart form field: "image")
router.post("/", protect, admin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.json({
    url: req.file.path,
    publicId: req.file.filename,
  });
});

// POST /api/upload/multi  (admin, field: "images", up to 6)
router.post("/multi", protect, admin, upload.array("images", 6), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ message: "No files uploaded" });
  res.json(
    req.files.map((f) => ({
      url: f.path,
      publicId: f.filename,
    }))
  );
});

// POST /api/upload/avatar  (any logged-in user, field: "image")
router.post("/avatar", protect, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.json({
    url: req.file.path,
    publicId: req.file.filename,
  });
});

module.exports = router;
