# Cover prompts

How the self-generated covers are made, so new ones match the existing set
(`generated/card-salt-mirror.jpg`, `card-lava-tunnel.jpg`, `card-city-rules.jpg` …).

## Style (paste first)

```text
You are making cover images for a travel-story website. Each image is one real place,
shown at the exact hour its story happens. Make one image per request, in the order of the
list below. After each image, wait until I say "next".

Style for every image:
- Photorealistic, cinematic travel photograph; natural lens, shallow depth of field where it helps.
- Portrait 2:3 (1024 × 1536). Keep the subject in the middle: it is cropped to 4:5 (720 × 900) for cards.
- Palette: deep blue / ink shadows, with one warm light source (lantern, fire, sunrise, lamp) when the scene allows.
- If a person appears: one small figure, seen from behind or in silhouette, face never visible,
  ordinary outdoor clothes, no logos. No crowds in focus, no identifiable real people.
- The place must look like the real place (landforms, architecture, vegetation, weather).
- No text, letters, captions, signs with readable words, watermarks, borders or frames.
- No fantasy creatures, no glowing portals: the magic is only in the light and the moment.
```

## List

Each journey keeps its art in its own folder, `web/assets/images/generated/<slug>/` (later slots:
`hero`, `scene-1..3`, `ending`, `fork`, `texture`). Save each cover as `<slug>/cover.jpg`.

| No. | File | Scene |
|---|---|---|
| 6 | `norway-aurora-hunt/cover.jpg` | Polar night above a fjord near Tromsø, Norway; green aurora curtains across the sky; a person in a dark parka standing on snow beside a steaming thermos; small town lights across the water. |
| 7 | `new-zealand-milford-kayak/cover.jpg` | Milford Sound, New Zealand, morning after heavy rain; sheer dark cliffs streaked with hundreds of thin temporary waterfalls; one small red sea kayak on black water; low mist. |
| 8 | `patagonia-torres-del-paine-trek/cover.jpg` | The three granite towers of Torres del Paine, Chile, lit red-orange at first light above a grey-green glacial lake; a hiker with a headlamp sitting on boulders, seen from behind. |
| 9 | `turkey-cappadocia-balloon/cover.jpg` | Dawn over the fairy chimneys of Cappadocia, Turkey; dozens of hot-air balloons rising; foreground: the wicker edge of a balloon basket and the orange glow of a burner; rose-gold light. |
| 10 | `peru-machu-picchu-inca-trail/cover.jpg` | Ancient Inca stone steps climbing into cloud forest at dawn, Peru; a hiker from behind; terraces of Machu Picchu just emerging from fog far below. |
| 11 | `namibia-deadvlei-stars/cover.jpg` | Deadvlei, Namibia, at night: black dead camelthorn trees on a cracked white clay pan, a huge red dune silhouette, the Milky Way overhead; a small figure with a dim red lamp. |
| 12 | `maldives-underwater-dining/cover.jpg` | Inside a curved transparent undersea dining room 5 m under a tropical sea, Maldives; a table set for two with white cloth; a reef shark and schools of fish passing overhead; sun rays from the surface. |
| 13 | `qinghai-qarhan-salt-road/cover.jpg` | Qarhan salt lake, Qinghai, China, at noon: a dead-straight road across grey-white salt crust under a huge sky; a road worker pouring brine from a bucket into a pothole; a traveller watching from behind. |
| 14 | `shanxi-yuncheng-salt-lake/cover.jpg` | Yuncheng salt lake, Shanxi, China, afternoon: rectangular brine pans in pink, crimson, turquoise and green, separated by narrow white salt-crusted dykes; one person walking along a dyke. |
| 15 | `poland-wieliczka-salt-chapel/cover.jpg` | Wieliczka salt mine, Poland: a vast underground chapel carved entirely from grey rock salt; chandeliers of salt crystal glowing warm; carved reliefs on the walls; one visitor standing in the aisle. |
| 16 | `japan-chichibugahama-tide-mirror/cover.jpg` | Chichibugahama beach, Kagawa, Japan, at sunset at low tide: wet sand reflecting the sky like a mirror; a few distant silhouettes jumping; one figure standing still at the water line. |
| 17 | `usa-bonneville-salt-flats/cover.jpg` | Bonneville Salt Flats, Utah, at noon: endless white salt with heat shimmer; a streamlined vintage land-speed car small on the horizon; a straight black guide line painted on the salt; a person standing beside it. |
| 18 | `heilongjiang-wudalianchi-lava/cover.jpg` | Wudalianchi, Heilongjiang, China, misty morning: a black lava field of frozen rope-like waves with lichen and young birch trees; a volcanic cone behind; a person crouching to touch the lava. |
| 19 | `japan-sakurajima-ash-city/cover.jpg` | Kagoshima, Japan, morning: a quiet residential street with fine grey volcanic ash on the pavement, yellow ash-collection bags by a doorway, Sakurajima volcano smoking across the bay; a resident sweeping. |
| 20 | `indonesia-ijen-blue-fire/cover.jpg` | Inside the Ijen crater, East Java, at night: electric-blue flames of burning sulfur flowing over yellow rocks; drifting white gas; a figure with a headlamp and a mask silhouetted. |
| 21 | `sichuan-emei-buddha-light/cover.jpg` | Golden Summit of Mount Emei, Sichuan, China, afternoon: a stone temple railing above a sea of clouds; a person's shadow cast onto the cloud, ringed by a circular rainbow glory. |
| 22 | `guizhou-fanjingshan-summit/cover.jpg` | Fanjingshan, Guizhou, China, morning mist: a tall isolated rock pillar split at the top, with two tiny temples on its summit joined by a small stone bridge; a climber on steep steps with iron chains. |
| 23 | `korea-haeinsa-woodblocks/cover.jpg` | Haeinsa temple, South Korea, before dawn: a long wooden hall with slatted windows, rows of carved wooden printing blocks on shelves inside; a lantern; mist; a visitor in a grey robe seen from behind. |
| 24 | `greece-meteora-monasteries/cover.jpg` | Meteora, Greece, dawn mist: a monastery on top of a sheer sandstone pillar; an old rope net hanging from a wooden winch tower on the cliff edge; a tiny figure on carved steps far below. |
| 25 | `bhutan-tigers-nest/cover.jpg` | Paro Taktsang (Tiger's Nest), Bhutan, morning: a white monastery clinging to a cliff high above a pine valley; prayer flags strung across the path in the foreground; a hiker from behind. |
| 26 | `inner-mongolia-badain-jaran/cover.jpg` | Badain Jaran Desert, Inner Mongolia, China, at night: towering golden dunes around a small dark lake with reeds; dense stars; a lone figure sitting on a dune crest; a small tent glowing below. |
| 27 | `mongolia-flaming-cliffs/cover.jpg` | Bayanzag, the Flaming Cliffs, Gobi, Mongolia, at dusk: red-orange eroded sandstone glowing; long shadows; a person kneeling with a soft brush beside a fossil fragment. |
| 28 | `chile-atacama-night-sky/cover.jpg` | Chajnantor plateau, Atacama, Chile, at night: white radio-telescope dishes under a dense Milky Way; thin dry air; a person with a red headlamp watching. |
| 29 | `brazil-lencois-lagoons/cover.jpg` | Lençóis Maranhenses, Brazil, afternoon: white sand dunes with clear blue-green rainwater lagoons between them; one swimmer floating on their back. |
| 30 | `heilongjiang-mohe-cold/cover.jpg` | Mohe, Heilongjiang, China, at a minus-40 dawn: a village of log houses, chimney smoke rising perfectly straight, frost on everything, pink sky; a person in a fur hat breathing out a cloud. |
| 31 | `japan-shiretoko-drift-ice/cover.jpg` | Shiretoko, Hokkaido, Japan, winter morning: a person in a red drysuit floating on their back between cracked plates of white drift ice; snowy mountains behind. |
| 32 | `svalbard-polar-night/cover.jpg` | Longyearbyen, Svalbard, at noon in the polar night: deep blue light, small colourful wooden houses, snow, mountains; one person walking under a streetlight. |
| 33 | `antarctica-port-lockroy/cover.jpg` | Port Lockroy, Antarctica, late-evening summer light: a small black wooden hut with red window frames on a rocky island; gentoo penguins around it; icebergs and mountains; a person holding a bundle of postcards. |
| 34 | `sichuan-jiuzhaigou-lakes/cover.jpg` | Five Flower Lake, Jiuzhaigou, Sichuan, China, autumn morning: impossibly clear turquoise water showing fallen tree trunks on the bottom; orange and gold forest; a person on a wooden boardwalk. |
| 35 | `korea-jeju-haenyeo/cover.jpg` | Jeju, South Korea, windy afternoon: black volcanic rocks on the shore; a small round stone-walled fire shelter with a fire burning; an orange float bobbing in the sea; a person kneeling to feed the fire, seen from behind. |
| 36 | `australia-reef-coral-spawning/cover.jpg` | Great Barrier Reef, Australia, at night underwater: corals releasing millions of pink and white egg bundles rising like upside-down snow; one diver's torch beam. |
| 37 | `mexico-yucatan-cenote/cover.jpg` | A cenote in Yucatán, Mexico, at noon: shafts of sunlight through a hole in the cave roof into clear blue water; stalactites and hanging tree roots; a snorkeller floating small at the surface. |
| 38 | `gansu-dunhuang-library-cave/cover.jpg` | Mogao Caves, Dunhuang, China: a dim cave doorway in a cliff of grottoes; painted Buddhist murals inside; stacked old paper scrolls in warm lamplight; a person holding a lamp, seen from behind. |
| 39 | `yunnan-shaxi-tea-horse-road/cover.jpg` | Shaxi, Yunnan, China, afternoon: an old stone-paved market square with a wooden opera stage and an ancient tree; pack horses with tea bundles; a quiet market. |
| 40 | `spain-camino-finisterre/cover.jpg` | Cape Finisterre, Galicia, Spain, at sunset over the Atlantic: a stone waymark with a scallop shell beside a lighthouse on the cliff; a pilgrim with a walking staff from behind. |
| 41 | `jordan-petra-by-night/cover.jpg` | Petra, Jordan, at night: a narrow red sandstone canyon lined with hundreds of candles in paper bags, leading to a carved rock facade glowing in candlelight; people sitting on rugs. |
| 42 | `japan-nakasendo-post-towns/cover.jpg` | Tsumago on the Nakasendo, Japan, autumn morning mist: a preserved Edo-period street of dark wooden houses with paper lanterns; a walker with a small bell on their pack. |
| 43 | `hongkong-midlevels-escalator/cover.jpg` | Central, Hong Kong, morning: a long covered outdoor escalator climbing steeply between dense buildings and shop signs without readable text; people riding it; a person standing at the bottom looking up. |
| 45 | `singapore-supertree-night/cover.jpg` | Singapore at night: giant illuminated tree-shaped vertical gardens glowing purple and blue; a person looking up from the path below. |
| 46 | `italy-venice-acqua-alta/cover.jpg` | Venice at night during acqua alta: a flooded square with raised wooden walkways, lamplight reflected in the water, arcades; a person in rubber boots on the walkway. |
| 47 | `scotland-edinburgh-one-oclock-gun/cover.jpg` | Edinburgh Castle battlements at one o'clock: an old field gun with a puff of white smoke; the city and the Firth of Forth in the distance; a person on the wall holding a pocket watch. |
| 48 | `morocco-marrakech-jemaa-el-fna/cover.jpg` | Jemaa el-Fnaa, Marrakech, Morocco, at dusk: smoke from food stalls, lanterns, a circle of listeners around a storyteller; a minaret in the background. |

Already done (older flat names, kept as they are): 1 `card-salt-mirror.jpg`, 2 `card-lava-tunnel.jpg`,
3 `card-temple-onsen.jpg`, 4 `card-sahara-stars.jpg`, 5 `card-greenland-sled.jpg`, 44 `card-city-rules.jpg`.

## After generating

Centre-crop to 4:5, resize to 720 × 900 and compress to ≤ 250 KB, then add the file to
[IMAGE_SOURCES.md](IMAGE_SOURCES.md) and the entrance's `cover` block:

```bash
sips --cropToHeightWidth 1280 1024 in.png --out tmp.png && sips -z 900 720 tmp.png -s format jpeg -s formatOptions 70 --out cover.jpg
```
