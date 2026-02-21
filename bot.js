const express = require("express");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");

// ---------- Web Server (Render keep-alive) ---------
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Web server started"));

// ---------- Reconnect Control ----------
let reconnectDelay = 20000; // start 20s (important for Aternos)
const MAX_DELAY = 120000;   // max 2 minutes
let bot = null;

// ---------- Helpers ----------
function scheduleReconnect(reason = "unknown") {
	console.log(`⚠️ Disconnected → ${reason}`);
	console.log(`⏱ Reconnecting in ${reconnectDelay / 1000}s...`);

	setTimeout(() => {
		reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY);
		createBot();
	}, reconnectDelay);
}

function resetReconnectDelay() {
	reconnectDelay = 20000;
}

// ---------- Create Bot ----------
function createBot() {
	if (bot) {
		try { bot.removeAllListeners(); bot.quit(); } catch {}
	}

	bot = mineflayer.createBot({
		username: config["bot-account"].username,
		password: config["bot-account"].password,
		auth: config["bot-account"].type,
		host: config.server.ip,
		port: config.server.port,
		version: config.server.version
	});

	bot.loadPlugin(pathfinder);

	let antiAfkInterval = null;
	let chatInterval = null;
	let loginSent = false;

	// ---------- Spawn ----------
	bot.once("spawn", () => {
		console.log("✅ Bot joined server");
		resetReconnectDelay();

		// ---------- Auto Login ONLY ----------
		if (config.utils["auto-auth"].enabled) {
			const password = config.utils["auto-auth"].password;

			setTimeout(() => {
				if (!loginSent) {
					bot.chat(`/login ${password}`);
					loginSent = true;
					console.log("🔐 Login sent");
				}
			}, 3000);
		}

		// ---------- Chat Messages ----------
		if (config.utils["chat-messages"].enabled) {
			const msgs = config.utils["chat-messages"].messages;
			const delay = config.utils["chat-messages"]["repeat-delay"] * 1000;

			if (config.utils["chat-messages"].repeat) {
				chatInterval = setInterval(() => {
					if (!bot.entity) return;
					const msg = msgs[Math.floor(Math.random() * msgs.length)];
					bot.chat(msg);
				}, delay);
			} else {
				msgs.forEach(m => bot.chat(m));
			}
		}

		// ---------- Move to Position ----------
		if (config.position.enabled) {
			const mcData = require("minecraft-data")(bot.version);
			const movements = new Movements(bot, mcData);
			bot.pathfinder.setMovements(movements);
			bot.pathfinder.setGoal(
				new GoalBlock(config.position.x, config.position.y, config.position.z)
			);
		}

		// ---------- Anti-AFK ----------
		if (config.utils["anti-afk"].enabled) {
			antiAfkInterval = setInterval(() => {
				if (!bot.entity) return;

				const yaw = Math.random() * Math.PI * 2;
				const pitch = (Math.random() - 0.5) * 0.5;
				bot.look(yaw, pitch);

				bot.setControlState("jump", true);
				setTimeout(() => bot.setControlState("jump", false), 400);

				if (config.utils["anti-afk"].sneak) {
					bot.setControlState("sneak", true);
					setTimeout(() => bot.setControlState("sneak", false), 800);
				}
			}, 30000);
		}
	});

	// ---------- Cleanup ----------
	function cleanup() {
		if (antiAfkInterval) clearInterval(antiAfkInterval);
		if (chatInterval) clearInterval(chatInterval);
	}

	// ---------- Disconnect Handling ----------
	bot.on("end", (reason) => {
		cleanup();
		scheduleReconnect(reason);
	});

	bot.on("kicked", (reason) => {
		cleanup();
		console.log(`❌ Kicked: ${reason}`);

		const msg = reason.toString().toLowerCase();

		if (msg.includes("already online") || msg.includes("loginsecurity")) {
			reconnectDelay = Math.max(reconnectDelay, 30000);
		}

		if (msg.includes("throttled")) {
			reconnectDelay = Math.max(reconnectDelay, 60000);
		}

		scheduleReconnect(reason);
	});

	bot.on("error", (err) => {
		console.log(`❌ Error: ${err.message}`);
	});

	bot.on("message", (msg) => {
		console.log(`[Server] ${msg.toString()}`);
	});
}

// ---------- Crash Protection ----------
process.on("uncaughtException", (err) => {
	console.log("⚠️ Uncaught Exception:", err.message);
	scheduleReconnect("uncaughtException");
});

process.on("unhandledRejection", (err) => {
	console.log("⚠️ Unhandled Rejection:", err);
	scheduleReconnect("unhandledRejection");
});

// ---------- Start ----------
createBot();
