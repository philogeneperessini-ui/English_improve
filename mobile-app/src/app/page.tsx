import { SpeakingApp } from "@/components/speaking-app";
import { AuthGate } from "@/components/auth-gate";

export default function Home() {
  return (
    <AuthGate>
      <SpeakingApp />
    </AuthGate>
  );
}
