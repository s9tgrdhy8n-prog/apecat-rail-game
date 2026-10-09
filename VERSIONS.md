# APECAT Rail versions

Numbered like a program: **major.minor.patch**.

- The first number changes for a new game.
- The second number changes for a feature update.
- The third number changes for a small patch.

The start menu reads `GAME_VERSION` in `src/game/version.ts`. On every production publish, bump that constant and add a line here.

| Version | When | What |
| --- | --- | --- |
| 1.0.0 | Original launch | First public game |
| 1.0.1 | 2026-10-04 | First update. $APECAT coins, character portraits, BOGGY name, neon coins and bears, global and personal stats (best run and coins), version on the start menu |
| 1.0.2 | 2026-10-04 | Scores have to be earned in a live run. A posted number cannot take the board. |
| 1.0.3 | 2026-10-04 | Stats use the server clock. Time counts only while the run is moving. |
| 1.0.4 | 2026-10-04 | Leaderboard shows the top 30. Personal stats always show your global rank. Scores stay fully visible. |
| 1.0.5 | 2026-10-05 | Legend, skull pickups, shield rings, magnet rope, side-by-side stats, and the mobile duck. Full list is under 1.0.5 notes below. |
| 1.0.6 | 2026-10-05 | On a phone, Global and Personal are two buttons. Tap one and that window opens on its own. |
| 1.0.7 | 2026-10-05 | A higher earned score still ranks if a check-in arrives a little late. The whole run is no longer thrown away. |
| 1.0.8 | 2026-10-05 | Link preview: "APECAT & Frens" run the Rail. Collect $APECAT coins, get the highest score, unlock characters. Don't kiss the bears. |
| 1.0.9 | 2026-10-05 | Link preview text, no extra quotes: APECAT & Frens run the Rail. Collect $APECAT coins, get the highest score, unlock characters. Don't kiss the bears. |
| 1.0.10 | 2026-10-05 | Link preview picture is the group running down the rail. |
| 1.0.11 | 2026-10-05 | X link card uses plain /og.jpg and /x-banner.jpg again so the banner unfurls. |
| 1.0.12 | 2026-10-05 | X card includes the picture, title, and description tags the feed reads. |
| 1.1.0 | 2026-10-05 | Published to https://apecat-rail-game.com. Daily and weekly achievements pay Diamond Skulls. Pinky and Koko both start locked, can be previewed on the track, and each unlock for 169 Diamond Skulls. The cost shows a Diamond Skull and disappears once that runner is unlocked. Diamond Skulls, unlocks, and run stats come from runs the server watched. A wreck plays the die animation on every runner. Pinky and Koko face down the track and are the same larger size. APECAT and Gimbo are smaller. The menu plays the run on every runner. The Shady and Apecatsol cards sit at the top left so the main menu fits without scrolling. On a phone the menu, the wreck screen, the five portraits, and Left / Jump / Duck / Right all fit the screen. Achievements open as Daily and Weekly windows, the same way stats opens Global and Personal. A finished Pinky or Koko run counts toward the daily and weekly goals once that runner is unlocked, including the whole crew. |
| 1.1.1 | 2026-10-05 | Published to https://apecat-rail-game.com. Long rail is 2,500 meters in one run. Anyone who already reached that since 1.1.0 went live is paid the 2 Diamond Skulls for today. |
| 1.2.0 | 2026-10-05 | Published to https://apecat-rail-game.com. Every 100 Shield, Magnet, and Surge skulls combined pay 1 Diamond Skull. The meter at the top right fills as you collect them, then shows Diamond Skull +1. |
| 1.2.1 | 2026-10-05 | Published to https://apecat-rail-game.com. On a phone the five character boxes are smaller and sit in one even row, with Keyboard and Mobile fully on screen. |
| 1.3.0 | 2026-10-05 | Published to https://apecat-rail-game.com. Diamond Skull count sits on the Achievements row so the menu fits without scrolling. Weekly adds Coin vault: collect 25,000 $APECAT coins for 5 Diamond Skulls. On mobile, Jump and Duck press and release like the keyboard: tap for a short hop or a quick duck, hold for the full move, let go to cancel. |
| 1.4.0 | 2026-10-06 | Published to https://apecat-rail-game.com. Gallery is a first-person walk down the hall with no score. Drag to look, and Slower or Faster changes the pace. Delusional to Win It plays only in the gallery. Twenty-six new Ape pictures are mixed into the walls. On a phone the gallery controls stay on screen. |
| 1.5.0 | 2026-10-06 | Published to https://apecat-rail-game.com. Spooky joins the runners and unlocks for 169 Diamond Skulls. Finished Spooky runs count in Stats and in The whole crew after unlock. The menu, including all six portraits, fits the screen on desktop and on a phone. |
| 1.6.0 | 2026-10-06 | Published to https://apecat-rail-game.com. Ramdawg, Otter, Figge, and Thehodlr join the runners and each unlocks for 169 Diamond Skulls. Finished runs count in Stats and in The whole crew after unlock. Character time played scrolls inside its own box. Ducking during a jump drops you faster. The menu, including all ten portraits, fits the screen on desktop and on a phone. |
| 1.7.0 | 2026-10-07 | Published to https://apecat-rail-game.com. Esc pauses a run. Resume counts down 3, 2, 1 before the run moves again. The top 3 on the leaderboard can be watched when that best run was recorded. Magnet and Surge show the seconds left under the score. The Legend says each lasts 8 seconds, and Shield stays until the hit. A bell under the score hides the collect banners and the Diamond Skull +1 pop. |
| 1.8.0 | 2026-10-08 | Published to https://apecat-rail-game.com. AFTER APES and deadbeaver.eth join the runners and each unlocks for 169 Diamond Skulls. Finished runs count in Stats and in The whole crew after unlock. Ape Cat and GIMBO have new models. View Character opens a box on the T-pose, with Run and Dance, and a link to that runner's X. Every runner can dance. The song button switches DJ Ape Cat 1 through 4. Portraits are bigger, and the menu fits on a phone. |
| 1.8.1 | 2026-10-08 | Published to https://apecat-rail-game.com. On a phone the menu shows five full-size portraits at a time. Swipe the row for the rest. During a run the song, pause, and mute buttons sit in their own corner and no longer cover Best or the meters. |

## 1.0.5 notes

Published to https://apecat-rail-game.com.

### Menu and phones

- Legend explains the run and how points are scored.
- Start menu keeps every button reachable while claiming a name, logging in, or already riding.
- Keyboard and Mobile stay on screen. Swipes move the runner in both modes.
- After a wreck, Menu returns to the start screen.
- The mobile duck holds for the whole slide. The button is labeled Duck.

### Skull pickups

- Shield, magnet, and surge skulls show up in an open lane.
- They use the new glowing skull models, and they are smaller.
- No name floats over a skull. The collected banner at the top is half the old size.
- The legend shows the blue shield skull, the pink magnet skull, and the gold surge skull next to what each one does.

### Shield

- Three magic rings circle the runner. The colors shift through cyan, violet, and magenta.
- One free hit. That hit also clears magnet and surge.

### Magnet and surge

- Magnet is a thin pink rope.
- It grabs coins beside you as you pass, coins above you when you run under them, and coins below you when you jump over.
- Surge doubles coin points.
- Magnet and surge stack, and both names stay on the run until a shield hit clears them.

### Stats

- Personal stats show how many of each skull you collected, with the photos.
- Global stats show the all-time total of each skull, with the photos.
- Global stats also show total coins collected by all players.
- Global and personal stats are two windows side by side.
