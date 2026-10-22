# Image sources

Every image shown as a journey cover or page art, with its licence. Add a row whenever you add an
image; the journey's JSON `cover.license` and `cover.source` must match this table.

## Generated for this project

Made with an image model for 100 Journeys; no third-party rights. Each is a portrait 1120 × 1400
original, cropped to 4:5 and resized to 720 × 900; `scripts/images/derive.py` writes the AVIF sizes.

The covers for entrances 6–48 were generated at 1120 × 1400 and resized to 720 × 900. Each was
checked at full size for text, logos and recognisable faces; on `spain-camino-finisterre` a
small made-up wordmark on the backpack was painted out.
All 42 share a light grade to match the site: about 16% less saturation, slightly lifted and
cooled shadows, a little fine grain. The covers of 027, 028 and 038 were replaced so they match
their stories (nobody touches a fossil, nobody stands on the closed plateau, no lamps or scrolls
inside a cave).

The scroll-scene images of entrances 013–048 and the Ticket Road images were generated at
1536 × 1024 (1024 × 1024 for fork and texture). Each was checked at full size for text, logos,
faces, anatomy, geography and fit with its slot; the ones that failed were left out, so that
scene shows a plate in the journey's palette until a new image exists. Four had a tiny mark
painted out (a ticket bracket, a stencil on an antenna, thermometer ticks, a digit on a boot).
`scripts/images/ingest.py` gives them the covers' grade and writes the JPEG fallback and AVIF
sizes each slot is shown at.

The openings (`hero`) are also shown full screen on the home page, so they have 2400 and 3072 px
AVIFs too. Those were made from the 1536 px originals with Real-ESRGAN (`realesrgan-x4plus`, 4×,
run locally), then given the same grade and resized; the home prologue was made the same way, at
3840 × 2160 with a fine film grain and no grade, and a small figure painted out of its cleft. New
openings need the same step before `derive.py` (the image test asks for every size).

| File | Used by |
|---|---|
| `generated/card-salt-mirror.jpg` | 001 bolivia-salt-flat-trek |
| `generated/card-lava-tunnel.jpg` | 002 iceland-lava-tunnel-cycling |
| `generated/card-temple-onsen.jpg` | 003 japan-onsen-temple-meditation |
| `generated/card-sahara-stars.jpg` | 004 morocco-sahara-camel-camp |
| `generated/card-greenland-sled.jpg` | 005 greenland-dog-sled-solo |
| `generated/norway-aurora-hunt/cover.jpg` | 006 norway-aurora-hunt |
| `generated/new-zealand-milford-kayak/cover.jpg` | 007 new-zealand-milford-kayak |
| `generated/patagonia-torres-del-paine-trek/cover.jpg` | 008 patagonia-torres-del-paine-trek |
| `generated/turkey-cappadocia-balloon/cover.jpg` | 009 turkey-cappadocia-balloon |
| `generated/peru-machu-picchu-inca-trail/cover.jpg` | 010 peru-machu-picchu-inca-trail |
| `generated/namibia-deadvlei-stars/cover.jpg` | 011 namibia-deadvlei-stars |
| `generated/maldives-underwater-dining/cover.jpg` | 012 maldives-underwater-dining |
| `generated/qinghai-qarhan-salt-road/cover.jpg` | 013 qinghai-qarhan-salt-road |
| `generated/shanxi-yuncheng-salt-lake/cover.jpg` | 014 shanxi-yuncheng-salt-lake |
| `generated/poland-wieliczka-salt-chapel/cover.jpg` | 015 poland-wieliczka-salt-chapel |
| `generated/japan-chichibugahama-tide-mirror/cover.jpg` | 016 japan-chichibugahama-tide-mirror |
| `generated/usa-bonneville-salt-flats/cover.jpg` | 017 usa-bonneville-salt-flats |
| `generated/heilongjiang-wudalianchi-lava/cover.jpg` | 018 heilongjiang-wudalianchi-lava |
| `generated/japan-sakurajima-ash-city/cover.jpg` | 019 japan-sakurajima-ash-city |
| `generated/indonesia-ijen-blue-fire/cover.jpg` | 020 indonesia-ijen-blue-fire |
| `generated/sichuan-emei-buddha-light/cover.jpg` | 021 sichuan-emei-buddha-light |
| `generated/guizhou-fanjingshan-summit/cover.jpg` | 022 guizhou-fanjingshan-summit |
| `generated/korea-haeinsa-woodblocks/cover.jpg` | 023 korea-haeinsa-woodblocks |
| `generated/greece-meteora-monasteries/cover.jpg` | 024 greece-meteora-monasteries |
| `generated/bhutan-tigers-nest/cover.jpg` | 025 bhutan-tigers-nest |
| `generated/inner-mongolia-badain-jaran/cover.jpg` | 026 inner-mongolia-badain-jaran |
| `generated/mongolia-flaming-cliffs/cover.jpg` | 027 mongolia-flaming-cliffs |
| `generated/chile-atacama-night-sky/cover.jpg` | 028 chile-atacama-night-sky |
| `generated/brazil-lencois-lagoons/cover.jpg` | 029 brazil-lencois-lagoons |
| `generated/heilongjiang-mohe-cold/cover.jpg` | 030 heilongjiang-mohe-cold |
| `generated/japan-shiretoko-drift-ice/cover.jpg` | 031 japan-shiretoko-drift-ice |
| `generated/svalbard-polar-night/cover.jpg` | 032 svalbard-polar-night |
| `generated/antarctica-port-lockroy/cover.jpg` | 033 antarctica-port-lockroy |
| `generated/sichuan-jiuzhaigou-lakes/cover.jpg` | 034 sichuan-jiuzhaigou-lakes |
| `generated/korea-jeju-haenyeo/cover.jpg` | 035 korea-jeju-haenyeo |
| `generated/australia-reef-coral-spawning/cover.jpg` | 036 australia-reef-coral-spawning |
| `generated/mexico-yucatan-cenote/cover.jpg` | 037 mexico-yucatan-cenote |
| `generated/gansu-dunhuang-library-cave/cover.jpg` | 038 gansu-dunhuang-library-cave |
| `generated/yunnan-shaxi-tea-horse-road/cover.jpg` | 039 yunnan-shaxi-tea-horse-road |
| `generated/spain-camino-finisterre/cover.jpg` | 040 spain-camino-finisterre |
| `generated/jordan-petra-by-night/cover.jpg` | 041 jordan-petra-by-night |
| `generated/japan-nakasendo-post-towns/cover.jpg` | 042 japan-nakasendo-post-towns |
| `generated/hongkong-midlevels-escalator/cover.jpg` | 043 hongkong-midlevels-escalator |
| `generated/card-city-rules.jpg` | 044 chongqing-liziba-monorail |
| `generated/singapore-supertree-night/cover.jpg` | 045 singapore-supertree-night |
| `generated/italy-venice-acqua-alta/cover.jpg` | 046 italy-venice-acqua-alta |
| `generated/scotland-edinburgh-one-oclock-gun/cover.jpg` | 047 scotland-edinburgh-one-oclock-gun |
| `generated/morocco-marrakech-jemaa-el-fna/cover.jpg` | 048 morocco-marrakech-jemaa-el-fna |
| `generated/hero-taoyuan*.jpg` | home hero (and its upright crops `-phone`, `-tablet`), sign-in |
| `generated/<slug>/{hero,scene-1,scene-2,scene-3,fork,ending,texture}.jpg` | scroll scenes of entrances 013–048 |
| `generated/road/*.jpg` | the Ticket Road: station hall, realm bands, rubbing stone |
| `generated/brand-mark*.png`, `generated/guide-light*.png` | brand mark, guide |

## Earlier photographs: origin not recorded

These came with the first version of the project, and its history doesn't say where they came
from. No entrance uses them as a cover any more. Before one is shown again, replace it with a
generated or properly licensed image, or confirm its source and add it below.

`bolivia-salt-flat.jpg`, `greenland-dog-sled.jpg`, `hero-bg.jpg`, `iceland-lava-tunnel.jpg`,
`japan-temple-onsen.jpg`, `maldives-underwater.jpg`, `morocco-sahara-camp.jpg`,
`namibia-deadvlei.jpg`, `new-zealand-milford.jpg`, `norway-aurora.jpg`, `norway-aurora-2.jpg`,
`patagonia-torres-del-paine.jpg`, `peru-machu-picchu.jpg`, `turkey-cappadocia.jpg`

## Third-party (licensed)

| File | Author | Licence | Source |
|---|---|---|---|
| | | | |
