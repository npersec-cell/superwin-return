import { createSupabaseAdminClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// Allowed MIME types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    // Require admin
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Invalid file type. Only JPG, PNG, GIF, WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === "prize-images");
    
    if (!bucketExists) {
      const { error: bucketError } = await supabase.storage.createBucket("prize-images", {
        public: true,
        allowedMimeTypes: ALLOWED_TYPES,
        fileSizeLimit: MAX_FILE_SIZE,
      });
      
      if (bucketError) {
        console.error("Failed to create bucket:", bucketError);
        return NextResponse.json(
          { ok: false, error: "Failed to create storage bucket" },
          { status: 500 }
        );
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const fileName = `${timestamp}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `prizes/${fileName}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("prize-images")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { ok: false, error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("prize-images")
      .getPublicUrl(filePath);

    return NextResponse.json({
      ok: true,
      url: publicUrlData.publicUrl,
    });
  } catch (error: any) {
    console.error("Upload API error:", error);
    
    if (error.message?.includes("Unauthorized") || error.message?.includes("Forbidden")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
