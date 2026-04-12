"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import type {
  SessionMessageRecord,
  SessionRecord,
  TaskRecord,
} from "@secretaryos/core";

import {
  createSession,
  getSessionMessages,
  getTask,
  sendMessage,
} from "../lib/dashboard-api";

type ChatMessage = SessionMessageRecord & {
  transient?: boolean;
};

function createSessionLabel(session: SessionRecord): string {
  return `${session.activeMode} · ${session.channel} · ${session.id.slice(-6)}`;
}

export function ChatInterface({
  sessions,
  initialSessionId,
}: {
  sessions: SessionRecord[];
  initialSessionId?: string;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(
    initialSessionId ?? sessions[0]?.id ?? "",
  );
  const [localSessions, setLocalSessions] = useState<SessionRecord[]>(sessions);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [taskStatus, setTaskStatus] = useState<TaskRecord | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const selectedSession = useMemo(
    () => localSessions.find((session) => session.id === selectedSessionId),
    [selectedSessionId, localSessions],
  );

  useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!selectedSessionId && localSessions[0]?.id) {
      setSelectedSessionId(localSessions[0].id);
    }
  }, [localSessions, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const stream = new EventSource(
      `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/sessions/${selectedSessionId}/stream`,
    );

    void getSessionMessages(selectedSessionId).then((items) => {
      if (!cancelled) {
        setMessages(items);
      }
    });

    stream.addEventListener("messages", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as ChatMessage[];

      if (!cancelled) {
        setMessages(payload);
      }
    });

    stream.addEventListener("tasks", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as TaskRecord[];
      const latest = payload[0];

      if (!cancelled && latest) {
        setTaskStatus(latest);
      }
    });

    stream.onerror = () => {
      if (!cancelled) {
        setStatus(
          "Live updates disconnected. Reconnecting through the browser is required.",
        );
      }
    };

    return () => {
      cancelled = true;
      stream.close();
    };
  }, [selectedSessionId]);

  async function pollTask(taskId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const task = await getTask(taskId);
      setTaskStatus(task);

      if (["complete", "failed", "canceled"].includes(task.status)) {
        return task;
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    return null;
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const content = String(formData.get("message") ?? "").trim();

    if (!content) {
      setStatus("Enter a message.");
      return;
    }

    setStatus("Sending...");
    setIsSending(true);

    try {
      let session =
        localSessions.find((entry) => entry.id === selectedSessionId) ?? null;

      if (!session) {
        session = await createSession({
          channel: "dashboard",
          channelSessionKey: `dashboard-${Date.now()}`,
        });

        const createdSession = session;
        setLocalSessions((current) => [createdSession, ...current]);
        setSelectedSessionId(session.id);
      }

      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          sessionId: session.id,
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          stream: false,
          transient: true,
        },
      ]);

      const result = (await sendMessage({
        channel: session.channel,
        channelSessionKey: session.channelSessionKey,
        content,
        mode: session.activeMode,
        personaId: session.activePersonaId,
        projectId: undefined,
      })) as {
        session: SessionRecord;
        task: TaskRecord;
      };

      setStatus(`Queued ${result.task.type}.`);
      setTaskStatus(result.task);
      await pollTask(result.task.id);
      void getSessionMessages(session.id).then((items) => {
        setMessages(items);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send.");
    } finally {
      setIsSending(false);
      form.reset();
    }
  }

  return (
    <section className="panel chat-interface">
      <div className="section-header">
        <div>
          <h2>Chat</h2>
          <p>
            Streaming conversation view with shared memory and session-scoped
            context.
          </p>
        </div>
      </div>

      <div className="chat-layout">
        <aside className="chat-sessions">
          <div className="chat-toolbar">
            <button
              type="button"
              className="chat-new-session"
              onClick={async () => {
                try {
                  const session = await createSession({
                    channel: "dashboard",
                    channelSessionKey: `dashboard-${Date.now()}`,
                  });

                  setLocalSessions((current) => [session, ...current]);
                  setSelectedSessionId(session.id);
                  setStatus(`Created session ${session.id}.`);
                } catch (error) {
                  setStatus(
                    error instanceof Error
                      ? error.message
                      : "Failed to create session.",
                  );
                }
              }}
            >
              New Session
            </button>
          </div>

          <div className="chat-session-list">
            {localSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="chat-session-item"
                data-active={session.id === selectedSessionId}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <strong>{createSessionLabel(session)}</strong>
                <span>{session.activePersonaId}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="chat-thread-panel">
          <div className="chat-session-meta">
            <span>{selectedSession?.activePersonaId ?? "unknown persona"}</span>
            <span>{selectedSession?.activeMode ?? "assistant"}</span>
            <span>{selectedSession?.channel ?? "dashboard"}</span>
          </div>

          <div className="chat-thread">
            {messages.length === 0 ? (
              <div className="empty-state">
                No chat history yet. Send a message to start a turn.
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className="chat-bubble"
                  data-role={message.role}
                  data-stream={message.stream ? "true" : "false"}
                >
                  <div className="chat-bubble-meta">
                    <strong>{message.role}</strong>
                    {message.stream ? <span>streaming</span> : null}
                  </div>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <form className="chat-form" onSubmit={handleSend}>
            <textarea
              name="message"
              rows={4}
              placeholder="Ask SecretaryOS something..."
              disabled={isSending}
              required
            />
            <button type="submit" disabled={isSending}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>

          {taskStatus ? (
            <div className="chat-status">
              <strong>Latest task</strong>
              <span>
                {taskStatus.type} · {taskStatus.status}
              </span>
              {taskStatus.outputText ? <p>{taskStatus.outputText}</p> : null}
            </div>
          ) : null}

          {status ? <p className="form-status">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}
