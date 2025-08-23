const Docker = require("dockerode");
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const BASE_IMAGE = "code-runner-backend";
const MEMORY_LIMIT = 256 * 1024 * 1024;
const CPU_SHARES = 512;
const TIME_LIMIT_MS = 8000;
const MAX_OUTPUT_LENGTH = 512 * 1024;

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

		let stdout = "";
		let stderr = "";
		let codeStatus = "success";

		const logStream = await container.logs({
			stdout: true,
			stderr: true,
			follow: true,
			timestamps: false,
		});
		logStream.on("data", (chunk) => {
			const streamType = chunk[0];
			const payload = chunk.slice(8).toString("utf8");

			if (streamType === 1 && stdout.length < MAX_OUTPUT_LENGTH) {
				stdout += payload;
				if (stdout.length >= MAX_OUTPUT_LENGTH) {
					stdout += "\n...stdout truncated...\n";
					codeStatus = "Max Output Limit Exceeded";
				}
			} else if (streamType === 2 && stderr.length < MAX_OUTPUT_LENGTH) {
				stderr += payload;
				if (stderr.length >= MAX_OUTPUT_LENGTH) {
					stderr += "\n...stderr truncated...\n";
					codeStatus = "Max Error Limit Exceeded";
				}
			}
		});

		const timer = setTimeout(async () => {
			console.log("Time limit exceeded. Killing container.");
			codeStatus = "Time Limit Exceeded";
			try {
				await container.kill();
			} catch {}
		}, TIME_LIMIT_MS);

		const waitResult = await container.wait();
		clearTimeout(timer);

		if (waitResult.StatusCode === 137) {
			codeStatus = "Memory Limit Exceeded";
		}

		await container.remove({ force: true });
		fs.rmSync(tempDir, { recursive: true, force: true });

		return { output: stdout, error: stderr, codeStatus };
	} catch (err) {
		console.log("error runInContainer function", err);
		throw err;
	}
};

module.exports = { runInContainer };
