import { ChatInterface } from "../../src/components/chat-interface";
import { PageHeader } from "../../src/components/page-header";
import { getSessions } from "../../src/lib/dashboard-api";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const sessions = await getSessions();

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Chat"
        description="Talk to SecretaryOS from the dashboard using the active session pipeline."
        chip="Conversation"
      />
      <ChatInterface sessions={sessions} />
    </div>
  );
}
