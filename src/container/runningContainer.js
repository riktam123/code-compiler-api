const Docker = require("dockerode");
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

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
		const fileName = `Program.${ext}`;

		fs.writeFileSync(path.join(tempDir, fileName), code);
		fs.writeFileSync(path.join(tempDir, "input.txt"), input || "");

		const limits = {
			default: { memory: 256 * 1024 * 1024, cpu: 500000000, time: 8000, output: 128 * 1024 }, // 256MB, 0.5 CPU, 5s, 128KB
			java: { memory: 512 * 1024 * 1024, cpu: 1000000000, time: 8000, output: 128 * 1024 }, // 512MB, 1 CPU, 8s
			csharp: { memory: 512 * 1024 * 1024, cpu: 1000000000, time: 8000, output: 128 * 1024 },
			kotlin: { memory: 512 * 1024 * 1024, cpu: 1000000000, time: 8000, output: 128 * 1024 },
			rust: { memory: 512 * 1024 * 1024, cpu: 1000000000, time: 8000, output: 128 * 1024 },
			typescript: { memory: 256 * 1024 * 1024, cpu: 500000000, time: 20000, output: 128 * 1024 },
		};

		const langKey = language.toLowerCase();
		const { memory, cpu, time, output } = limits[langKey] || limits.default;

		const baseImage = process.env.BASE_IMAGE;

		const container = await docker.createContainer({
			Image: baseImage,
			Cmd: ["/run-code.sh", `/code/${fileName}`, `/code/input.txt`],
			HostConfig: {
				Binds: [`${tempDir}:/code:rw`],
				Memory: memory,
				NanoCPUs: cpu,
				NetworkMode: "none",
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
			const payload = chunk.toString("utf8");

			if (streamType === 1 && stdout.length < output) {
				stdout += payload;
				if (stdout.length >= output) {
					stdout += "\n...stdout truncated...\n";
					codeStatus = "Max Output Limit Exceeded";
				}
			} else if (streamType === 2 && stderr.length < output) {
				stderr += payload;
				if (stderr.length >= output) {
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
		}, time);

		const waitResult = await container.wait();
		clearTimeout(timer);

		if (waitResult.StatusCode === 137 && codeStatus === "success") {
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
