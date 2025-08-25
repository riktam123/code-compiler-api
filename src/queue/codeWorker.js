const { redis } = require("../config/redis");
const { runInContainer } = require("../container/runningContainer");
const os = require("os");

let MAX_CONCURRENT_CONTAINERS = 2;
let runningContainers = 0;

const enqueue = async (job) => {
	await redis.lpush("codeQueue", JSON.stringify(job));
	console.log("Job added to queue:", job.jobId);
};

const dequeueAndRun = async () => {
	if (runningContainers >= MAX_CONCURRENT_CONTAINERS) return;

	const jobData = await redis.rpop("codeQueue");
	if (!jobData) return;

	const job = JSON.parse(jobData);
	runningContainers++;

	try {
		const data = await runInContainer(job);
		console.log("After running container, the output is :", data);
		const jsonObj = JSON.stringify({ status: "completed", ...data });
		await redis.set(`result:${job.jobId}`, jsonObj, "EX", 300);
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

(() => {
	const totalCPUs = os.cpus().length;
	const loadAvg = os.loadavg()[0]; 

	console.log("Total CPUs:", totalCPUs);
	console.log("1-min Load Avg:", loadAvg);
	console.log("Approx Free CPUs:", Math.max(totalCPUs - loadAvg, 0));

	const totalMemMB = os.totalmem() / 1024 / 1024;
	const freeMemMB = os.freemem() / 1024 / 1024;
	const usedMemMB = totalMemMB - freeMemMB;

	console.log("Total Memory (MB):", totalMemMB);
	console.log("Free Memory (MB):", freeMemMB);
	console.log("Used Memory (MB):", usedMemMB);
})();

module.exports = { enqueue, dequeueAndRun };
