const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null,
	retryStrategy: (times) => Math.min(times * 200, 3000),
	reconnectOnError: (err) => {
		console.error(`Redis Reconnect Error: ${err.message}`);
		return true;
	},
});

redis.on("connect", () => {
	console.log("Redis connected successfully");
});

redis.on("error", (err) => {
	console.error(`Redis Error: ${err.message}`);
});

module.exports = { redis };
