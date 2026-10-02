import fs from "node:fs";
import path from "node:path";
import { FIXTURES_DIR, generateFixtures } from "./fixtures/generate";

export default async function setup() {
  if (!fs.existsSync(path.join(FIXTURES_DIR, "primes-2027.csv"))) await generateFixtures();
}
