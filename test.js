const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const Docker = require("dockerode");
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

docker.info((err, info) => {
	if (err) console.error("Error connecting to Docker:", err);
	else console.log("Docker connected successfully");
});

require("dotenv").config();
const app = express();
const { redis } = require("./config/redis");

app.use(cors());
app.use(bodyParser.json());

const BASE_IMAGE = "code-runner-backend";
const MAX_CONCURRENT_CONTAINERS = 10;
const MEMORY_LIMIT = 512 * 1024 * 1024;
const CPU_SHARES = 512;
const TIME_LIMIT_MS = 15000;
const MAX_OUTPUT_LENGTH = 512 * 1024;

let runningContainers = 0;

// ------------------ Redis Queue ------------------
const enqueue = async (job) => {
	await redis.lpush("codeQueue", JSON.stringify(job));
	console.log("✅ Job added to queue:", job.jobId);
};

const dequeueAndRun = async () => {
	if (runningContainers >= MAX_CONCURRENT_CONTAINERS) return;

	const jobData = await redis.rpop("codeQueue");
	if (!jobData) return;

	const job = JSON.parse(jobData);
	runningContainers++;

	try {
		const output = await runInContainer(job);
		await redis.set(`result:${job.jobId}`, JSON.stringify({ status: "done", output }), "EX", 300);
	} catch (err) {
		console.log("error to create container", err);
		await redis.set(
			`result:${job.jobId}`,
			JSON.stringify({ status: "error", error: err.message }),
			"EX",
			300
		);
	} finally {
		runningContainers--;
		dequeueAndRun();
	}
};

// ------------------ Docker Execution ------------------
const runInContainer = async ({ code, language, input }) => {
	try {
		const tempDir = path.join(__dirname, "run", uuidv4());
		fs.mkdirSync(tempDir, { recursive: true });

		const extensionMap = {
			javascript: "js",
			python: "py",
			"c++": "cpp",
			c: "c",
			java: "java",
			go: "go",
			ruby: "rb",
			php: "php",
			rust: "rs",
			kotlin: "kt",
			csharp: "cs",
			typescript: "ts",
		};

		const ext = extensionMap[language.toLowerCase()] || "txt";
		const fileName = language.toLowerCase() === "csharp" ? "Program.cs" : `Program.${ext}`;

		// Write code and input files
		fs.writeFileSync(path.join(tempDir, fileName), code);
		fs.writeFileSync(path.join(tempDir, "input.txt"), input || "");

		const container = await docker.createContainer({
			Image: BASE_IMAGE,
			Cmd: ["/run-code.sh", `/code/${fileName}`, `/code/input.txt`],
			HostConfig: {
				Binds: [`${tempDir}:/code:rw`],
				Memory: MEMORY_LIMIT,
				CpuShares: CPU_SHARES,
				NetworkMode: "none",
				Ulimits: [{ Name: "nofile", Soft: 1024, Hard: 2048 }],
			},
		});

		await container.start();

		let output = "";
		const logStream = await container.logs({ stdout: true, stderr: true, follow: true });
		logStream.on("data", (chunk) => {
			if (output.length < MAX_OUTPUT_LENGTH) {
				output += chunk.toString();
				if (output.length >= MAX_OUTPUT_LENGTH) output += "\n...output truncated...\n";
			}
		});

		const timer = setTimeout(async () => {
			console.log("⏰ Time limit exceeded. Killing container.");
			try {
				await container.kill();
			} catch {}
		}, TIME_LIMIT_MS);

		await new Promise((resolve) => {
			logStream.on("end", resolve);
			container.wait().then(resolve);
		});

		clearTimeout(timer);

		await container.remove({ force: true });
		fs.rmSync(tempDir, { recursive: true, force: true });

		console.log("✅ Job completed:", output.substring(0, 100));
		return output;
	} catch (err) {
		console.log("error to create container", err);
		throw err;
	}
};

app.post("/run", async (req, res) => {
	try {
		const { code, language, input } = req.body;
		if (!code || !language) return res.status(400).json({ error: "Code and language required" });

		const jobId = uuidv4();
		await enqueue({ jobId, code, language, input });
		dequeueAndRun();

		res.json({ jobId });
	} catch (err) {
		console.error("Error in /run:", err);
		res.status(500).json({ error: err.message });
	}
});

app.get("/result/:jobId", async (req, res) => {
	const { jobId } = req.params;
	const result = await redis.get(`result:${jobId}`);
	if (!result) return res.json({ status: "pending" });
	res.json(JSON.parse(result));
});

app.listen(5100, () => console.log("Server running on port 5100"));
