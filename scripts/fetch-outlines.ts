/**
 * fetch-outlines.ts (placeholder, no logic yet). Run with `npm run data:fetch`.
 *
 * Will call SFU's Course Outlines API at https://www.sfu.ca/bin/wcm/course-outlines,
 * walking its hierarchy: years -> terms -> departments -> courses -> sections -> outline.
 *
 * - Departments: BUS, BUEC, ECON, MATH, STAT, ENGL, PHIL, plus any department a
 *   concentration lists in data/sheets/requirements.csv.
 * - Offering history from the last 6 terms; the full outline only from each course's
 *   most recent term.
 * - Throttled to 1 request per second.
 * - User-Agent includes CONTACT_EMAIL from .env.local (never hard-code an address).
 * - Saves raw responses to data/raw/outlines/{year}/{term}/{dept}/{course}.json.
 * - Never crawls paths disallowed by https://www.sfu.ca/robots.txt.
 */
