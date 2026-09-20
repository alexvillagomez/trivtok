# Question Coverage Map

Last updated: 2026-09-20

> Scope note: this hand-maintained ledger records the focused authored series and
> its niche notes. The complete machine-generated inventory of every JSON batch is
> `data/question-catalog.json`. Run `npm run catalog:questions` after authoring or
> editing a batch; the command validates structure and cross-file duplicates before
> refreshing the catalog. Run `npm run audit:questions` for a read-only check or
> `npm run audit:questions:verbose` to inspect every non-blocking quality warning.
> Long-scroll topics and the files that jointly supply them are declared in
> `data/topic-families.json`; the audit fails when a declared topic has fewer
> questions than its target.
> Database delivery is tracked separately in `data/insertion-ledger.json`,
> which currently records 90 inserted long-scroll batches (9,014 questions)
> as present in the configured Supabase project. Eighty-nine batches contain
> 100 questions; The Sims contains 114, with 64 easier and 50 harder questions.

## Continued authoring — 2026-09-19

| Lane | Domain | Narrow niche | Batch file | Authored | Status |
| --- | --- | --- | --- | ---: | --- |
| Technology | Version control | Git objects, branches, commands, and collaboration | `data/generated/computer-science-git-version-control.json` | 60 | Inserted; 60/60 verified |
| Technology | Web basics | HTML, CSS, browsers, URLs, and HTTP | `data/generated/technology-web-pages-and-browser-basics.json` | 60 | Inserted; 60/60 verified |
| Psychology | Judgment | Decision-making heuristics and cognitive biases | `data/generated/psychology-decision-making-and-cognitive-biases.json` | 50 | Inserted; 50/50 verified |
| Entertainment | Trolls | Three films, music tribes, family stories, cast, and spin-offs | `data/generated/trolls-films-world-music-and-characters.json` | 60 | Inserted; 60/60 verified |
| Entertainment | Trolls | Bergen characters, Funk royal history, tribe side characters, BroZone details, and production | `data/generated/trolls-franchise-deeper-characters-tribes-and-production.json` | 45 | Inserted; 45/45 verified |
| Entertainment | X-Men animation | 1992 series premiere, powers, foes, arcs, and legacy | `data/generated/xmen-animated-series-1992-characters-and-story-arcs.json` | 60 | Inserted; 60/60 verified |
| Entertainment | X-Men animation | Episode-specific plots across seasons two through five | `data/generated/xmen-animated-series-1992-episode-deep-dive.json` | 50 | Inserted; 50/50 verified |
| Entertainment | Avatar animation | Three seasons, nations, characters, locations, and episode plots | `data/generated/avatar-last-airbender-animated-world-and-three-books.json` | 60 | Inserted; 60/60 verified |
| Entertainment | Korra animation | Four books, city politics, spirits, new airbenders, and Earth Empire | `data/generated/legend-of-korra-four-books-characters-and-conflicts.json` | 60 | Inserted; 60/60 verified |
| Entertainment | Shrek universe | Four Shrek films, two Puss in Boots films, plots, cast, and release history | `data/generated/shrek-universe-films-characters-stories-and-cast.json` | 60 | Inserted; 60/60 verified |
| Entertainment | Kung Fu Panda | Four films, character relationships, conflicts, cast, and production | `data/generated/kung-fu-panda-four-films-characters-conflicts-and-cast.json` | 52 | Inserted; 52/52 verified |
| Entertainment | Dragon-rider universe | Animated trilogy, riders, dragon species, and TV spin-offs | `data/generated/how-to-train-your-dragon-trilogy-riders-and-spinoffs.json` | 50 | Inserted; 50/50 verified |
| Entertainment | Madagascar universe | Three films, penguin spin-off, zoo animals, and TV shows | `data/generated/madagascar-films-penguins-and-tv-spinoffs.json` | 40 | Inserted; 40/40 verified |
| Entertainment | Toy Story | Four films, toys, owners, settings, plot turns, and a short film | `data/generated/toy-story-four-films-characters-places-and-stories.json` | 52 | Inserted; 52/52 verified |
| Entertainment | Monsters universe | Original film, university prequel, workplace series, and short | `data/generated/monsters-inc-university-work-and-shorts.json` | 48 | Inserted; 48/48 verified |
| Entertainment | Finding Nemo and Dory | Two films, reef and institute settings, sea life, characters, and journeys | `data/generated/finding-nemo-dory-reefs-characters-and-journeys.json` | 40 | Inserted; 40/40 verified |
| Entertainment | Inside Out | Two films, emotion roles, mind-world mechanics, and Riley's life | `data/generated/inside-out-two-films-emotions-memory-and-riley.json` | 30 | Inserted; 30/30 verified |
| Entertainment | Inside Out | Film plot, hockey, hidden mind-world characters, short, series, and cast | `data/generated/inside-out-films-shorts-series-deeper-cuts.json` | 53 | Inserted; 53/53 verified |

## Deepening wave — 2026-09-06

This wave used three non-overlapping low-usage-agent lanes. Each broad survey
topic was extended through a separate, narrowly named file rather than mixed
back into its original batch. These files are authored and validated locally;
they have not yet been inserted into Supabase.

| Lane | Domain | Narrow niche | Batch file | Authored | Difficulty >= 0.70 | Status |
| --- | --- | --- | --- | ---: | ---: | --- |
| Science | Genetics | Mendelian ratios, linkage, pedigrees, and epistasis | `data/generated/genetics-mendelian-ratios-and-linkage.json` | 100 | 80 | Authored; not inserted |
| Science | Oceanography | Thermohaline circulation, water masses, tracers, and mixing | `data/generated/oceanography-thermohaline-circulation.json` | 100 | 80 | Authored; not inserted |
| History | French Revolution | Committees and revolutionary government, 1792–1795 | `data/generated/french-revolution-committees-and-revolutionary-government.json` | 100 | 63 | Authored; not inserted |
| History | Ancient Greece | Athenian democratic institutions and procedure | `data/generated/ancient-greece-athenian-democratic-institutions.json` | 100 | 81 | Authored; not inserted |
| Humanities | Shakespeare | Textual history, quartos, folios, and transmission | `data/generated/shakespeare-textual-history-and-quartos.json` | 100 | 100 | Authored; not inserted |
| Humanities | Renaissance painting | Iconography, commissions, workshops, and technical evidence | `data/generated/renaissance-painting-iconography-and-commissions.json` | 100 | 100 | Authored; not inserted |

Lane boundaries for future work:

- Science continues through mechanisms, measurements, and quantitative distinctions.
- History continues through institutions, procedures, chronology, and primary-source terminology.
- Humanities continues through textual transmission, patronage, material evidence, and reception.
- New batches must use an unclaimed narrow niche and pass the full-bank audit before being logged.

This is the working coverage ledger for the TrivTok question bank. Each generation wave should add a row, preserve a narrow niche name, and list adjacent areas separately so future batches can go deep without repeatedly covering the same ground.

## Sports expansion — 2026-09-07

This separate football lane stays focused on club competitions, trophies, finals, managers, and tournament structure so the feed has a genuinely long scroll path for football fans.

| Lane | Domain | Narrow niche | Batch file | Authored | Difficulty >= 0.70 | Status |
| --- | --- | --- | --- | ---: | ---: | --- |
| Sports | World Football | Club competitions, European trophies, and FIFA club finals | `data/generated/world-football-club-competitions.json` | 100 | 66 | Authored; not inserted |

## Balanced-difficulty expansion — 2026-09-15

These long-scroll batches deliberately split their question spectrum 50/50:
50 approachable questions below difficulty `0.70`, followed by 50 niche or
technical questions at or above `0.70`. The order is an authoring convenience;
IRT remains responsible for serving the right level to each user.

| Lane | Domain | Narrow niche | Batch file | Easier | Harder | Status |
| --- | --- | --- | --- | ---: | ---: | --- |
| Sports | World Football | Tactics, formations, pressing, buildup, and set pieces | `data/generated/world-football-tactics-and-formations.json` | 50 | 50 | Inserted |
| Science | Biology | Cardiovascular anatomy and circulation | `data/generated/cardiovascular-anatomy-and-circulation.json` | 50 | 50 | Inserted |
| History | Ancient Egypt | Old Kingdom pyramids, tombs, complexes, and administration | `data/generated/ancient-egypt-old-kingdom-pyramids-and-tombs.json` | 50 | 50 | Inserted |
| Science | Astronomy | Exoplanet detection, characterization, atmospheres, and inference | `data/generated/astronomy-exoplanets-detection-and-characterization.json` | 50 | 50 | Inserted |
| Sports | American Football | NFL strategy, positions, rules, and history | `data/generated/american-football-nfl-strategy-positions-and-history.json` | 50 | 50 | Inserted |
| History | World War II | Codebreaking and signals intelligence | `data/generated/world-war-two-codebreaking-and-signals-intelligence.json` | 50 | 50 | Inserted |

## Fandom rabbit-hole wave — 2026-09-06

Five brand-new per-franchise deep dives authored by low-usage Haiku agents. The
existing bank had only broad *survey* files for these domains (`tv-shows-sitcoms`,
`entertainment-video-games-history`, `literature-fantasy-scifi`); these drill into
a single franchise so a superfan can scroll a genuinely long rabbit hole. Each is
laddered from casual-viewer to superfan-obscure, covers 8–9 sub-areas evenly,
passes the giveaway/structural validator, and is rebalanced to 25/25/25/25 answer
positions. Authored and validated locally; not yet inserted into Supabase.

| Lane | Domain | Narrow niche | Batch file | Authored | Difficulty >= 0.70 | Status |
| --- | --- | --- | --- | ---: | ---: | --- |
| Entertainment | Television | Seinfeld — characters, episodes, running gags, deep continuity | `data/generated/tv-seinfeld-deep.json` | 139 | 18 | Authored; not inserted |
| Entertainment | Television | The Simpsons classic era (seasons 1–12) | `data/generated/tv-simpsons-classic-era.json` | 180 | 22 | Authored; not inserted |
| Entertainment | Film | Star Wars saga lore across the films and core canon | `data/generated/star-wars-saga-deep.json` | 160 | 2 | Authored; not inserted |
| Humanities | Literature | Tolkien's Middle-earth — Hobbit, LOTR, Silmarillion basics | `data/generated/tolkien-middle-earth-deep.json` | 172 | 10 | Authored; not inserted |
| Entertainment | Video Games | Pokémon games Gen 1–3 — dex, evolutions, type chart, mechanics | `data/generated/pokemon-games-deep.json` | 254 | 60 | Authored; not inserted |

## Current authored batches

| Domain | Category | Narrow niche | Batch file | Inserted | Difficulty target | Status |
| --- | --- | --- | --- | ---: | --- | --- |
| History | Ancient Rome | Augustus and the Early Principate | `data/generated/augustus-early-principate.json` | 104 | Very easy through very hard | In Supabase |
| Science | Physics | Thermodynamics | `data/generated/thermodynamics-deep.json` | 90 | Very easy through very hard | In Supabase |
| History | Ancient Mesopotamia | Cuneiform writing | `data/generated/mesopotamian-cuneiform.json` | 90 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Julius Caesar's dictatorship | `data/generated/caesar-dictatorship.json` | 101 | Very easy through very hard | In Supabase |
| History | Hellenistic Egypt | Cleopatra VII and Ptolemaic Egypt | `data/generated/cleopatra-ptolemaic-egypt.json` | 103 | Very easy through very hard | In Supabase |
| Science | Physics | Kinetic theory of gases | `data/generated/kinetic-theory-gases.json` | 108 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Pompey the Great | `data/generated/pompey-the-great.json` | 96 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Mark Antony | `data/generated/mark-antony.json` | 92 | Very easy through very hard | In Supabase |
| Science | Chemistry | Chemical thermodynamics | `data/generated/chemical-thermodynamics.json` | 90 | Very easy through very hard | In Supabase |
| History | Ancient Mesopotamia | Sumerian language and grammar | `data/generated/sumerian-language-grammar.json` | 96 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Roman daily life under Augustus | `data/generated/roman-daily-life-under-augustus.json` | 92 | Very easy through very hard | In Supabase |
| Science | Physics | Statistical mechanics | `data/generated/statistical-mechanics-ensembles.json` | 92 | Very easy through very hard | In Supabase |
| History | Ancient Mesopotamia | Mesopotamian mathematics | `data/generated/mesopotamian-mathematics.json` | 102 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Augustan literature by individual author | `data/generated/augustan-literature-authors.json` | 108 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Virgil and the Aeneid | `data/generated/virgil-aeneid-deep.json` | 108 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Horace's Odes | `data/generated/horace-odes-deep.json` | 92 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Octavian as a standalone deep niche | `data/generated/octavian-standalone.json` | 103 | Very easy through very hard | In Supabase |
| History | Hellenistic Egypt | Ptolemy XII and Cleopatra's accession | `data/generated/ptolemy-xii-cleopatra-accession.json` | 104 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Roman food and dining culture | `data/generated/roman-food-dining-culture.json` | 90 | Very easy through very hard | In Supabase |
| History | Ancient Rome | Sejanus and the Praetorian Guard | `data/generated/sejanus-praetorian-guard.json` | 97 | Very easy through very hard | In Supabase |
| Science | Chemistry | Reaction kinetics | `data/generated/reaction-kinetics-deep.json` | 102 | Very easy through very hard | In Supabase |
| History | Ancient Mesopotamia | Sumerian literature and myth | `data/generated/sumerian-literature-myth.json` | 98 | Very easy through very hard | In Supabase |
| Sports | Basketball | NBA pop culture crossover | `data/generated/nba-pop-culture.json` | 83 | Easy through hard, harder-weighted | In Supabase |
| Sports | World Football | Global football pop culture | `data/generated/world-football-pop-culture.json` | 88 | Easy through hard, harder-weighted | In Supabase |
| Music | Popular Music | Rock and pop history | `data/generated/rock-pop-history.json` | 84 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Film | Movies and cinema classics | `data/generated/movies-cinema-classics.json` | 90 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Television | TV shows and sitcoms | `data/generated/tv-shows-sitcoms.json` | 87 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Film | Actors and actresses | `data/generated/actors-and-actresses.json` | 87 | Easy through hard, harder-weighted | In Supabase |
| Internet Culture | Creators | Internet creators and influencers | `data/generated/internet-creators-and-influencers.json` | 104 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Reality TV | Reality TV and competition shows | `data/generated/reality-tv-and-competition-shows.json` | 87 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Comedy | Stand-up comedy and comedians | `data/generated/stand-up-comedy-and-comedians.json` | 90 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Awards | Award shows and ceremonies | `data/generated/award-shows-and-ceremonies.json` | 35 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Music Video | Music videos and MTV era | `data/generated/music-videos-and-mtv-era.json` | 32 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Podcast | Podcasts and interview shows | `data/generated/podcasts-and-interview-shows.json` | 39 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Television | Late-night talk shows and hosts | `data/generated/late-night-talk-shows-and-hosts.json` | 87 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Fashion | Fashion and celebrity style | `data/generated/fashion-and-celebrity-style.json` | 38 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Game Shows | Game shows and quiz shows | `data/generated/game-shows-and-quiz-shows.json` | 33 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Celebrity | Celebrity scandals and tabloid culture | `data/generated/celebrity-scandals-and-tabloid-culture.json` | 41 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Television | Soap operas and daytime dramas | `data/generated/soap-operas-and-daytime-dramas.json` | 43 | Easy through hard, harder-weighted | In Supabase |
| Music | Pop | Boy bands and girl groups | `data/generated/boy-bands-and-girl-groups.json` | 38 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Film | Romantic comedies and teen movies | `data/generated/romantic-comedies-and-teen-movies.json` | 87 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Animation | Anime and manga landmarks | `data/generated/anime-and-manga-landmarks.json` | 40 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Animation | Shonen Jump classics | `data/generated/shonen-jump-classics.json` | 40 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Animation | Studio Ghibli deep dives | `data/generated/studio-ghibli-deep-dives.json` | 44 | Easy through hard, harder-weighted | In Supabase |
| Music | Pop | K-pop industry landmarks | `data/generated/k-pop-industry-landmarks.json` | 69 | Easy through hard, harder-weighted | In Supabase |
| Music | Pop | K-pop soloists and crossover hits | `data/generated/k-pop-soloists-and-crossover-hits.json` | 57 | Easy through hard, harder-weighted | In Supabase |
| Music | Pop | Fourth-generation girl groups | `data/generated/fourth-generation-girl-groups.json` | 91 | Easy through hard, harder-weighted | In Supabase |
| Music | Pop | K-pop OST singers and soundtracks | `data/generated/k-pop-ost-singers-and-soundtracks.json` | 63 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Television | K-drama actors who sang OSTs | `data/generated/k-drama-actor-ost-crossovers.json` | 67 | Easy through hard, harder-weighted | In Supabase |
| Entertainment | Television | K-drama actress OSTs | `data/generated/k-drama-actress-osts.json` | 75 | Easy through hard, harder-weighted | In Supabase |

Total added so far in authored batches: **4709 questions**.

## Niche detail

### Augustus and the Early Principate

Current focus areas:

- Octavian's rise and the end of the Republic
- The Second Triumvirate and civil wars
- Actium and the defeat of Antony and Cleopatra
- Constitutional settlements and imperial powers
- The Senate, magistracies, and Republican presentation
- Military organization, veterans, and frontier policy
- Provincial administration and taxation
- Religion, priesthoods, cult, and public morality
- Building, imagery, literature, and propaganda
- Family, succession, and the Julio-Claudian household
- Ancient sources, chronology, and advanced interpretation

Good adjacent niches for later batches:

- Specific provinces under Augustan rule
- Augustan administrative reforms

### Thermodynamics

Current focus areas:

- Temperature, heat, work, and internal energy
- The zeroth, first, second, and third laws
- State functions and thermodynamic paths
- Enthalpy, entropy, and free energy
- Reversible and irreversible processes
- Heat engines, refrigerators, and Carnot limits
- Ideal gases and common transformations
- Phase equilibrium and phase transitions
- Statistical interpretation and microstates
- Advanced identities, potentials, and response functions

Good adjacent niches for later batches:

- Chemical thermodynamics and reaction equilibrium
- Black-hole thermodynamics
- Non-equilibrium thermodynamics
- Cryogenics and low-temperature physics

### Mesopotamian cuneiform

Current focus areas:

- Materials, styluses, tablets, and sign formation
- Pictographic origins and the development of the script
- Logograms, syllabic values, and determinatives
- Sumerian and Akkadian writing conventions
- Scribal education and tablet exercises
- Administrative, legal, literary, and scholarly texts
- Numeral and metrological systems
- Archives, colophons, and tablet organization
- Regional and chronological varieties
- Decipherment, epigraphy, and advanced interpretation

Good adjacent niches for later batches:

- Akkadian language and dialects
- The Epic of Gilgamesh
- Mesopotamian astronomy and omen literature
- Old Babylonian legal culture
- Assyrian royal inscriptions
- Ugaritic and other ancient Near Eastern scripts

### Julius Caesar's dictatorship

Current focus areas:

- Caesar's rise through the cursus honorum
- The First Triumvirate and political alliances
- Gaul, conquest, and military reputation
- The Rubicon, civil war, and victory over Pompey
- Dictatorship, reforms, and constitutional tensions
- Calendar reform and administrative change
- Coinage, honors, titles, and propaganda
- Relations with the Senate and elite opposition
- Cleopatra, Egypt, and eastern politics
- Assassination, aftermath, and historical interpretation

Good adjacent niches for later batches:

- Pompey the Great as a standalone niche
- The First Triumvirate in detail
- The assassination of Julius Caesar
- Caesar's Gallic Wars by campaign or battle
- The Roman civil wars of the 40s BCE
- Cato the Younger and the late Republic
- Roman republican institutions before Caesar

### Cleopatra VII and Ptolemaic Egypt

Current focus areas:

- Ptolemaic dynasty background and succession
- Cleopatra's family, education, and early reign
- Alexandria as a royal, scholarly, and commercial center
- Relations with Julius Caesar and Mark Antony
- Dynastic legitimacy, queenship, and political image
- Naval power, diplomacy, and eastern Mediterranean politics
- Egyptian religion, titles, and royal iconography
- Caesarion and succession questions
- Octavian's propaganda and the Actium aftermath
- The end of Ptolemaic rule and Roman annexation

Good adjacent niches for later batches:

- Alexandria's Library and Museion
- Hellenistic queenship more broadly
- Roman Egypt after 30 BCE
- The Battle of Actium from the Egyptian side
- Hellenistic royal propaganda

### Kinetic theory of gases

Current focus areas:

- Molecular motion and microscopic interpretation of pressure
- Temperature as average kinetic energy
- Speed distributions and Maxwell-Boltzmann ideas
- Mean free path, collisions, and transport
- Diffusion, viscosity, and thermal conductivity
- Ideal gas assumptions and their limits
- Equipartition and degrees of freedom
- Connecting kinetic theory to thermodynamics
- Real-gas corrections and departures from ideality
- Advanced derivations and conceptual distinctions

Good adjacent niches for later batches:

- Molecular dynamics and transport coefficients
- Real gas equations of state
- Non-equilibrium thermodynamics
- Gas kinetics in plasmas
- Brownian motion and stochastic processes

### Pompey the Great

Current focus areas:

- Early career, family background, and rise to prominence
- Military successes in the Social War and civil conflict
- Alliance and rivalry with Sulla, Caesar, and Crassus
- The pirate campaign and eastern command
- Political arrangements with the Senate and the First Triumvirate
- Provincial administration and client-state diplomacy
- Relationships with the army, elite, and popular politics
- Civil war against Caesar and defeat in the east
- Death in Egypt and ancient literary portrayals
- Pompey's legacy in the late Republic

Good adjacent niches for later batches:

- Lucullus and late Republican commanders
- The First Triumvirate in detail
- Roman republican military command
- Caesar's Civil War
- Eastern Mediterranean politics before Actium
- Roman elite rivalry in the first century BCE

### Mark Antony

Current focus areas:

- Antony's career under Caesar
- The Second Triumvirate
- Eastern command and relationship with Cleopatra
- Antony's military strategy and naval conflict
- Propaganda, public image, and political messaging
- The civil war with Octavian
- Actium and the collapse of Antony's position
- Antony and Roman elite politics
- Antony in ancient historiography
- Succession and the aftermath of his defeat

Good adjacent niches for later batches:

- Octavian as a standalone deep niche
- Cleopatra and Antony together as political partners
- The Second Triumvirate in detail
- Roman civil wars of the 40s and 30s BCE
- Antony's eastern settlements
- Roman propaganda against Antony

### Chemical thermodynamics

Current focus areas:

- Spontaneity and Gibbs free energy
- Enthalpy, entropy, and the second law
- Equilibrium constants and reaction direction
- Chemical potentials and mixtures
- Phase equilibria and phase diagrams
- Electrochemistry and cell potentials
- Temperature dependence of equilibrium
- Fugacity, activity, and non-ideal systems
- Thermodynamic cycles in chemistry
- Advanced derivations and state-function reasoning

Good adjacent niches for later batches:

- Physical chemistry of solutions
- Electrochemistry in depth
- Surface chemistry and adsorption
- Phase rule and multicomponent systems

### Sumerian language and grammar

Current focus areas:

- Sumerian phonology and sound structure
- Agglutinative morphology
- Verbal prefixes, suffixes, and chain order
- Nominal cases and grammatical particles
- Syntax and clause structure
- Bilingual lexical lists and scribal training
- Literary Sumerian versus administrative usage
- Orthography and writing conventions
- Transliteration and interpretation
- Advanced grammatical distinctions

Good adjacent niches for later batches:

- Akkadian language and dialects
- Bilingual lexical lists
- Mesopotamian school texts
- Sumerian syntax in detail
- Early dynastic inscriptions

### Roman daily life under Augustus

Current focus areas:

- Housing, apartments, and domestic space
- Food, dining, and markets
- Clothing, grooming, and status display
- Work, trade, and urban occupations
- Baths, leisure, and games
- Religion in the household and neighborhood
- Family roles, marriage, and children
- Slavery, freedpeople, and social hierarchy
- Urban infrastructure and daily movement
- Daily life as reflected in literary and archaeological sources

Good adjacent niches for later batches:

- Housing and urban life in imperial Rome
- Roman leisure and entertainment
- Work, trade, and occupations in Rome
- Domestic religion and household worship
- Social class and status in Roman cities

### Statistical mechanics

Current focus areas:

- Microstates, macrostates, and multiplicity
- Canonical, microcanonical, and grand canonical ensembles
- Partition functions and thermodynamic potentials
- Entropy and probability in many-particle systems
- Fluctuations, response, and correlations
- Classical and quantum statistical mechanics
- Phase transitions and critical behavior
- Ideal gases and lattice models
- Maxwell-Boltzmann, Bose-Einstein, and Fermi-Dirac statistics
- Advanced formalism and derivations

Good adjacent niches for later batches:

- Canonical and grand canonical ensembles
- Partition functions in depth
- Fluctuations and response theory
- Quantum statistical mechanics
- Phase transitions and critical phenomena

### Mesopotamian mathematics

Current focus areas:

- Sexagesimal place-value notation
- Regular numbers and reciprocal tables
- Metrology and unit systems
- Geometry and area calculations
- Tablet exercises and scribal school practice
- Division, multiplication, and computational methods
- Astronomical mathematics and numerical traditions
- Problem texts and worked examples
- Numerical notation in different periods
- Advanced scholarly interpretation

Good adjacent niches for later batches:

- Sexagesimal place-value notation in detail
- Old Babylonian metrology
- Geometry on clay tablets
- Mathematical school texts
- Astronomical mathematics

### Augustan literature by individual author

Current focus areas:

- Virgil, Horace, Livy, and Ovid as separate literary figures
- Genre, patronage, and political context
- Meter, style, and intertextuality
- Augustan ideology in poetry and prose
- Literary circles and elite support
- Roman literary culture under Augustus
- Close reading and advanced interpretation

Good adjacent niches for later batches:

- Ovid's exile and later poetry
- Livy and Roman historiography
- Augustan literary patronage
- The Georgics
- Roman epic after Virgil

### Virgil and the Aeneid

Current focus areas:

- Plot, episodes, and major characters
- Aeneas, Dido, Turnus, and divine intervention
- Fate, piety, and Roman identity
- Homeric imitation and epic technique
- Augustan teleology and political resonance
- Underworld, prophecy, and symbolic geography
- Reception and later influence

Good adjacent niches for later batches:

- The Georgics
- The Eclogues
- Homeric epic models
- Augustan literary patronage
- Roman epic reception

### Horace's Odes

Current focus areas:

- Lyric voice, themes, and Roman social identity
- Maecenas, Augustus, and patronage
- Meter, especially the Alcaic and Sapphic forms
- Friendship, wine, love, and transience
- Moral reflection and political nuance
- Literary craftsmanship and allusion
- Horace within Augustan culture

Good adjacent niches for later batches:

- Horace's Satires
- Horace's Epodes
- Alcaic meter
- Maecenas and patronage
- Augustan lyric

### Octavian as a standalone deep niche

Current focus areas:

- Early rise after Caesar's assassination
- Political alliances and calculated flexibility
- Civil war against Antony and others
- Propaganda, imagery, and legitimation
- The Second Triumvirate and consolidation of power
- Transition from Octavian to Augustus
- Statecraft, settlement, and authority

Good adjacent niches for later batches:

- Tiberius and the transfer of power
- The Second Triumvirate in detail
- Roman civil wars of the 40s and 30s BCE
- Augustan propaganda techniques
- Augustus's constitutional settlements

### Ptolemy XII and Cleopatra's accession

Current focus areas:

- Ptolemaic dynastic politics and succession
- Roman influence in late Ptolemaic Egypt
- Cleopatra's rise and early reign
- Family relations and legitimacy questions
- Political instability before Cleopatra's dominance
- Alexandria, the court, and royal symbolism
- Transition into the late Hellenistic period

Good adjacent niches for later batches:

- Alexandria's Library and Museion
- Hellenistic queenship more broadly
- Roman Egypt after 30 BCE
- Ptolemaic dynastic politics
- Egyptian priesthoods under the Ptolemies

### Roman food and dining culture

Current focus areas:

- Meals, ingredients, and seasonal staples
- Banquets, dining rooms, and social display
- Wine, garum, bread, and market foods
- Kitchens, cooking tools, and household labor
- Elite dining versus everyday eating
- Street food, taverns, and urban provisioning
- Food as a marker of status and identity

Good adjacent niches for later batches:

- Roman banqueting and symposia
- Garum and fish sauce production
- Pompeian kitchen archaeology
- Roman agricultural staples
- Elite dining etiquette

### Sejanus and the Praetorian Guard

Current focus areas:

- Tiberian court politics and Sejanus's rise
- The Praetorian Guard as a political force
- Power, patronage, and imperial secrecy
- Downfall, accusation, and execution
- Family politics and succession tensions
- Administrative control and guard command
- Ancient sources and later interpretations

Good adjacent niches for later batches:

- The Praetorian Guard under the Julio-Claudians
- Tiberian court politics
- Macro and the fall of Sejanus
- Capri and imperial secrecy
- Imperial favorites and informers

### Reaction kinetics

Current focus areas:

- Rate laws and reaction order
- Activation energy and temperature dependence
- Elementary steps and mechanisms
- Catalysis and inhibitors
- Integrated rate equations
- Enzyme kinetics and biological reactions
- Complex and chain reactions

Good adjacent niches for later batches:

- Michaelis-Menten kinetics
- Transition-state theory
- Autocatalysis
- Reaction mechanisms in organic chemistry
- Industrial catalysis

### Sumerian literature and myth

Current focus areas:

- Major mythic and literary narratives
- Gods, heroes, kings, and divine order
- Composition, transmission, and scribal context
- Epic, lament, and royal ideology
- Sumerian narrative style and themes
- Relationships to later Mesopotamian tradition
- Literary interpretation and textual comparison

Good adjacent niches for later batches:

- The Epic of Gilgamesh
- Inanna and Dumuzi traditions
- Lamentation literature
- Enmerkar and the Lord of Aratta
- The Sumerian King List

### NBA pop culture crossover

Current focus areas:

- Signature players, teams, and eras
- NBA media, documentaries, and viral moments
- Sneakers, fashion, and celebrity crossover
- Finals narratives and legacy debates
- Draft history and franchise identity
- Broad entry points and hard distinguishing details

Good adjacent niches for later batches:

- NBA playoff series history
- Basketball shoe culture
- NBA broadcast and commentary history
- Team-specific dynasty eras

### Global football pop culture

Current focus areas:

- Clubs, national teams, and iconic tournaments
- World Cup storylines and star players
- Stadium culture, chants, and supporter identity
- Football in film, advertising, and celebrity culture
- Transfer headlines and rivalry narratives
- Easy recognition plus tougher historical details

Good adjacent niches for later batches:

- Individual World Cup tournaments
- Champions League eras
- Club rivalries and derby history
- Football managers and tactics

### Rock and pop history

Current focus areas:

- Major artists, albums, and singles
- Band lineups, breakups, and reunions
- Production history and genre shifts
- Awards, tours, and cultural impact
- Career chronology and deep-cut distinctions
- Mixed easy recognition and expert-level details

Good adjacent niches for later batches:

- Specific artists by decade
- Studio album discographies
- Live concert history
- Music video and MTV-era pop culture

### Movies and cinema classics

Current focus areas:

- Classic films, directors, and studios
- Plot, cast, and production details
- Awards, box office, and critical reception
- Genre landmarks and era-specific cinema
- Franchise beginnings and landmark releases
- Easy titles plus harder behind-the-scenes distinctions

Good adjacent niches for later batches:

- Classic Hollywood studios
- Film directors by era
- Awards-season landmarks
- Box office milestones

### TV shows and sitcoms

Current focus areas:

- Sitcoms, network TV, and landmark series
- Characters, cast changes, and episode details
- Writers, showrunners, and production context
- Cultural impact and catchphrases
- Pilot episodes and long-running series arcs
- Familiar shows plus harder deep-cut questions

Good adjacent niches for later batches:

- Prestige dramas
- Streaming-era television
- Television awards history
- Television theme songs and opening credits

### Actors and actresses

Current focus areas:

- Lead roles and signature performances
- Filmographies across eras and genres
- Awards, nominations, and career milestones
- Character associations and screen personas
- Collaborations with directors and co-stars
- Easy identification plus harder career-detail questions

Good adjacent niches for later batches:

- Oscar-winning performances
- Actors by decade
- Character actors
- International film performers

### Internet creators and influencers

Current focus areas:

- YouTube, Twitch, TikTok, and podcast culture
- Viral moments and platform-specific lore
- Creator businesses, brands, and side ventures
- Collaborations, feuds, and community events
- Streaming-era fame and cross-platform identity
- Mixed easy recognition and deeper creator-history questions

Good adjacent niches for later batches:

- YouTube creator networks
- Twitch and livestream culture
- TikTok creator economy
- Creator-led brands and media companies

### Reality TV and competition shows

Current focus areas:

- Competition formats, eliminations, and twists
- Dating shows, survival shows, and talent shows
- Hosts, judges, and recurring catchphrases
- Strategy, alliances, and social deduction
- House-based and reunion-style formats
- Broad mix from accessible recognition to harder franchise details

Good adjacent niches for later batches:

- Survivor and Big Brother deep dives
- Culinary competition shows
- Dating-show histories
- Reality TV hosts and reunion specials

### Animated TV and cartoons

Current focus areas:

- Classic cartoons and modern animation
- Adult animation and kid-friendly series
- Anime landmarks and streaming-era animation
- Character dynamics, recurring gags, and voice actors
- Network branding and animation history
- Mixed easy recognition with deeper niche details

Good adjacent niches for later batches:

- Classic cartoon networks
- Adult animation history
- Anime landmarks
- Streaming-era animation

### Stand-up comedy and comedians

Current focus areas:

- Legendary club comics and breakout specials
- Clean, observational, political, and character-driven styles
- Comedy clubs, festivals, and televised showcases
- Alternative and confessional stand-up
- Comics crossing into film, TV, and podcasting
- Mixed easy recognition with harder career and scene details

Good adjacent niches for later batches:

- Alt-comedy clubs and scenes
- Comedy albums and specials
- Late-night stand-up showcases
- Festival circuit stand-ups

### Award shows and ceremonies

Current focus areas:

- Oscars, Grammys, Emmys, Tonys, and Globes
- Major wins, records, and controversies
- Red carpet culture and televised spectacle
- Category history and award show traditions
- Music, film, TV, and theater recognition
- Easy awards literacy plus harder deep-cut ceremony details

Good adjacent niches for later batches:

- Oscar history and controversies
- Grammy category history
- Television award show lore
- Broadway award seasons

### Music videos and MTV era

Current focus areas:

- MTV launch era and TRL-era culture
- Landmark videos and directors
- Pop, rock, hip-hop, and R&B video aesthetics
- Award-show crossover and video premieres
- Visual storytelling and choreography
- Mixed easy recognition with harder production details

Good adjacent niches for later batches:

- Video directors and signature aesthetics
- MTV programming history
- Pop music video breakthroughs
- VEVO and digital video era

### Podcasts and interview shows

Current focus areas:

- Narrative nonfiction and daily news podcasts
- Celebrity interview formats
- Public-radio storytelling and reporting
- Podcast hosts, networks, and platform history
- Comedy, politics, and culture shows
- Mixed easy recognition with deeper format details

Good adjacent niches for later batches:

- Narrative nonfiction podcasts
- Celebrity interview shows
- Podcast networks and platforms
- Public-radio storytelling

### Late-night talk shows and hosts

Current focus areas:

- Classic and modern late-night hosts
- Monologues, desk bits, and house bands
- Remote segments and quarantine-era experimentation
- Network eras and host transitions
- Signature recurring segments and controversies
- Mixed easy recognition with harder historical and format details

Good adjacent niches for later batches:

- Classic monologues and desk bits
- Late-night remotes and field pieces
- House bands and recurring segments
- Host transitions and network eras

### Fashion and celebrity style

Current focus areas:

- Met Gala appearances and themed dressing
- Luxury fashion houses and brand signatures
- Celebrity stylists and red-carpet image-making
- Supermodel eras and runway culture
- Designer careers and fashion-media influence
- Mixed easy recognition with harder style-history details

Good adjacent niches for later batches:

- Met Gala themes and histories
- Luxury houses and brand codes
- Celebrity stylists and image-making
- Supermodel eras and runway lore

### Game shows and quiz shows

Current focus areas:

- Classic and modern quiz formats
- Daytime game-show staples
- Nick and family game-show nostalgia
- Buzzer strategy and high-stakes trivia
- Hosts, catchphrases, and game-board structures
- Mixed easy recognition with harder format and history details

Good adjacent niches for later batches:

- Daytime game show hosts
- Classic trivia formats
- Nickelodeon game shows
- Modern quiz-show revivals

### Celebrity scandals and tabloid culture

Current focus areas:

- Paparazzi, tabloids, and gossip ecosystems
- Celebrity breakups, feuds, and public meltdowns
- Courtroom spectacles and media-frenzy coverage
- Reality stars, royals, and entertainment-news churn
- Magazine culture and gossip-site history
- Mixed easy recognition with harder scandal-history details

Good adjacent niches for later batches:

- Paparazzi and photo-agency culture
- Celebrity memoir cycles
- Courtroom spectacles in entertainment media
- Entertainment-news desk culture

### Soap operas and daytime dramas

Current focus areas:

- Long-running daytime series and their settings
- Supercouples, cliffhangers, and legacy families
- Network eras and genre history
- Crossover stars and actor associations
- Iconic characters and rivalry arcs
- Mixed easy recognition with harder soap-history details

Good adjacent niches for later batches:

- Classic soap supercouples
- Daytime drama network eras
- Soap-opera cliffhangers
- Daytime crossover stars

### Boy bands and girl groups

Current focus areas:

- Major Western pop groups and K-pop idol groups
- Member lineups and lineup changes
- Signature singles and album eras
- International pop-group history
- Producer-assembled acts and TV-launch origins
- Mixed easy recognition with harder group-history details

Good adjacent niches for later batches:

- K-pop idol group lineups
- 1990s pop crossover groups
- Producer-assembled acts
- International pop groups

### Romantic comedies and teen movies

Current focus areas:

- 90s and 2000s rom-com landmarks
- Teen ensemble films and high-school comedies
- Directors, casts, quotes, and supporting characters
- Coming-of-age movie history
- Genre tropes and crossover stars
- Mixed easy recognition with harder film-detail questions

Good adjacent niches for later batches:

- 90s teen comedies
- High school ensemble films
- Rom-com directors
- Coming-of-age movie landmarks

### Anime and manga landmarks

Current focus areas:

- Shonen, magical girl, and psychological anime landmarks
- Major manga creators and signature franchises
- Studio Ghibli and feature-film classics
- Iconic protagonists, power systems, and settings
- Series that bridged Japanese and global fandom
- Mixed easy recognition with harder creator and series details

Good adjacent niches for later batches:

- Shonen jump classics
- Studio Ghibli deep dives
- Seinen and psychological anime
- Manga author lineages

### Shonen Jump classics

Current focus areas:

- Landmark shonen series and their protagonists
- Mangaka, magazines, and franchise origins
- Signature techniques, stands, and power systems
- Sports manga and battle manga crossover memory
- Harder deep-cut series details mixed with familiar entry points

Good adjacent niches for later batches:

- JoJo stands and stand users
- Classic sports manga rivalries
- Jump villain organizations
- Legacy shonen final arcs

### Studio Ghibli deep dives

Current focus areas:

- Signature films and their core premises
- Hayao Miyazaki and Isao Takahata distinctions
- Adaptations, source novels, and directorial credits
- Recurring motifs like flight, ecology, memory, and childhood
- Easy landmark titles mixed with harder production and adaptation facts

Good adjacent niches for later batches:

- Ghibli music and Joe Hisaishi scores
- Ghibli character names and creatures
- Later Ghibli releases and lesser-known titles
- Japanese animation studio histories

### K-pop industry landmarks

Current focus areas:

- Big-label idols, agencies, and debut eras
- Survival shows, subunits, and fan terminology
- Signature songs, fandom names, and comeback vocabulary
- Mainstream entry points plus deeper industry labels
- More hard than easy, but with a useful beginner floor

Good adjacent niches for later batches:

- Fourth-generation girl groups
- K-pop solo debuts and chart hits
- Idol survival-show alumni
- Concert culture and light-stick naming

### K-pop soloists and crossover hits

Current focus areas:

- Idol-to-solo transitions and signature solo singles
- Ballads, dance-pop, rap-focused, and crossover releases
- Former group members with distinctive solo identities
- Male and female soloists spanning first through fourth generation
- Familiar stars plus a few deeper catalogue picks

Good adjacent niches for later batches:

- K-pop OST singers
- Producer-idol solo projects
- First-generation solo legends
- Collab singles and feature tracks

### Fourth-generation girl groups

Current focus areas:

- Breakout girl groups from the 2020s K-pop wave
- Debut tracks, fandom names, and company identities
- Member lineups, signature songs, and comeback eras
- Groups ranging from immediate mainstream hits to deeper cuts
- Harder-weighted questions with an accessible on-ramp

Good adjacent niches for later batches:

- Fifth-generation girl groups
- K-pop choreography and performance eras
- Girl-group member solo projects
- Company-by-company girl group comparisons

### K-pop OST singers and soundtracks

Current focus areas:

- Signature K-drama soundtrack voices
- Duets, ballads, and iconic OST collaborations
- Drama-title associations and singer credits
- Veteran soundtrack specialists plus idol crossover voices
- Easier drama-recognition questions with harder credit-level details

Good adjacent niches for later batches:

- K-drama actors who sang OSTs
- Romance-drama soundtrack duets
- Melodrama and historical-drama OSTs
- Variety-show and film soundtrack crossovers

### K-drama actors who sang OSTs

Current focus areas:

- Drama stars crossing into soundtrack performances
- Actor-credit OSTs and actor-singer crossover moments
- Romantic, fantasy, and slice-of-life drama tie-ins
- Familiar leading names plus deeper OST appearances
- Easier drama recognition with harder credit-specific details

Good adjacent niches for later batches:

- K-drama actress OSTs
- Cast albums and ensemble soundtracks
- Historical-drama ballads
- Musical-theater to drama crossover performers

### K-drama actress OSTs

Current focus areas:

- Actress-singers and drama soundtrack crossovers
- Romantic, fantasy, and slice-of-life soundtrack credits
- Idol-actresses and seasoned TV leads
- Signature drama themes plus deeper cut credit knowledge
- Easy recognition with harder song-credit detail

Good adjacent niches for later batches:

- K-drama cast albums
- Historical-drama actress ballads
- Idol-actress solo careers
- Soundtrack duets by female leads

## Generation rules for future waves

1. Choose a domain, then a category, then one narrow named niche.
2. For a topic with enough depth, target at least 100 unique questions so an
   interested user can remain in that lane for a long session. Smaller batches
   are acceptable only when the subject is genuinely narrow; record the reason.
3. Keep every question simple and direct. Ask for one fact or distinction at a
   time, use familiar wording, and remove unnecessary setup. A good easy stem is
   “Which country is home to the Great Pyramid of Giza?” A good hard stem is
   “Which pharaoh commissioned the Bent Pyramid at Dahshur?” The hard question
   is harder because the fact is more specific—not because the sentence is more
   complicated.
4. Prefer short concrete forms such as “Who…?”, “Which country…?”, “What is…?”,
   “Where…?”, and “Which film…?”. Avoid nested clauses, academic framing,
   multi-step reasoning, trick wording, and vague prompts such as “is associated
   with” when a direct verb is available.
5. Make all four choices equally plausible in appearance. Keep them in the same
   category and grammatical form, with similar length, specificity, and detail.
   The correct answer must not stand out as the longest, most intricate, only
   qualified, or only multi-word choice. Avoid one joke option, “all of the
   above,” overlapping choices, and distractors from obviously different eras,
   countries, genres, or subject types.
6. Spread questions across recall, chronology, causation, comparison,
   interpretation, and technical detail, while keeping each individual stem
   plain-language and focused on one answerable point.
7. Cover the full difficulty range. For a 100-question topic, default to 50
   questions below difficulty `0.70` and 50 at or above it so IRT has both a
   welcoming on-ramp and a deep expert tail. Depart from 50/50 only when the
   niche genuinely demands it, and record that choice in `data/topic-families.json`.
8. Before insertion, exclude exact normalized question-text matches already present in the database or the new batch.
9. Give each batch a stable filename and add it to this ledger immediately after insertion.
10. Put related-but-distinct material in the adjacent-niches list instead of quietly mixing it into the current niche.
11. Add long-scroll groupings to `data/topic-families.json`, including every file
   that contributes to the topic's usable depth.

## Database insertion method

These batches were authored directly by Codex subagents. No generation API or embedding API was used. `scripts/insert-authored-local.ts` assigns recommendation vectors by blending existing database vectors matched to a topic-specific anchor expression and applying a small deterministic offset.

This embedding method is intended to make the new questions testable in the existing Supabase recommendation loop. It is a local topical approximation, not a semantic embedding model.
