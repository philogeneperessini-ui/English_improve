import { openDB } from "idb";
import type { PracticeRecord } from "@/lib/types";

const DB_NAME = "speakmate";
const STORE_NAME = "practice-records";

async function getDatabase() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export async function savePractice(record: PracticeRecord) {
  const database = await getDatabase();
  await database.put(STORE_NAME, record);
}

export async function listPractices(): Promise<PracticeRecord[]> {
  const database = await getDatabase();
  const records = (await database.getAll(STORE_NAME)) as PracticeRecord[];
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePractice(id: string) {
  const database = await getDatabase();
  await database.delete(STORE_NAME, id);
}
