EXTENSION_NAME := gh-friends-stars
DIST_DIR := dist
CHROME_DIR := $(DIST_DIR)/chrome
FIREFOX_DIR := $(DIST_DIR)/firefox
SOURCE_FILES := background.js content.js options.html options.js README.md

.PHONY: all verify chrome firefox clean

all: chrome firefox

verify:
	node --check content.js
	node --check options.js

chrome: verify
	rm -rf "$(CHROME_DIR)"
	mkdir -p "$(CHROME_DIR)"
	cp $(SOURCE_FILES) "$(CHROME_DIR)/"
	node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync("manifest.json", "utf8")); m.background = { service_worker: "background.js" }; fs.writeFileSync("$(CHROME_DIR)/manifest.json", JSON.stringify(m, null, 2) + "\n");'
	cd "$(CHROME_DIR)" && zip -qr "../$(EXTENSION_NAME)-chrome.zip" .

firefox: verify
	rm -rf "$(FIREFOX_DIR)"
	mkdir -p "$(FIREFOX_DIR)"
	cp $(SOURCE_FILES) manifest.json "$(FIREFOX_DIR)/"
	cd "$(FIREFOX_DIR)" && zip -qr "../$(EXTENSION_NAME)-firefox.zip" .

clean:
	rm -rf "$(DIST_DIR)"
