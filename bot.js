const express = require("express");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");

// ---------- Keep Replit alive ----------
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Web server started"));

// ---------- Create Bot ----------
function createBot() {
	const bot = mineflayer.createBot({
		username: config["bot-account"].username,
		password: config["bot-account"].password,
		auth: config["bot-account"].type,
		host: config.server.ip,
		port: config.server.port,
		version: config.server.version
	});

	bot.loadPlugin(pathfinder);

	bot.once("spawn", () => {
		console.log("✅ Bot joined server");

		// ---------- Auto-Auth ----------
		if (config.utils["auto-auth"].enabled) {
			const password = config.utils["auto-auth"].password;
			setTimeout(() => {
				bot.chat(`/register ${password} ${password}`);
				bot.chat(`/login ${password}`);
			}, 500);
		}

		// ---------- Chat Messages ----------
		if (config.utils["chat-messages"].enabled) {
			const msgs = config.utils["chat-messages"].messages;
			const delay = config.utils["chat-messages"]["repeat-delay"] * 1000;

			if (config.utils["chat-messages"].repeat) {
				setInterval(() => {
					const msg = msgs[Math.floor(Math.random() * msgs.length)];
					if (bot.entity) bot.chat(msg);
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
			setInterval(() => {
				if (!bot.entity) return;

				const yaw = Math.random() * Math.PI * 2;
				const pitch = (Math.random() - 0.5) * 0.5;
				bot.look(yaw, pitch);

				bot.setControlState("jump", true);
				setTimeout(() => bot.setControlState("jump", false), 500);

				if (config.utils["anti-afk"].sneak) {
					bot.setControlState("sneak", true);
					setTimeout(() => bot.setControlState("sneak", false), 1000);
				}
			}, 30000);
		}
	});

	// ---------- Handle Disconnects ----------
	bot.on("end", (reason) => {
		console.log(`⚠️ Bot disconnected: ${reason || "Unknown reason"}`);
		if (config.utils["auto-reconnect"]) {
			const delay = config.utils["auto-reconnect-delay"] || 5000;
			console.log(`⏱ Reconnecting in ${delay}ms...`);
			setTimeout(createBot, delay);
		}
	});

	bot.on("kicked", (reason) => {
		console.log(`❌ Kicked: ${reason}`);
		// If LoginSecurity or already online, retry quickly
		if (reason.includes("already online") || reason.includes("LoginSecurity")) {
			console.log("⚡ Retry connecting in 3s due to LoginSecurity");
			setTimeout(createBot, 3000);
		}
	});

	bot.on("error", (err) => {
		console.log(`❌ Error: ${err.message}`);
	});

	// Optional: log messages from the server
	bot.on("message", (msg) => {
		console.log(`[Server] ${msg.toString()}`);
	});
}

// ---------- Crash Protection ----------
process.on("uncaughtException", (err) => {
	console.log("⚠️ Uncaught Exception:", err.message);
	createBot();
});
process.on("unhandledRejection", (err) => {
	console.log("⚠️ Unhandled Rejection:", err);
	createBot();
});

// ---------- Start Bot ----------
createBot();