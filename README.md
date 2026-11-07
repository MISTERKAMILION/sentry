# S.E.N.T.R.Y - AI Product Compliance Assistant

**S.E.N.T.R.Y** (Strategic E-commerce Network for Task Research & Yield) is an AI-powered Product Compliance Assistant for e-commerce sellers. It helps entrepreneurs identify regulatory compliance risks before investing in inventory, using a Retrieval-Augmented Generation (RAG) pipeline with local legal databases.

## 🚀 Features

- **RAG-Backed AI**: Retrieves relevant legal information from a pgvector-enabled Supabase database before answering
- **Groq Streaming**: Fast streaming responses from `openai/gpt-oss-20b` via server-side `groq-sdk`
- **Evidence Citation**: AI cites `[EVIDENCE_ID]` tags when database has matching legal evidence
- **Safe Fallback**: When no database evidence found, shows warning label + general guidance (without fabricating legal citations)
- **Always includes disclaimer**: "This is not legal advice"
- **Supabase Authentication**: Email/password protected routes
- **Control-Room Aesthetic**: Dark UI matching `S.E.N.T.R.Y(1).html` design with glitch/aurora animations
- **Design Tokens**: `--ink:#09030f`, `--pink:#f45fc8`, `--violet:#8a12c9`, Oxanium/Cairo fonts

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16.4.3 (App Router) |
| **Language** | TypeScript 5.x |
| **UI** | React 19.3.0, Tailwind-style CSS custom properties |
| **Backend** | Node.js, Groq SDK, Supabase JS 2.109.0 |
| **RAG Pipeline** | sentence-transformers/all-MiniLM-L6-v2 (384-dim embeddings) → Supabase `match_legal_chunks` (pgvector cosine similarity) |
| **Database** | Supabase with pgvector, legal_chunks table |
| **CSS Design** | Custom properties from `S.E.N.T.R.Y(1).html` (--ink, --pink, --violet, gradients, glitch effects) |
| **Deployment** | `pnpm dev` on `:3000` |

## 📦 Installation

### Prerequisites
- Node.js 20+ (v22 recommended)
- pnpm 12+
- Supabase project (free tier works)
- Groq API key

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/S.E.N.T.R.Y.git
cd S.E.N.T.R.Y
pnpm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Groq (get your key from https://groq.com/console)
GROQ_API_KEY=gsk_your_groq_key

# GovInfo (optional, for legal data ingestion)
# Get your key from https://www.govinfo.gov/ and set as GOVINFO_API_KEY=your_key
GOVINFO_API_KEY=
```

### 3. Apply Database Migration
Go to: `https://supabase.com/dashboard/project/bscbkhwxbcveirrqcblb/sql/new`

Run the SQL migration from `supabase/migrations/20261101000000_create_legal_rag_schema.sql` which creates:
- `legal_sources`, `legal_documents`, `legal_document_versions` tables
- `legal_chunks` table with `vector(384)` column
- `ingestion_jobs` table
- HNSW index on vector for similarity search
- `match_legal_chunks()` function for cosine similarity retrieval

### 4. Start the Development Server
```bash
pnpm dev
```
Server runs on `http://localhost:3000`

### 5. (Optional) Ingest Legal Data
```bash
python3 workers/legal-ingestion/ingest_govinfo.py
```
This fetches GovInfo granules and generates 384-dim embeddings for the legal database.

## 🔐 How to Set Your API Keys

To get the AI features working, you need to obtain API keys and add them to `.env.local`:

### 1. Groq API Key (Required for AI responses)
1. Go to [https://groq.com/console](https://groq.com/console) and sign up/log in
2. Click on "API Keys" in the sidebar
3. Click "Create Key" and give it a name
4. Copy the generated key (starts with `gsk_`)
5. Add it to your `.env.local`:
   ```env
   GROQ_API_KEY=gsk_your_generated_key_here
   ```

### 2. Supabase (Required for authentication & database)
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (`bscbkhwxbcveirrqcblb`)
3. Go to **Settings → API**
4. Copy these values:
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key**: `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)
5. Add them to `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### 3. GovInfo API Key (Optional, for legal database population)
1. Go to [https://www.govinfo.gov/](https://www.govinfo.gov/)
2. Create an account or log in
3. Get an API key from the settings/page
4. Add to `.env.local`:
   ```env
   GOVINFO_API_KEY=your_govinfo_key
   ```
   *Note: Without this key, the legal database will be empty, and the AI will always show the "no evidence found" guidance.*

### Verification
After adding your keys, run:
```bash
pnpm dev
```
The server should start on `:3000` and the AI endpoints will work.

## 📱 Usage

### Protected Routes
- `/` - Home page (hero, stage/ACR sections, chat access)
- `/login` - Supabase auth (sign in / sign up)
- `/chat` - AI chat (requires authentication)
- `/my-scans` - Scan history (future feature)
- `/scan/[id]` - Scan details (future feature)

### How to Use the Chat
1. Sign up / log in at `/login`
2. Go to `/chat`
3. Send a message about a product you're considering selling

**Example prompts:**
- "I want to sell an LED dog collar. What are the compliance risks?"
- "Give me the FCC rules for wireless chargers"
- "Where can I find the official UKCA rules for electronic toys?"

### AI Behavior
- **When database has evidence**: AI responds with compliance guidance and cites `[EVIDENCE_ID]` tags linking to the source
- **When no database evidence**: AI shows `⚠️ Note: I could not find this in the verified legal database, so this is general AI guidance.` followed by helpful general guidance + disclaimer
- **Always**: Includes "This is not legal advice" disclaimer

## 📁 Project Structure

```
S.E.N.T.R.Y/
├── app/                    # Next.js 16 App Router
│   ├── api/chat/route.ts   # RAG + Groq streaming endpoint
│   ├── api/embeddings/route.ts  # Query embedding service
│   ├── api/ingest/legal/route.ts   # Python worker endpoint
│   ├── page.tsx           # Home page (.hero, .stage, .acr, .contact)
│   ├── login/page.tsx    # Login page (.auth, .side, .log, .card)
│   └── chat/page.tsx     # Chat page (.chat, .stream, .composer)
├── supabase/migrations/   # pgvector(384) schema + match function
├── workers/legal-ingestion/ingest_govinfo.py  # Python ingestion script
├── app/globals.css        # Design tokens from S.E.N.T.R.Y(1).html
├── lib/supabase/service.ts  # Supabase service client
└── MIGRATION_TO_APPLY.sql  # One-click migration SQL
```

## 🎨 Design

The UI is ported from `S.E.N.T.R.Y(1).html` with these design tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `--ink` | `#09030f` | Main background |
| `--ink-2` | `#12071f` | Card backgrounds |
| `--text` | `#f4edfc` | Primary text |
| `--muted` | `#a999c4` | Muted/text-secondary |
| `--pink` | `#f45fc8` | Accent color, buttons, links |
| `--pink-soft` | `#f8aae7` | Hover states, gradients |
| `--violet` | `#8a12c9` | Secondary accent |
| `--f-display` | `Oxanium,Cairo,sans-serif` | Headlines, buttons |
| `--f-body` | `Outfit,Cairo,sans-serif` | Body text |

**Key UI Elements:**
- Glitch animation effects on logo
- Aurorae (floating colored circles)
- Conic-gradient border animations on cards
- Message bubbles with rounded corners and drop shadows
- Purple pill links with 📄 document icons for URLs
- Tables with alternating row colors and horizontal scrolling on mobile

## 🤖 AI Pipeline (How It Works)

1. **User sends query** → `/api/chat` (POST, authenticated)
2. **Embedding generated** → `/api/embeddings` (queries `http://localhost:8000/embed` or inline)
3. **Similarity search** → Supabase `match_legal_chunks()` (pgvector cosine similarity, 384-dim)
4. **Groq generation** → `openai/gpt-oss-20b` with system prompt:
   - **If evidence found**: Cite `[EVIDENCE_ID]` tags, provide compliance guidance
   - **If no evidence**: Show warning + general guidance + disclaimer
5. **Streaming response** → Sent back to client via `response.body.getReader()` + `TextDecoder`
6. **UI renders** → Markdown tables, purple pill links, citation highlights

## 🚧 Development Notes

### Server Required
The AI endpoints require the Next.js dev server running on `:3000`. The Python ingestion worker also needs the server running.

### TypeScript
```bash
pnpm tsc --noEmit  # Compiles clean
```

### Migration
The SQL migration must be applied once per Supabase project. See `MIGRATION_TO_APPLY.sql` for the exact 92-line migration.

### Python Worker
To populate the legal database with GovInfo data:
1. Set `GOVINFO_API_KEY` in `.env.local` (optional - without it, AI shows "no evidence" guidance)
2. Run: `python3 workers/legal-ingestion/ingest_govinfo.py`
3. This fetches GovInfo granules and generates 384-dim embeddings for the `legal_chunks` table
*For detailed instructions on setting up your API keys, see the "How to Set Your API Keys" section above.*

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ for e-commerce entrepreneurs who need compliance clarity before investing in inventory.**

*S.E.N.T.R.Y: Always watching. Always working.*# Sat Nov  7 03:07:52 PM +00 2026
