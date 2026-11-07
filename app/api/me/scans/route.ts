import { NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (!authorization || !accessToken) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const supabase = createRequestSupabaseClient(authorization);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { data: scans, error } = await supabase
      .from("scans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to get scans" }, { status: 500 });
    }

    return NextResponse.json({ scans: scans || [] });
  } catch (error) {
    console.error("Get scans failed", error);
    return NextResponse.json({ error: "Failed to get scans" }, { status: 500 });
  }
}
