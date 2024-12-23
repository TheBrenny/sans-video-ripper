const fs = require("fs");
const pj = require("path").join;

const colors = {
    "black": 30,
    "red": 31,
    "green": 32,
    "yellow": 33,
    "blue": 34,
    "magenta": 35,
    "cyan": 36,
    "white": 37,
    "default": 39,
    "reset": 0,
    "brightBlack": 90,
    "brightRed": 91,
    "brightGreen": 92,
    "brightYellow": 93,
    "brightBlue": 94,
    "brightMagenta": 95,
    "brightCyan": 96,
    "brightWhite": 97,
}
/** @param {keyof colors} color */
function color(color) {
    return `\x1b[${colors[color]}m`
}

function nullOrUndefined(v) {
    return v === null || v === undefined;
}

function cookieSplit(cookie) {
    return [cookie.substring(0, cookie.indexOf("=")), cookie.substring(cookie.indexOf("=") + 1)];
}
function tryRequire(...packages) {
    for(let package of packages) {
        let p;
        try {
            p = require(package);
        } catch(e) {
            if(e.code == "MODULE_NOT_FOUND") continue;
            else throw e;
        }
        return p;
    }
}

// Functions so we can use process.env across all systems but ONLY when we need to (we don't want to `path.join(undefined, "blah")` )
/** @type {Object<"win32"|"darwin"|"linux", Function<Array<String>>> } */
const browserLocs = {
    win32: () => [
        // Chrome
        pj(process.env["ProgramFiles"], "Google", "Chrome", "Application", "chrome.exe"),
        pj(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
        pj(process.env["LocalAppData"], "Google", "Chrome", "Application", "chrome.exe"),
        pj(process.env["ProgramFiles(x86)"], "Google", "Application", "chrome.exe"),
        // Edge
        pj(process.env["SystemRoot"], "SystemApps", "Microsoft.MicrosoftEdge_8wekyb3d8bbwe", "MicrosoftEdge.exe"),
        pj(process.env["ProgramFiles"], "Microsoft", "Edge", "Application", "msedge.exe"),
        pj(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
        pj(process.env["LocalAppData"], "Microsoft", "Edge", "Application", "msedge.exe"),
        pj(process.env["LocalAppData"], "MicrosoftEdge", "Application", "msedge.exe"),
        // Firefox
        pj(process.env["ProgramFiles"], "Mozilla Firefox", "firefox.exe"),
        pj(process.env["ProgramFiles(x86)"], "Mozilla Firefox", "firefox.exe"),
        pj(process.env["LocalAppData"], "Mozilla Firefox", "firefox.exe"),
    ],
    darwin: () => [
        // Chrome
        pj("Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
        // Edge
        pj("Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
        // Firefox
        pj("Applications", "Firefox.app", "Contents", "MacOS", "firefox"),
        pj("Applications", "Firefox.app", "Contents", "MacOS", "firefox-bin"),
    ],
    linux: () => [
        // Chrome
        pj("snap", "bin", "chromium"),
        pj("usr", "bin", "chromium"),
        pj("usr", "share", "applications", "chromium"),
        pj("usr", "bin", "google-chrome-stable"),
        pj("usr", "share", "applications", "google-chrome-stable"),
        pj("usr", "bin", "google-chrome"),
        pj("usr", "share", "applications", "google-chrome"),
        pj("opt", "google", "chrome", "google-chrome"),
        // Edge
        pj("snap", "bin", "msedge"),
        pj("usr", "bin", "msedge"),
        pj("usr", "share", "applications", "msedge"),
        pj("usr", "bin", "microsoft-edge-stable"),
        pj("usr", "share", "applications", "microsoft-edge-stable"),
        pj("usr", "bin", "microsoft-edge"),
        pj("usr", "share", "applications", "microsoft-edge"),
        pj("opt", "microsoft", "edge", "microsoft-edge"),
        // Firefox
        pj("snap", "bin", "firefox"),
        pj("usr", "lib", "firefox", "firefox"),
        pj("usr", "bin", "firefox"),
        pj("usr", "share", "applications", "firefox"),
        pj("opt", "firefox", "firefox"),
    ],
}

function getBrowserExecutable(path) {
    if(fs.existsSync(path)) return path;

    let paths = browserLocs[process.platform]?.() ?? browserLocs.linux();
    for(let p of paths) if(fs.existsSync(p)) return p;

    throw new Error("No Chromium/Firefox executable was found. Please specify using the --browser argument.");
}


module.exports = {
    log: (s, ellipsis = true) => console.log(`${s}${ellipsis ? "..." : ""}`),
    color,
    write: (value) => process.stdout.write(value),
    writeAt: (x, value) => process.stdout.write(`\x1b[${x}G${value}`),
    moveTo: (x) => process.stdout.write(`\x1b[${x}G`),
    nullOrUndefined,
    cookieSplit,
    tryRequire,
    getBrowserExecutable,
}