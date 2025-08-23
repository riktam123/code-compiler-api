const { v4: uuidv4 } = require("uuid");
const { redis } = require("../config/redis");
const { enqueue, dequeueAndRun } = require("../queue/codeWorker");

const runCode = async (req, res) => {
	try {
		const { code, language, input } = req.body;
		if (!code || !language) return res.status(400).json({ error: "Code and language required" });

		const jobId = uuidv4();
		await enqueue({ jobId, code, language, input });
		dequeueAndRun();
		res.json({ jobId, status: "pending", message: "Job added to queue" });
	} catch (err) {
		console.error("Error in /run:", err);
		res.status(500).json({ error: err.message });
	}
};

const getOutputFromJobId = async (req, res) => {
	try {
		const { jobId } = req.query;
		const result = await redis.get(`result:${jobId}`);
		if (!result) return res.status(200).json({ status: "pending" });
		res.status(200).json(JSON.parse(result));
	} catch (e) {
		console.log("error", e);
		res.status(500).json({ error: e.message });
	}
};
module.exports = {
	runCode,
	getOutputFromJobId,
};
