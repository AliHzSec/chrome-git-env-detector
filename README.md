# Git & ENV Detector

Chrome extension for detecting exposed `.git/config` and `.env` files during authorized security testing.

## Features

- Automatic detection of `.git/config` and `.env` exposures
- Real-time notifications when files are found
- Smart caching (checks each domain once per session)
- Clean dark UI with detailed results
- Toggle checks on/off individually

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AliHzSec/chrome-git-env-detector.git
```

2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → Select extension folder

## Usage

1. Click extension icon to open popup
2. Ensure main toggle is ON
3. Visit authorized target websites
4. Get notified when exposures are detected
5. View/manage findings in popup

## Configuration

- **Main Toggle**: Enable/disable extension
- **`.git` Check**: Scan for Git config files
- **`.env` Check**: Scan for ENV files

---

⭐ If you find this project useful, consider starring the repository.
