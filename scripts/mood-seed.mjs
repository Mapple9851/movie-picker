// Hand-picked mood tags for the original collection.
// Format per line:  Title = moods (first is the main one) | seasonal/weather vibes
// Moods: cozy scary intense funny epic weird cult deep
// Vibes: halloween christmas snow summer rain heat romance easter
// Movies that are not listed here get an automatic guess from their genres.
import { norm } from '../js/picker.js';

const SEED = `
12 Angry Men = intense, deep | heat
1917 = intense, epic
2001: A Space Odyssey = epic, weird, deep
The 40-Year-Old Virgin = funny, cozy | romance
Ace Ventura: Pet Detective = funny
Agitator = intense
Aladdin = cozy, funny
Alien = scary, intense
Aliens = intense, scary, epic
Altered States = weird, scary
American Gigolo = intense
Annabelle = scary
Annabelle Comes Home = scary
Annabelle: Creation = scary
Arena = cult
Army of Darkness = funny, cult, scary | halloween
Backdraft = intense
La Bamba = cozy
Barry Lyndon = epic, deep
Batman = epic
Batman Returns = epic, weird | christmas, snow
Ben-Hur = epic | easter
The Big Lebowski = funny, cozy
Big Trouble in Little China = funny, cult, cozy
Black Phone 2 = scary | snow
Blade Runner 2049 = epic, intense, deep | rain
Blue Velvet = weird, intense
Body Bags = scary, funny, cult | halloween
Body Heat = intense | heat
Brotherhood of the Wolf = epic, scary
Captain Ron = funny, cozy | summer
Carnival of Souls = scary, weird | halloween
Casino = intense, epic
Cellar Dweller = cult, scary
Chernobyl = intense
Coco = cozy
Color Out of Space = weird, scary
The Conjuring = scary
The Conjuring 2 = scary
The Conjuring: The Devil Made Me Do It = scary
Creepshow = scary, funny, cult | halloween
Creepshow 2 = scary, cult | halloween
Cruising = intense
Cutter's Way = intense, deep
Dark Angel = cult, intense
Dark City = weird, intense | rain
The Dark Knight = intense, epic
Deadly Outlaw: Rekka = intense, weird
Deadstream = scary, funny | halloween
DeepStar Six = cult, scary
Demon Wind = cult, scary
Demonic Toys = cult, funny, scary
Demons = scary, cult
Demonwarp = cult
Devil Story = cult, weird
The Devil's Candy = scary, intense
Die! Die! My Darling! = scary
Dirty Harry = intense
Doctor Sleep = scary, epic | snow
Dogma = funny, weird
Dolls = scary, cult | rain
Double Jeopardy = intense
Dune = epic | heat
Dune: Part Two = epic | heat
The Dungeonmaster = cult
Edge of Sanity = scary, weird
Elvira: Mistress of the Dark = funny, cult | halloween
Enter the Void = weird, intense
Escape from New York = intense, cult
Event Horizon = scary, intense
Excalibur = epic
Exhuma = scary
The Exorcist = scary | halloween
A Fistful of Dollars = intense | heat
The Florida Project = deep | summer
For a Few Dollars More = intense | heat
Frailty = scary, intense
Freddy's Dead: The Final Nightmare = scary, funny, cult
Freeway = intense, funny, cult
From Beyond = scary, weird, cult
Fudoh: The New Generation = weird, intense, cult
Full Metal Jacket = intense
The Garbage Pail Kids Movie = cult, weird
Godzilla Minus One = epic, intense
Godzilla vs. Biollante = epic, cult
The Good, the Bad and the Ugly = epic | heat
The Gorgon = scary, cozy | halloween
Graveyard Shift = scary, cult
Halloween = scary | halloween
Halloween II = scary | halloween
Halloween III: Season of the Witch = scary, weird, cult | halloween
Hard Boiled = intense
Hard Target = intense, cult
Hellbound: Hellraiser II = scary, weird
Hellraiser = scary, weird
Hellraiser III: Hell on Earth = scary, cult
High and Low = intense, deep | heat
A History of Violence = intense
The Hitcher = intense, scary | heat
The Hobbit: An Unexpected Journey = epic, cozy
The Hobbit: The Battle of the Five Armies = epic, cozy
The Hobbit: The Desolation of Smaug = epic, cozy
Howard the Duck = cult, funny
Howling II: ... Your Sister Is a Werewolf = cult, scary
In the Mouth of Madness = scary, weird
It = scary
IT: Welcome to Derry: Season 1 = scary
Jaws = intense, scary | summer
John Carpenter's Vampires Collector's Edition = intense, scary, cult | heat
Vampires = intense, scary, cult | heat
The Keep = weird, scary
Kill Bill: The Whole Bloody Affair = intense, epic
Killers of the Flower Moon = epic, deep
Krampus = scary, funny | christmas, snow
Lawrence of Arabia = epic | heat
The Long Good Friday = intense
Lord of Illusions = scary, weird
The Lord of the Rings: The Fellowship of the Ring = epic, cozy
The Lord of the Rings: The Return of the King = epic, cozy
The Lord of the Rings: The Two Towers = epic, cozy
Luca = cozy, funny | summer
Mac and Me = cult, funny
Madman = scary, cult
The Mangler = cult, scary
Mars Attacks! = funny, weird
The Martian = epic, cozy
Mimic = scary
A Minecraft Movie = funny, cozy
Misery = intense, scary | snow
Ms .45 = intense, cult
Mutant = cult, scary
My Neighbor Totoro = cozy | rain, summer
Network = deep, intense
Never Take Candy from A Stranger = intense
New Nightmare = scary
Night of the Demons = scary, funny, cult | halloween
Night of the Living Dead = scary | halloween
A Nightmare on Elm Street = scary | halloween
A Nightmare on Elm Street 3: Dream Warriors = scary, funny
A Nightmare on Elm Street 4: The Dream Master = scary, cult
A Nightmare on Elm Street Part 2: Freddy's Revenge = scary, cult
A Nightmare on Elm Street: The Dream Child = scary, cult
No Country for Old Men = intense | heat
The Northman = epic, intense
Nosferatu = scary | snow
Nothing But Trouble = weird, funny, cult
The Nun = scary
The Old Dark House = funny, cozy | rain, halloween
One Battle After Another = intense, funny
Oppenheimer = epic, intense, deep
Over the Top = cult, cozy
Overlord = intense, scary
Pacific Rim = epic
Paris, Texas = deep | heat
Perfect Days = deep, cozy
Pet Sematary = scary
The Phantom of the Opera = epic, cozy | romance
The Pirates of Blood River = cozy, cult
Point Break = intense
Possession = weird, scary, intense
Primal Rage = cult, scary
Prince of Darkness = scary, weird
Project Hail Mary = epic, cozy, funny
The Prophecy = scary, weird
The Prophecy 3: The Ascent = cult, scary
The Prophecy II = cult, scary
Pulp Fiction = intense, funny
Ran = epic
Re-Animator = scary, funny, cult
The Return of the Living Dead = funny, scary, cult | halloween
Return of the Living Dead II = funny, cult
The Revenge of Frankenstein = scary, cozy | halloween
Riki-Oh: The Story of Ricky = cult, funny
Road House = cult, intense
Robot Jox = cult
The Sadness = scary, intense
Salem's Lot = scary | halloween
Save the Green Planet! = weird, funny
Scanners = weird, scary
Scream of Fear = scary, intense
Seven Samurai = epic
Shin Godzilla = epic, weird
The Shining = scary | snow
A Simple Plan = intense | snow
Sinners = scary, epic | heat
The Snorkel = intense
Society = weird, cult, scary
Sorcerer = intense | heat, rain
Starship Troopers = epic, funny, cult
Stop Me Before I Kill! = intense
Storm of the Century = scary | snow
Stranger Things: Season 1 = scary, cozy | christmas
Stranger Things: Season 2 = scary, cozy | halloween
Stranger Things: Season 3 = scary, cozy | summer
Stranger Things: Season 4 = scary, cozy
Stranger Things: Season 5 = scary, cozy
The Stranglers of Bombay = scary, cult
Street Trash = cult, funny
Talk to Me = scary
Teenage Mutant Ninja Turtles = cozy, funny
Teenage Mutant Ninja Turtles II: The Secret of the Ooze = cozy, funny, cult
Teenage Mutant Ninja Turtles III = cult, funny
The Ten Commandments = epic | easter
The Terminator = intense
The Terror of the Tongs = cult
They Live = intense, funny, cult
Thief = intense | rain
The Thing = scary, intense | snow
Thor: Ragnarok = funny, epic
Three Colors: Blue = deep
Three Colors: Red = deep
Three Colors: White = deep, funny
Ticks = cult, scary | summer
Timecop = cult, intense
To Live and Die in L.A. = intense | heat
Trick 'r Treat = scary, funny | halloween
Troll 2 = cult, funny
Tromeo and Juliet = cult, funny
The Two Faces of Dr. Jekyll = scary, cozy
Van Helsing = cult, epic
The Wailing = scary, intense | rain
Wake in Fright = intense | heat
Wayne's World = funny, cozy
Weapons = scary
White Christmas = cozy | christmas, snow
Withnail and I = funny, deep | rain
Yi Yi = deep
`;

const map = new Map();
for (const line of SEED.split('\n')) {
  const i = line.lastIndexOf(' = ');
  if (i < 0) continue;
  const [moods, vibes = ''] = line.slice(i + 3).split('|');
  map.set(norm(line.slice(0, i)), {
    moods: moods.split(',').map((s) => s.trim()).filter(Boolean),
    vibes: vibes.split(',').map((s) => s.trim()).filter(Boolean),
  });
}
export function seedFor(title) {
  return map.get(norm(title)) || null;
}

// Fixes for rows the CLZ export got wrong or left empty, and search hints for
// titles that TMDB files under a different name. Keyed by the CLZ title.
export const FIXES = {
  "John Carpenter's Vampires Collector's Edition": { title: 'Vampires', year: 1998, runtime: 108, genres: ['Action', 'Horror', 'Thriller'], director: 'John Carpenter' },
  'Die! Die! My Darling!': { tmdbQuery: 'Fanatic' },
  'Never Take Candy from A Stranger': { tmdbQuery: 'Never Take Sweets from a Stranger' },
  'Scream of Fear': { tmdbQuery: 'Taste of Fear' },
  'Stop Me Before I Kill!': { tmdbQuery: 'The Full Treatment' },
  'Dark Angel': { tmdbQuery: 'I Come in Peace' },
  'Chernobyl': { kind: 'series' },
};
