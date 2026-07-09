import { openDB } from "idb";
import type { ConversationRecord, PracticeRecord } from "@/lib/types";

const DB_NAME = "speakmate";
const PRACTICE_STORE = "practice-records";
const CONVERSATION_STORE = "conversation-records";

async function getDatabase() {
  return openDB(DB_NAME, 2, {
    upgrade(database) {
      // v1：练习记录
      if (!database.objectStoreNames.contains(PRACTICE_STORE)) {
        database.createObjectStore(PRACTICE_STORE, { keyPath: "id" });
      }
      // v2：对话记录
      if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
        database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
      }
    },
  });
}

export async function savePractice(record: PracticeRecord) {
  const database = await getDatabase();
  await database.put(PRACTICE_STORE, record);
}

export async function listPractices(): Promise<PracticeRecord[]> {
  const database = await getDatabase();
  const records = (await database.getAll(PRACTICE_STORE)) as PracticeRecord[];
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePractice(id: string) {
  const database = await getDatabase();
  await database.delete(PRACTICE_STORE, id);
}

// —— 对话记录 ——

export async function saveConversation(record: ConversationRecord) {
  const database = await getDatabase();
  await database.put(CONVERSATION_STORE, record);
}

export async function getConversation(id: string): Promise<ConversationRecord | undefined> {
  const database = await getDatabase();
  return (await database.get(CONVERSATION_STORE, id)) as ConversationRecord | undefined;
}

export async function listConversations(): Promise<ConversationRecord[]> {
  const database = await getDatabase();
  const records = (await database.getAll(CONVERSATION_STORE)) as ConversationRecord[];
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteConversation(id: string) {
  const database = await getDatabase();
  await database.delete(CONVERSATION_STORE, id);
}
