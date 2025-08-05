const PageRuler = {
	init(type, previousVersion) {
		console.log("init");
		const manifest = chrome.runtime.getManifest();
		console.log({ manifest });
		const { version } = manifest;
		switch (type) {
		case "install":
			console.log("First time install version: ", version);
			chrome.storage.sync.set({
				statistics: false,
				hide_update_tab: false,
			});
			break;

		case "update":
			console.log("Update version. From: ", previousVersion, " To: ", version);
			break;

		default:
			console.log("Existing version run: ", version);
			break;
		}
	},
	image(file) {
		return {
			19: `images/19/${file}`,
			38: `images/38/${file}`,
		};
	},
	load(tabId) {
		console.log("loading content script");
		try {
			const executeScript = chrome.scripting.executeScript({
				target: {
					tabId,
					allFrames: true,
				},
				files: ["content.js"],
			});
			executeScript.then(() => {
				console.log(`content script for tab #${tabId} has loaded`);
				PageRuler.enable(tabId);
			});
		} catch (err) {
			console.error(`failed to execute script: ${err}`);
		}
		// chrome.tabs.executeScript(tabId, {
		// 	file: "content.js",
		// }, () => {
		// 	console.log(`content script for tab #${tabId} has loaded`);
		// 	PageRuler.enable(tabId);
		// });
	},
	enable(tabId) {
		chrome.tabs.sendMessage(tabId, {
			type: "enable",
		}, success => {
			console.log(`enable message for tab #${tabId} was sent`);
			chrome.action.setIcon({
				path: PageRuler.image("browser_action_on.png"),
				tabId,
			});
		});
	},
	disable(tabId) {
		chrome.tabs.sendMessage(tabId, {
			type: "disable",
		}, success => {
			console.log(`disable message for tab #${tabId} was sent`);
			chrome.action.setIcon({
				path: PageRuler.image("browser_action.png"),
				tabId,
			});
		});
	},
	openUpdateTab(type) {
		chrome.storage.sync.get("hide_update_tab", items => {
			if (!items.hide_update_tab) {
				chrome.tabs.create({
					url: `update.html#${type}`,
				});
			}
		});
	},
	setPopup(tabId, changeInfo, tab) {
		const url = changeInfo.url || tab.url || false;
		if (url) {
			if (/^chrome\-extension:\/\//.test(url) || /^chrome:\/\//.test(url)) {
				chrome.action.setPopup({
					tabId,
					popup: "popup.html#local",
				});
			}
			if (/^https:\/\/chrome\.google\.com\/webstore\//.test(url)) {
				chrome.action.setPopup({
					tabId,
					popup: "popup.html#webstore",
				});
			}
		}
	},
	greyscaleConvert(imgData) {
		const grey = new Int16Array(imgData.length / 4);
		for (let i = 0, n = 0; i < imgData.length; i += 4, n++) {
			const r = imgData[i];
			const g = imgData[i + 1];
			const
				b = imgData[i + 2];
			grey[n] = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
		}
		return grey;
	},
};

// chrome.action.onClicked.addListener(PageRuler.browserAction);
const executeOnInit = () => {
	document.body.style.border = "10px solid green";
	const screenshot = new Image();
	const canvas = document.createElement("canvas");

	chrome.runtime.sendMessage({
		action: "loadtest",
		loaded: window.hasOwnProperty("__PageRuler"),
		active: window.hasOwnProperty("__PageRuler") && window.__PageRuler.active,
	});
};
chrome.action.onClicked.addListener(async tab => {
	// console.log({tab})
	try {
		await chrome.scripting.executeScript({
			target: {
				tabId: tab.id,
			},
			function: executeOnInit,
		});
	} catch (err) {
		console.error(`failed to execute script: ${err}`);
	}
});

chrome.tabs.onUpdated.addListener(PageRuler.setPopup);

chrome.runtime.onStartup.addListener(() => {
	console.log("onStartup");
	PageRuler.init();
});

chrome.runtime.onInstalled.addListener(details => {
	console.log("onInstalled");
	PageRuler.init(details.reason, details.previousVersion);
	switch (details.reason) {
	case "install":
		PageRuler.openUpdateTab("install");
		break;

	case "update":
		PageRuler.openUpdateTab("update");
		break;
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const tabId = sender.tab && sender.tab.id;
	const messageObj = message || {};
	// console.group(`message received from tab #${tabId}`);
	// console.log("message: ", message);
	// console.log("message.action: ", messageObj.action);
	// console.log("sender: ", sender);
	switch (messageObj.action) {
	case "borderSearch":
		chrome.tabs.captureVisibleTab({ format: "png" }, dataUrl => {
			chrome.tabs.sendMessage(tabId, {
				type: "processScreenshot",
				dataUrl,
				message,
			}, response => {
				sendResponse(response);
				if (chrome.runtime.lastError) {
					console.error("Error sending message to content script:", chrome.runtime.lastError);
				} else {
					console.log("Got response from content script:", response);
				}
			});
		});
		break;

	case "loadtest":
		if (!messageObj.loaded) {
			PageRuler.load(tabId);
		} else if (messageObj.active) {
			PageRuler.disable(tabId);
		} else {
			PageRuler.enable(tabId);
		}
		break;

	case "disable":
		console.log("tear down");
		if (tabId) {
			PageRuler.disable(tabId);
		}
		break;

	case "setColor":
		console.log(`saving color ${message.color}`);
		chrome.storage.sync.set({
			color: message.color,
		});
		break;

	case "getColor":
		console.log("requesting color");
		chrome.storage.sync.get("color", items => {
			const color = items.color || "#5b5bdc";
			console.log(`color requested: ${color}`);
			sendResponse(color);
		});
		break;

	case "setDockPosition":
		console.log(`saving dock position ${message.position}`);
		chrome.storage.sync.set({
			dock: message.position,
		});
		break;

	case "getDockPosition":
		console.log("requesting dock position");
		chrome.storage.sync.get("dock", items => {
			const position = items.dock || "top";
			console.log(`dock position requested: ${position}`);
			sendResponse(position);
		});
		break;

	case "setGuides":
		console.log(`saving guides visiblity ${message.visible}`);
		chrome.storage.sync.set({
			guides: message.visible,
		});
		break;

	case "getGuides":
		console.log("requesting guides visibility");
		chrome.storage.sync.get("guides", items => {
			const visiblity = items.hasOwnProperty("guides") ? items.guides : true;
			console.log(`guides visibility requested: ${visiblity}`);
			sendResponse(visiblity);
		});
		break;

	case "setBorderSearch":
		chrome.storage.sync.set({
			borderSearch: message.visible,
		});
		break;

	case "getBorderSearch":
		chrome.storage.sync.get("borderSearch", items => {
			const visiblity = items.hasOwnProperty("borderSearch") ? items.borderSearch : false;
			sendResponse(visiblity);
		});
		break;

	case "openHelp":
		chrome.tabs.create({
			url: `${chrome.runtime.getURL("update.html")}#help`,
		});
		break;

	default:
		break;
	}
	console.groupEnd();
	return true;
});

chrome.commands.onCommand.addListener(command => {
	console.log("Command:", command);
});
