import path from "node:path";
import { generateFixtures } from "../tests/fixtures/generate";

const files = await generateFixtures();
console.log(files.map((f) => path.relative(process.cwd(), f)).join("\n"));
