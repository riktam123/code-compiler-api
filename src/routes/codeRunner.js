const express = require("express");
const router = express.Router();
const { runCode, getOutputFromJobId } = require("../controllers/codeRunner");

router.post("/runCode", runCode);
router.get("/getOutputFromJobId", getOutputFromJobId);

module.exports = router;
