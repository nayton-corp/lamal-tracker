import { createContext, fixedClock, type AppContext } from "@/application/context";
import { openDatabase } from "@/infrastructure/db/client";
import { memoryFileStore } from "@/infrastructure/files";

export function testContext(today = "2026-10-05"): AppContext & { files: ReturnType<typeof memoryFileStore> } {
  const db = openDatabase(":memory:");
  const files = memoryFileStore();
  return { ...createContext(db, fixedClock(today), files), files };
}
