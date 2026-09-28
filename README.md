# Buzz

Makes an Android phone vibrate: choose how strong, what pattern, and for how long.

Open it at **<https://domphill.github.io/buzz/>** on an Android phone, in Chrome, Samsung Internet or Firefox. There is no account and nothing is sent anywhere.

## Putting it on your phone

Open the link in Chrome, tap the menu (three dots), then **Add to Home screen** or **Install app**. It then opens like any other app and works without a connection.

## What it does

- **Intensity** from 10% to 100%. Phones can't change the motor's power from a web page, so lower settings are made of short pulses with gaps, which feel lighter. Let go of the slider to feel the level.
- **Patterns:** steady, pulse, heartbeat, waves and random, with a speed for each.
- **Stop after** a set time, or keep going until you tap Stop.
- **Keep the screen on** while buzzing, because Android stops the motor when the screen goes off or another app comes to the front.

## iPhones

Apple doesn't let web pages use the vibration motor, so Buzz can't work on an iPhone or iPad.

## Notes for making changes

- `src/app.js` and `src/app.css` are the whole app: plain JavaScript, no build step.
- `sw.js` caches the app so it opens offline. After changing any file, bump `VERSION` in `sw.js`.
- `manifest.webmanifest` and `icons/` are what phones use to add Buzz to the home screen.
