"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
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
          // Update assistant message with ReactMarkdown
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
    <main className="wrap" style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--text)" }}>
      <div className="chat">
        <div className="chat-head">
          <div className="chat-id">
            <span className="mark" data-mark aria-hidden="true" />
            <div>
              <strong>S.E.N.T.R.Y</strong>
              <span className="chip chip-sm">
                <i className="dot" />
                <span data-i18n="chip">Standing watch</span>
              </span>
            </div>
          </div>
          <div className="head-actions">
            <button type="button" className="btn btn-ghost btn-sm" id="newChat" data-i18n="c_new">
              New chat
            </button>
            <button type="button" className="btn btn-ghost btn-sm" id="logout" data-i18n="c_logout">
              Sign out
            </button>
          </div>
        </div>

        <div className="stream" id="stream" role="log" aria-live="polite" aria-relevant="additions text">
          <div className="empty" id="empty">
            <div className="mark-wrap">
              <svg className="orbit o1" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 7" />
              </svg>
              <svg className="orbit o2" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="46 16 4 16" />
              </svg>
              <span className="mark enter" data-mark data-big aria-hidden="true" />
            </div>
            <h1 className="hello">
              <span data-i18n="c_hello">Welcome back,</span>
              <span className="who" id="who"></span>
            </h1>
            <p data-i18n="c_ask">How can your sentry help today?</p>
            <div className="sugg" id="sugg">
              <button type="button" className="btn btn-ghost btn-sm" data-sg="1" data-i18n="sg1">
                Find a product to sell
              </button>
              <button type="button" className="btn btn-ghost btn-sm" data-sg="2" data-i18n="sg2">
                Summarise a file
              </button>
              <button type="button" className="btn btn-ghost btn-sm" data-sg="3" data-i18n="sg3">
                Write a product description
              </button>
              <button type="button" className="btn btn-ghost btn-sm" data-sg="4" data-i18n="sg4">
                Reply to a customer
              </button>
            </div>
          </div>
        </div>

        <div className="msg-container">
          {messages.map((msg, idx) => (
            <div key={idx} className={`msg ${msg.role === "user" ? "user" : ""}`}>
              <div className="bub">
                <ReactMarkdown remarkPlugins={[remarkGfm]} />
              </div>
            </div>
          ))}
        </div>

        <div className="dock">
          <div className="atts" id="atts" hidden />
          <p className="ferr" id="ferr" role="alert" />
          <form className="composer" id="composer" autoComplete="off">
            <input
              type="file"
              id="fileIn"
              multiple
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif,text/*,.txt,.md,.csv,.tsv,.json,.xml,.html,.css,.js,.ts,.py,.sql,.yml,.yaml,.log"
            />
            <button
              type="button"
              className="cbtn plus"
              id="plus"
              data-ark="c_add"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            <textarea
              id="msg"
              rows={1}
              data-phk="c_ph"
              placeholder="Message S.E.N.T.R.Y…"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className="cbtn send"
              id="send"
              data-ark="c_send"
              disabled
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" fill="none" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}