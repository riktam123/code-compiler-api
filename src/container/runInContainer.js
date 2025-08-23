const Docker = require("dockerode");
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");


const BASE_IMAGE = "code-runner-backend";
const MEMORY_LIMIT = 512 * 1024 * 1024;
const CPU_SHARES = 512;
const TIME_LIMIT_MS = 15000;
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

		console.log("✅ Job completed:", output);
		return output;
	} catch (err) {
		console.log("error to create container", err);
		throw err;
	}
};

module.exports = { runInContainer };
