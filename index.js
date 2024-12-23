#!/usr/bin/env node

const yargs = require("yargs");
const args = [yargs
    .option("course", {
        describe: "The ID of the course being undertaken (ie, SEC522)",
        string: true,
        alias: "c"
    })
    .option("account", {
        describe: "The <username>:<password> to your account (omit to be prompted)",
        string: true,
        alias: "a"
    })
    .option("browser", {
        describe: "The path to the Chromium/Firefox browser executable",
        string: true,
        alias: "b",
    })
    .option("concurrency", {
        describe: "How many concurrent downloads can occur",
        number: true,
        alias: "x",
        default: 3
    })
    .option("flatten", {
        describe: "Whether to flatten the videos to one folder: <output>\\<courseName>",
        boolean: true,
        alias: "f",
        default: false
    })
    .option("headful", {
        describe: "Show the Chromium browser that's making calls (to verify you're a human, for example)",
        boolean: true,
        alias: "H",
        default: false
    })
    .option("output", {
        describe: "The output folder to download the videos to",
        string: true,
        alias: "o",
        default: process.cwd(),
        defaultDescription: "$pwd"
    })
    .option("debug", {
        describe: "Enable debug logging",
        boolean: true,
        alias: "d",
        default: false
    })
    .help("help")
    .alias("help", "h")
    .demandOption(["course"])
    .wrap(yargs.terminalWidth())
    .argv][0]; // wrap in array to collapse in the IDE

// Setup
const {log, nullOrUndefined, cookieSplit, getBrowserExecutable, tryRequire} = require("./util");
log("Setting up requires");
const {write, writeAt, color, moveTo} = require("./util");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const stream = require("stream");
const streamp = require("stream/promises");
const puppeteer = tryRequire("puppeteer", "puppeteer-core");
const prompt = require("inquirer").createPromptModule();

(async () => {
    const plimit = (await import("p-limit")).default;

    // Args
    log("Collecting args");
    const courseID = /\w{3}\d{3}/g.test(args.course) ? args.course : null;
    const output = path.normalize(args.output ?? process.cwd());
    const flatten = args.flatten;
    const concurrency = args.concurrency;
    const headful = args.headful;
    const browserPath = getBrowserExecutable(args.browser);
    const debugging = args.debug ?? false;

    if(courseID === null) throw new Error("Invalid course ID");

    // Final consts
    log("Setting up consts");
    const vidExtension = "mp4";
    const host = `https://ondemand.sans.org/`;
    const videoHost = (modId, vidId) => `https://olt-content.sans.org/${modId}/video/${(vidId + 1 + "").padStart(3, "0")}-720.${vidExtension}`;
    const graphHost = "https://ondemand.sans.org/api/graphql";
    const videoStateEnum = {
        NOT_STARTED: {
            id: 0,
            char: "-",
            color: "brightBlack",
        },
        STARTED: {
            id: 1,
            char: "o",
            color: "blue",
        },
        FINISHED: {
            id: 2,
            char: "^",
            color: "green",
        },
        FAILED: {
            id: 3,
            char: "x",
            color: "red",
        },
        SKIPPING: {
            id: 4,
            char: "-",
            color: "yellow",
        }
    };
    let videoHeaders;
    let graphHeaders;
    let patchedMain = {};
    patchedMain.promise = new Promise((resolve, _reject) => {patchedMain.resolver = resolve;});
    let videoHeadSaved = {};
    videoHeadSaved.promise = new Promise((resolve, _reject) => {videoHeadSaved.resolver = resolve;});
    let graphHeadSaved = {};
    graphHeadSaved.promise = new Promise((resolve, _reject) => {graphHeadSaved.resolver = resolve;});


    // Run
    log("Starting browser");
    const browser = await puppeteer.launch({
        executablePath: getBrowserExecutable(browserPath),
        args: ["--enable-features=NetworkService"],
        headless: headful === true ? false : "new",
        defaultViewport: {height: 1080, width: 1080, isMobile: false},
        slowMo: 25,
        devtools: false,
    });

    // Building page and setting up interceptors
    const page = (await browser.pages())[0];
    page.setDefaultTimeout(120 * 1000);
    page.setCacheEnabled(false);
    const client = await page.target().createCDPSession();
    await client.send("Network.enable");
    await client.send("Network.setBypassServiceWorker", {bypass: true});
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
        if(/main\..{8}.js/g.test(req.url())) {
            if(req.headers().brenny === "hello") {
                req.continue();
                return;
            }

            if(debugging) log(`    << Patching ${req.url().match(/main\..{8}.js/g)} >>`, false);
            let realScript = await page.evaluate(async (url) => (await fetch(url, {headers: {brenny: "hello"}})).text(), req.url());
            let pm = await patchMain(realScript);
            req.respond({
                status: 200,
                body: pm,
                contentType: "text/javascript"
            });
            patchedMain.resolver();
        } else if(req.url().includes(".webm") && req.headers().cookie?.includes("CloudFront")) {
            if(debugging) log("    << Collecting video headers >>", false);
            videoHeaders = req.headers();
            videoHeadSaved.resolver();
        } else if(req.url().includes("/api/graphq") && !!req.headers()["x-access-token"]) {
            if(debugging) log("    << Collecting graph headers >>", false);
            graphHeaders = req.headers();
            graphHeadSaved.resolver();
        }
        if(!req.isInterceptResolutionHandled()) req.continue();
    });


    log(`Going to: ${host}`);
    await page.goto(host, {waitUntil: "networkidle0"});

    if((await page.$("#username")) !== null) {
        log("Detected login page");

        let accountData = args.account?.split(":");
        accountData = [...(accountData ?? []), undefined, undefined].slice(0, 2);
        let account = {
            username: accountData[0] || (await prompt({name: "user", type: "input", message: "Username: "})).user,
            password: accountData[1] || (await prompt({name: "pass", type: "password", message: "Password: "})).pass
        }

        await page.type("#username", account.username);
        await page.type("#password", account.password);
        delete account.username; // don't keep account in cache
        delete account.password; // don't keep account in cache
        delete account; // don't keep account in cache

        log("    Submitting");
        await page.click('[type="submit"]');
        await page.waitForNavigation({waitUntil: "networkidle0"});
    }

    // Wait until dashboard
    log("Arriving at dashboard");
    await page.waitForFrame((frame) => {
        return frame.url() === host;
    });

    // Click to course
    log("Navigating to course");
    await page.click(`::-p-text(${courseID})`);
    await page.waitForSelector("#course_outline");
    await page.waitForSelector("#course_title .ondemand-course-number__text");

    let courseName = ""; // ""
    let sectionNames = []; // [""...]
    let moduleNames = []; // [[""...]...]
    let moduleIds = []; // [[""...]...]
    let cookieMap = []; // [[[{}]...]...]

    log("Getting course name");
    courseName = await page.$eval("#course_title .ondemand-course-number__text", e => e.innerText);
    log(`    ${courseName}`, false);
    if(!flatten) await mkdir(makePath(flatten, output, courseName));
    await patchedMain.promise;

    log("Collecting sections and modules");
    let sections = await page.evaluate(() => {
        return globalThis.sansSections;
    });
    sections.shift(); // removes "Getting Started  With SANS OnDemand"
    for(let s = 0; s < sections.length; s++) {
        sectionNames[s] = sections[s].name;
        moduleNames[s] = sections[s].modules.map(m => m.name)
        moduleIds[s] = sections[s].modules.map(m => m.id);
        cookieMap[s] = new Array(sections[s].modules.length);
    }
    log(`    ${sections.length} / ${sections.map(s => s.modules.length).join("-")}`, false);


    await videoHeadSaved.promise;
    await graphHeadSaved.promise;
    for(let s = 0; s < sectionNames.length; s++) {
        log(`    Section ${s + 1}`);
        await mkdir(makePath(flatten, output, courseName, [s, sectionNames[s]]));

        for(let m = 0; m < moduleNames[s].length; m++) {
            log(`      Module ${m + 1}`);
            await mkdir(makePath(flatten, output, courseName, [s, sectionNames[s]], [m, moduleNames[s][m]]));

            let slides = await graphQuery(graphHost, moduleIds[s][m], graphHeaders, vidExtension);

            cookieMap[s][m] = Object.fromEntries(slides.data.module.cookies.map((e) => [e.key, e.value]));
            let videoNames = slides.data.module.slides.map((s) => s.name);
            let videoStates = new Array(videoNames.length).fill(videoStateEnum.NOT_STARTED);
            let failures = [];
            write("      " + color(videoStateEnum.NOT_STARTED.color) + videoStates.map(() => videoStateEnum.NOT_STARTED.char).join(""));
            moveTo(0);


            const limit = plimit(concurrency);
            let downloads = (videoNames.map(async (name, v) => limit(async () => {
                // Download the video I guess...
                videoStates[v] = videoStateEnum.STARTED;
                writeAt(v + 7, color(videoStates[v].color) + videoStates[v].char); // + 7 because of the spaces
                moveTo(0);
                let dest = buildPath(flatten, [output, courseName, sectionNames, moduleNames[s], videoNames], s, m, v) + `.${vidExtension}`;
                let url = videoHost(moduleIds[s][m], v);

                try {
                    let e = await downloadVideo(url, dest, videoHeaders, cookieMap[s][m]).catch(e => e);
                    if(e instanceof Error) throw e;
                    if(e === "finished") videoStates[v] = videoStateEnum.FINISHED;
                    else if(e === "skipped") videoStates[v] = videoStateEnum.SKIPPING;
                } catch(e) {
                    failures.push([name, e.message, e.stack]);
                    videoStates[v] = videoStateEnum.FAILED;
                }
                writeAt(v + 7, color(videoStates[v].color) + videoStates[v].char); // + 7 because of the spaces
                moveTo(0);
            })));
            await Promise.all(downloads)
            write("\r\n");


            write(color("red"));
            for(let failure of failures) {
                log(`      ${failure[0]}: ${failure[1]}\n${!debugging ? "" : failure[2].split("\n").join("\n      ")}`);
            }
            write(color("green"));
            let success = 0;
            let failed = 0;
            let skipped = 0;
            for(let state of videoStates) {
                if(state === videoStateEnum.FINISHED) success++;
                if(state === videoStateEnum.FAILED) failed++;
                if(state === videoStateEnum.SKIPPING) skipped++;
            }
            log(`      ${success}/${videoStates.length} successfully downloaded` + (skipped > 0 ? `, ${skipped} skipped` : "") + (failed > 0 ? `, ${failed} failed` : ""), false)
            write(color("reset"));
        }
    }

    console.log("Done!");
    await browser.close();
})();

async function downloadVideo(url, dest, headers, cookieMap) {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let cookies = Object.fromEntries(headers.cookie.split("; ").map(c => cookieSplit(c)))
    cookies = Object.assign(cookies, cookieMap);
    cookies = Object.entries(cookies).map(c => c.join("=")).join("; ")
    delete headers["range"];
    headers.cookie = cookies;
    const f = await fetch(url, {
        headers,
        "body": null,
        "method": "GET",
        signal: abortSignal
    });

    if(!f.ok) throw new Error(`fetch returned ${f.status} - ${f.statusText}`);

    try {
        let savedLength = fs.statSync(dest)?.size;
        if(parseInt(f.headers.get("content-length")) == savedLength) {
            abortController.abort();
            return "skipped";
        } else await fsp.unlink(dest);
    } catch(e) {
        if(e.code !== "ENOENT") throw e;
    }

    const fileStream = fs.createWriteStream(dest);
    await streamp.finished(stream.Readable.fromWeb(f.body).pipe(fileStream));
    return "finished";
}
async function graphQuery(url, modId, headers, vidExtension) {
    const f = await fetch(url, {
        headers,
        body: `{"operationName":"ModuleQuery","variables":{"moduleId":"${modId}","quality":"HD","mp4":${vidExtension === "mp4"}},"query":"query ModuleQuery($moduleId: String!, $quality: String!, $mp4: Boolean!) { module(moduleId: $moduleId) { id baseUrl cookies { key value } slides { name id videoPath(quality: $quality, mp4: $mp4) } } } "}`,
        method: "POST"
    });

    if(!f.ok) throw new Error(`fetch returned ${f.status} - ${f.statusText}`);

    return await f.json();
}
async function patchMain(scriptData) {
    const regexes = {
        modules: /var (\w+?)\s*=\s*\w+?\(\),((?!var).)*?\1\.module,((?!var).)*?"No module selected\.".*?;/gs,
        sections: /((\w+\.sections)\);)(((?!sections).)*"course_outline")/gs,
    };
    const replaces = {
        modules: (match, e) => `${match};globalThis.sansModules = globalThis.sansModules ?? {}; globalThis.sansModules[${e}.id] = ${e};`,
        sections: (_match, pre, e, post) => `${pre};globalThis.sansSections=${e};${post}`,
    };

    scriptData = scriptData.replace(regexes.modules, replaces.modules);
    scriptData = scriptData.replace(regexes.sections, replaces.sections);

    return scriptData;
}

async function mkdir(dir, options = {recursive: true}) {
    try {
        await fsp.mkdir(dir, options);
    } catch(e) {
        if(e.code !== "EEXIST") throw e;
    }
}
/** @type {Map<{secId, modId, vidId}, String>} */
const pathMems = new Map();
const illegalPathChars = /[\\/<>:"|?*\x00-\x1F]/gi;
function makePath(flatten, output, courseName, [secId, section] = [null, null], [modId, module] = [null, null], [vidId, video] = [null, null]) {
    const pathMemKey = {secId, modId, vidId};
    if(pathMems.has(pathMemKey)) return pathMems.get(pathMemKey);

    let p = output;
    if(section) section = section.replace(illegalPathChars, "");
    if(module) module = module.replace(illegalPathChars, "");
    if(video) video = video.replaceAll(":", "-").replace(illegalPathChars, "");

    // We have to pyramid, so we don't accidentally null something and then make a weird dir structure
    if(courseName ?? false) {
        p = path.join(p, courseName);

        if(!nullOrUndefined(secId) && !nullOrUndefined(section)) {
            secId++; // we ++ here because we're passing in raw values from the code!
            if(flatten) p = path.normalize(`${p} - ${secId}`);
            else p = path.join(p, `${secId}. ${section}`);

            if(!nullOrUndefined(modId) && !nullOrUndefined(module)) {
                modId++;
                if(flatten) p = path.normalize(`${p} - ${modId}`);
                else p = path.join(p, `${modId}. ${module}`);

                if(!nullOrUndefined(vidId) && !nullOrUndefined(video)) {
                    vidId++;
                    if(flatten) p = path.normalize(`${p} - ${vidId} - ${video}`);
                    else p = path.join(p, `${vidId}. ${video}`);
                }
            }
        }
    }

    pathMems.set(pathMemKey, p);
    return p;
}

function buildPath(flatten, [output, courseName, secNames, modNames, vidNames], secId, modId, vidId) {
    return makePath(flatten, output, courseName, [secId, secNames?.[secId]], [modId, modNames?.[modId]], [vidId, vidNames?.[vidId]]);
}
