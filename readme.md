# sans-video-ripper
> Rips all the videos from a SANS course and places them in a folder of your choice!


## Quick Install
❗❗❗
```bash
# Got Chrome, Edge, or Firefox?
npm install --omit optional git+https://github.com/TheBrenny/sans-video-ripper.git

# Need a Chrome?
npm install git+https://github.com/TheBrenny/sans-video-ripper.git
```
❗❗❗

```commandline
$ sans-video-ripper --help
Options:
      --version      Show version number                                                                       [boolean]
  -c, --course       The course ID found in the URL                                                  [number] [required]
  -a, --account      The <username>:<password> to your account (omit to be prompted)                            [string]
  -b, --browser      The path to the Chromium/Firefox browser executable                                        [string]
  -x, --concurrency  How many concurrent downloads can occur                                       [number] [default: 3]
  -f, --flatten      Whether to flatten the videos to one folder: <output>\<courseName>       [boolean] [default: false]
  -H, --headful      Show the Chromium browser that's making calls (to verify you're a human, for example)
                                                                                              [boolean] [default: false]
  -o, --output       The output folder to download the videos to                                [string] [default: $pwd]
  -h, --help         Show help                                                                                 [boolean]
```

## Whoa? What the heck is this?

SANS' offline audio is really bad; it's a recording of a live classroom, and because it's only audio, when he says things like "typing this command generates these results", you're often stuck wondering "wtf does he mean?".

Also, there's no opportunity to save the videos to watch them while offline - this makes actually learning while on the move really frustrating.

Furthermore, I'm a believer in Sleep Learning (by listening to things on repeat while asleep). This lead me to making this so I could download the videos and play them on a loop while sleeping.

*Also, fair warning: this WILL probably break when the `main.js` file from SANS gets updated.*

## Installing

This package uses `puppeteer-core` under the hood. The choice for `puppeteer-core` was to make this a bit more lightweight, [because ~~everyone~~ 71.65% of people have Chrome, Edge, or Firefox](https://gs.statcounter.com/browser-market-share).

Because of this, the preferred way of installing is by ommitting the optional dependencies (being only `puppeteer`).

Otherwise, if you don't have a Chromium or Firefox browser or don't care for the download, feel free to straight up install.

## Licencing
See [./LICENCE.md]