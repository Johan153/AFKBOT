const express = require("express");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");

// ---------- Web Server ----------
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Web server started"));

// ---------- Reconnect Control ----------
let reconnectDelay = 20000;
const MAX_DELAY = 120000;
let bot = null;

// ---------- Message Pools ----------
const WELCOME_MESSAGES = [
	"Hello 👋",
	"Hi there!",
	"Welcome!",
	"Hey!",
	"Good to see you!"
];

const BYE_MESSAGES = [
	"Bye 👋",
	"See you later!",
	"Goodbye!",
	"Take care!",
	"Catch you later!"
];

// ---------- Helpers ----------
function random(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

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
	let soloChatInterval = null;
	let loginSent = false;

	function otherPlayersOnline() {
		return Object.keys(bot.players).filter(p => p !== bot.username).length > 0;
	}

	function startSoloChat() {
		if (soloChatInterval) return;

		const msgs = config.utils["chat-messages"].messages;
		const delay = config.utils["chat-messages"]["repeat-delay"] * 1000;

		soloChatInterval = setInterval(() => {
			if (!bot.entity) return;
			if (!otherPlayersOnline()) {
				bot.chat(random(msgs));
			}
		}, delay);
	}

	function stopSoloChat() {
		if (soloChatInterval) {
			clearInterval(soloChatInterval);
			soloChatInterval = null;
		}
	}

	// ---------- Spawn ----------
	bot.once("spawn", () => {
		console.log("✅ Bot joined server");
		resetReconnectDelay();

		// Login
		if (config.utils["auto-auth"].enabled) {
			const password = config.utils["auto-auth"].password;
			setTimeout(() => {
				if (!loginSent) {
					bot.chat(`/login ${password}`);
					loginSent = true;
				}
			}, 3000);
		}

		startSoloChat();

		// Move to position
		if (config.position.enabled) {
			const mcData = require("minecraft-data")(bot.version);
			const movements = new Movements(bot, mcData);
			bot.pathfinder.setMovements(movements);
			bot.pathfinder.setGoal(
				new GoalBlock(config.position.x, config.position.y, config.position.z)
			);
		}

		// Anti AFK
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

	// ---------- Player Join ----------
	bot.on("playerJoined", (player) => {
		if (player.username === bot.username) return;

		stopSoloChat();
		setTimeout(() => {
			bot.chat(random(WELCOME_MESSAGES));
		}, 2000);
	});

	// ---------- Player Leave ----------
	bot.on("playerLeft", (player) => {
		if (player.username === bot.username) return;

		setTimeout(() => {
			bot.chat(random(BYE_MESSAGES));
		}, 1000);

		setTimeout(() => {
			if (!otherPlayersOnline()) startSoloChat();
		}, 5000);
	});

	// ---------- Cleanup ----------
	function cleanup() {
		if (antiAfkInterval) clearInterval(antiAfkInterval);
		stopSoloChat();
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
