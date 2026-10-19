// Loads .env.local for standalone scripts. MUST be the FIRST import in any
// script that touches the DB or an API client — ES module imports evaluate
// before a script's body runs, so API clients constructed at import time would
// otherwise read the keys before dotenv has loaded them.
import { config } from "dotenv";

config({ path: ".env.local" });
config();
