# Neon Shelf

Your own after-hours video store, stocked with the discs you actually own.
Pick a mood and how long you have, and it deals four movies: three that match,
plus one wildcard.

**Live app:** https://mapple9851.github.io/movie-picker/

Everything runs on GitHub. Your computer never needs to be on.

---

## One-time setup (about 20 minutes, all in a web browser)

Do these in order. Steps 1 to 4 are easiest on a computer, but Safari on your
phone works too.

### 1. Make the repo public

Free GitHub hosting only works for public repos (same as Midnight Video).

1. Open https://github.com/Mapple9851/movie-picker/settings
2. Scroll to the bottom, to the red **Danger Zone** box.
3. Tap **Change visibility → Change to public** and confirm.

Your movie list and watch dates become visible to anyone who finds the address.
No keys or personal details are in the repo.

### 2. Turn on GitHub Pages

1. Open https://github.com/Mapple9851/movie-picker/settings/pages
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's all. There is nothing to save.

### 3. Get two free keys

These let the robot fetch posters, summaries and IMDb ratings.

**TMDB (posters and summaries)**

1. Create a free account at https://www.themoviedb.org/signup and confirm your email.
2. Go to https://www.themoviedb.org/settings/api and tap **Create** (or **Request an API key**).
3. Choose **Developer**, accept the terms, and fill in the form. For "Application
   name" use `Neon Shelf`; for "Application URL" use the live app address above;
   for the summary, write something like "Personal app that shows posters for my
   own movie collection."
4. Copy the **API Key** it shows you. (The longer "API Read Access Token" also works.)

**OMDb (IMDb ratings)**

You made one of these for Midnight Video. If you still have it, reuse it.
Otherwise:

1. Go to https://www.omdbapi.com/apikey.aspx and choose **FREE**.
2. Enter your email. They send you the key.
3. **Tap the activation link in that email**, or the key won't work.

### 4. Put the keys in GitHub's locked drawer

GitHub calls these "secrets". Once saved, nobody can read them back, not even you.

1. Open https://github.com/Mapple9851/movie-picker/settings/secrets/actions
2. Tap **New repository secret**. Name: `TMDB_API_KEY`. Secret: paste the TMDB key. **Add secret**.
3. Tap **New repository secret** again. Name: `OMDB_API_KEY`. Secret: paste the OMDb key. **Add secret**.

The names must be typed exactly like that, capitals and underscores included.

### 5. Go live

Merge the pull request (the green **Merge pull request** button). The robot
starts by itself. First run takes about 5 minutes because it looks up every
movie. Watch it at https://github.com/Mapple9851/movie-picker/actions.

When it shows a green tick, open the live app. If you added the keys after
merging, open the Actions page, tap **Update catalog and publish → Run workflow**.

Each run ends with a short "Catalog robot" report listing any titles it could
not match. Fix those in the app (Back room → Needs a hand).

### 6. Give your phone a save key

Without this the app still deals picks, but anything you log stays on that one
device. With it, watches and new movies are saved to GitHub and show up everywhere.

1. Open https://github.com/settings/personal-access-tokens/new
2. **Token name:** `Neon Shelf phone`. **Expiration:** pick the longest option offered.
3. **Repository access:** choose **Only select repositories**, then pick `movie-picker`.
4. **Permissions → Repository permissions → Contents:** set to **Read and write**.
   Leave everything else alone.
5. Tap **Generate token** and copy it. It starts with `github_pat_`.
6. In the app: **Back room → Settings**, paste it under **Save key**, tap **Save key**.
   It should say "Key works."

This key can only touch this one repo. It is stored only on your phone. If you
ever lose the phone, delete the key at https://github.com/settings/personal-access-tokens.

### 7. Put it on your home screen

Open the live app in Safari, tap the **Share** button, then **Add to Home Screen**.

One iPhone quirk: the home-screen app and Safari keep separate storage. Open the
home-screen app once and paste the save key there too (step 6, part 6).

### 8. Build the "What should I watch?" Shortcut (3 minutes)

Apple doesn't allow ready-made Shortcut files from outside, so you build this
one by hand. In the **Shortcuts** app, tap **+**, name it `What should I watch?`,
then add these actions in order (use the search bar at the bottom to find each):

1. **List**. Enter these items, one per line:
   `Cozy`, `Scary`, `Intense`, `Funny`, `Epic`, `Weird`, `Cult`, `Thoughtful`, `Surprise`
2. **Choose from List**. Tap **Prompt** and type `What's the mood?`
3. **List** (a second one). Items: `Short`, `Medium`, `Long`
4. **Choose from List** (a second one). Prompt:
   `How long? Short = under 90 min. Medium = 90 min to 2 hrs. Long = 2 hrs+.`
5. **Text**. Type this, with nothing after the two `=` signs yet:
   `https://mapple9851.github.io/movie-picker/?deal=1&mood=` `&time=`
   - Put the cursor right after `mood=`, tap **Select Variable**, then tap the
     **Chosen Item** bubble under the *first* Choose from List.
   - Put the cursor right after `time=`, tap **Select Variable**, then tap the
     **Chosen Item** bubble under the *second* Choose from List.
6. **Open URLs**. It should automatically use the Text from step 5.

Tap **Done**. Say "Hey Siri, what should I watch?" or add it to your home screen
from the Shortcut's share menu. It opens in Safari, so paste the save key there
once as well.

---

## Everyday use

- **Deal:** pick a mood and a time, tap **Deal my 4**. Weeknights start on
  "Under 90"; Friday and Saturday start on "90 – 2 hrs".
- **Don't like them?** **Deal again** brings four different ones.
- **Tap a poster** for the summary, tags, format, when you last watched it, and
  why it was picked tonight.
- **After the movie:** tap **We watched…** and tap the one you picked. Watched
  something else? Type its title. It logs today's date (you can change the date).
- **Back room:** stats, the dusty shelf, your whole collection, and settings.

### How it picks

1. Removes anything outside your time window, and anything you logged in the last 6 months.
2. Scores the rest: mood match counts most, then how long since you last watched it.
3. Adds points for tonight: horror in October, holiday titles in December,
   rain and snow lean cozy and moody, a heat wave nudges desert and beach movies.
4. Shuffles a little so two similar nights don't deal the same hand.
5. The wildcard is a different mood that still fits your time, favouring the dustiest titles.

TV box sets are left out unless you switch on **Binge night** in Settings.

### Adding a new purchase

**Back room → + Scan barcode**, point the camera at the back of the case, check
the title, tap **Add to shelf**. If the free barcode database doesn't know the
disc (common for boutique labels), type the title instead. Poster, summary and
rating appear by themselves a couple of minutes later.

### Importing from CLZ again

Export a CSV from CLZ Movies and upload it into the [`import`](import) folder on
github.com (**Add file → Upload files → Commit changes**). New titles are added;
everything already on the shelf, and your watch history, is left alone. If you
include the Barcode and IMDb columns in the export, matching gets more reliable.

### Changing a movie

Open it, tap **Edit**. You can fix the title, year, running time, format and
moods, or remove it from the shelf. Seven titles came over from CLZ with no
format; this is where to set it.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Coloured covers instead of posters | The keys aren't in yet, or the robot hasn't run. Do steps 3 to 5, then Actions → Run workflow. |
| "SAVED ON THIS DEVICE ONLY" | No save key on this device. Do step 6. |
| "NOT SAVED TO GITHUB" | Tap it for the reason. Usually the save key expired: make a new one (step 6). |
| A red ✕ on the Actions page | Open the run and read the "Catalog robot" note. A rejected key is the usual cause. |
| The wrong poster on a movie | Open it → Edit → correct the title or year. The robot looks it up again. |
| Weather is for the wrong place | Edit `data/config.json` on github.com (latitude, longitude, place name). |

## Credits

Posters and summaries: [TMDB](https://www.themoviedb.org/). This product uses the
TMDB API but is not endorsed or certified by TMDB. IMDb ratings via
[OMDb](https://www.omdbapi.com/). Weather from [Open-Meteo](https://open-meteo.com/).
Barcode lookups from UPCitemdb's free tier. Camera scanning uses the open-source
html5-qrcode library (Apache 2.0).
