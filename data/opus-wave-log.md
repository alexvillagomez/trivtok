# Opus-directed generation (non-overlapping with codex)

Codex owns: Ancient Rome, Ancient Mesopotamia, Physics (thermo/stat-mech/kinetic), Chemistry (kinetics/chem-thermo), Augustan literature.

Opus lanes (distinct domains). Slug -> status.

## Wave 1
- geography-world-capitals
- biology-cardiovascular-system
- astronomy-solar-system-planets
- mythology-norse-gods
- music-baroque-composers
- math-euclidean-geometry

## Wave 2
- history-world-war-two-pacific
- literature-shakespeare-plays
- art-renaissance-painting
- biology-genetics-heredity
- geography-rivers-and-mountains
- computer-science-fundamentals

## Wave 3
- history-cold-war
- sports-olympic-games
- film-classic-hollywood
- world-religions-basics
- literature-19th-century-novels
- biology-ecology-ecosystems

## Wave 4
- economics-principles
- us-government-constitution
- biology-nervous-system
- mythology-egyptian
- music-theory-fundamentals
- inventions-and-inventors

## Wave 5
- history-french-revolution
- geography-us-states
- mythology-greek
- biology-cell-biology
- sports-world-football
- astronomy-stars-and-galaxies

## Wave 6
- history-american-revolution
- literature-20th-century-fiction
- geography-oceans-and-seas
- art-modern-movements
- music-rock-and-pop-history
- biology-skeletal-muscular-system

## Wave 7
- history-medieval-europe
- geography-world-flags
- biology-digestive-system
- literature-fantasy-scifi
- film-modern-cinema
- math-algebra-and-number-theory

## Wave 8
- history-ancient-china
- history-feudal-japan-samurai
- mythology-hindu
- sports-basketball-nba
- food-world-cuisine
- philosophy-major-thinkers

## Wave 9
- history-age-of-exploration
- geography-landmarks-and-monuments
- biology-animal-kingdom
- literature-poetry-and-poets
- math-probability-and-statistics
- mythology-celtic-arthurian
(wave 9: all landed EXCEPT history-age-of-exploration — session limit killed it mid-edit; redo in wave 10)

## Wave 10
- history-age-of-exploration (redo)
- earth-science-geology
- history-industrial-revolution
- sports-baseball-mlb
- language-and-linguistics
- technology-history-of-computing

## Wave 11
- history-us-civil-war
- biology-immune-and-endocrine-systems
- geography-europe
- architecture-history-and-styles
- music-world-and-folk
- math-calculus

## Wave 12
- history-russian-revolution-ussr
- history-ancient-greece
- geography-asia
- geography-africa
- entertainment-television-history
- mythology-aztec-and-maya

## Wave 13
- history-world-war-one
- biology-botany-plants
- geography-south-america
- sports-tennis-golf-racket
- film-animation-history
- mythology-japanese-shinto

## Wave 14
- history-islamic-golden-age
- biology-marine-life
- sports-ice-hockey-nhl
- literature-childrens-and-ya
- history-african-empires
- geography-north-america

## Wave 15
- history-space-exploration
- biology-respiratory-and-urinary-systems
- geography-oceania-australia
- history-renaissance-and-reformation
- games-chess-and-board-games
- history-indigenous-peoples-americas

## Wave 16
- history-ancient-egypt-pharaohs
- science-psychology
- history-20th-century-decolonization
- arts-photography-history
- math-famous-problems-and-mathematicians
- music-hip-hop-and-electronic

## Wave 17
- science-nutrition-and-health
- history-vikings
- geography-megacities-and-population
- literature-crime-and-mystery
- nature-natural-wonders-and-parks
- entertainment-video-games-history

## Wave 18
- history-modern-middle-east
- science-environment-and-climate
- arts-theater-and-musicals
- history-polar-and-mountaineering-exploration
- religion-holidays-and-festivals
- mythology-slavic
(NOTE: modern-middle-east had skewed answer positions; fixed in-DB via fix-cs-shuffle.ts)

## Wave 19
- history-british-monarchy-and-empire
- science-nobel-laureates-and-discoveries
- geography-islands-of-the-world
- literature-world-and-translated-fiction
- sports-motorsport-and-racing
- food-drinks-and-beverages
(NOTE: islands-of-the-world skewed→pos0; fixed in-DB via shuffle)

## Wave 20
- history-us-presidents
- science-everyday-technology-how-things-work
- geography-currencies-and-economies
- sports-cricket-and-rugby
- arts-sculpture-and-famous-artworks
- mythology-chinese
(NOTE: ran dedup-questions.ts — removed 603 duplicate rows; DB 9399→8796 unique)

## Wave 21
- history-ancient-india
- science-microbiology-and-viruses
- geography-time-zones-and-earth-facts
- entertainment-comics-and-superheroes
- history-of-medicine
- sports-athletics-track-and-field

## Wave 22
- history-pirates-and-age-of-sail
- science-evolution-and-paleontology
- geography-borders-and-territories
- literature-nonfiction-and-speeches
- games-card-games-and-gambling
- mythology-african-yoruba

## Wave 23
- history-ancient-persia
- science-measurement-units-and-instruments
- geography-extreme-places-and-superlatives
- music-instruments-of-the-orchestra
- literature-fairy-tales-and-fables
- history-notable-women
(dedup pass 2: 9717→9620, removed 97)

## Wave 24
- history-espionage-and-spies
- science-robotics-and-ai
- geography-lakes-and-freshwater
- sports-extreme-and-action-sports
- arts-fashion-and-design-history
- mythology-polynesian
(wave 24: session limit killed all 6 mid-author; espionage/robotics/lakes files recovered+inserted manually, other 3 re-authored)

## Wave 25
- history-aviation-and-flight
- science-genomics-and-biotechnology
- geography-us-cities-and-regions
- transportation-trains-and-railways
- arts-dance-and-ballet
- history-of-money-and-trade

## Wave 26
- history-inca-and-andean-civilizations
- science-oceanography
- geography-deserts-of-the-world
- sports-rules-and-scoring
- arts-opera-and-classical-voice
- history-of-books-and-libraries
(dedup pass 3: 10576→10468, removed 108)

## Wave 27
- science-forensic-science
- nature-birds-and-ornithology
- sports-boxing-and-combat-sports
- history-cartography-and-maps
- arts-decorative-arts-and-crafts
- history-natural-disasters

## Wave 28
- science-history-of-astronomy-and-telescopes
- sports-cycling-and-endurance
- literature-horror-and-gothic-fiction
- history-castles-and-medieval-warfare
- food-desserts-and-baking
- geography-place-names-and-toponymy
(dedup pass 4: 11146→11101, removed 45)

## Wave 29
- history-labor-and-social-movements
- science-materials-and-engineering
- geography-national-symbols-and-emblems
- sports-winter-sports-and-skiing
- entertainment-magic-and-circus
- mythology-creation-and-flood-myths

## Wave 30
- philosophy-eastern-thought
- science-human-senses-and-perception
- geography-microstates-and-small-countries
- sports-swimming-and-water-sports
- entertainment-toys-and-games-history
- history-communication-and-postal
