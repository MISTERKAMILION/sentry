import { NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (!authorization || !accessToken) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createRequestSupabaseClient(authorization);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { data: scan, error } = await supabase
      .from("scans")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const { data: checks } = await supabase
      .from("scan_checks")
      .select("*")
      .eq("scan_id", id);

    return NextResponse.json({
      ...scan,
      checks: checks || [],
    });
  } catch (error) {
    console.error("Get scan failed", error);
    return NextResponse.json({ error: "Failed to get scan" }, { status: 500 });
  }
}
