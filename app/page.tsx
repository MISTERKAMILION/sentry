"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I'm S.E.N.T.R.Y, your AI Product Compliance Assistant.\n\nTell me about the product you're considering selling. I'll help you identify potential compliance concerns, ask the right questions, and explain what needs further verification before you invest in inventory.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      setUser(session.user);
      if (session.access_token) {
        localStorage.setItem("supabase_access_token", session.access_token);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Add assistant placeholder
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      let token = localStorage.getItem("supabase_access_token");
      if (!token) {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || "";
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${errorData.error || "Something went wrong"}`,
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          assistantMessage += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantMessage,
            };
            return updated;
          });
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Network error. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("supabase_access_token");
    router.push("/login");
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
      <header style={{ padding: "1rem 2rem", borderBottom: "1px solid #1f2937", background: "#111111", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#a855f7" }}>S.E.N.T.R.Y</h1>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>AI Compliance Assistant</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ color: "#9ca3af", fontSize: "0.875rem" }}>{user?.email}</span>
          <button onClick={handleSignOut} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "0.875rem" }}>Logout</button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "0.875rem"
                }}>
                  🤖
                </div>
              )}
              <div style={{
                maxWidth: "70%",
                padding: "0.75rem 1rem",
                borderRadius: "12px",
                background: msg.role === "user" ? "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)" : "#1a1a1a",
                color: "#e5e7eb",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: "1.6"
              }}>
                {msg.content || (isLoading && idx === messages.length - 1 ? "▊" : "")}
              </div>
              {msg.role === "user" && (
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "#374151",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "0.875rem"
                }}>
                  👤
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #1f2937", padding: "1rem 2rem", background: "#111111" }}>
        <form onSubmit={handleSubmit} style={{ maxWidth: "800px", margin: "0 auto", display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me about the product you're considering selling..."
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "12px",
              background: "#1a1a1a",
              color: "#e5e7eb",
              border: "1px solid #374151",
              fontSize: "0.95rem",
              resize: "none",
              maxHeight: "200px",
              overflowY: "auto",
              fontFamily: "inherit"
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "12px",
              background: isLoading || !input.trim() ? "#374151" : "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)",
              color: "white",
              border: "none",
              fontWeight: "500",
              marginBottom: "0.25rem"
            }}
          >
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      </div>
    </main>
  );
}
