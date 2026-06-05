import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const bypassSecret = process.env.DEV_BYPASS_SECRET;
  const devUserId = process.env.DEV_USER_ID;
  const url = new URL(request.url);
  const urlBypass = url.searchParams.get("dev_bypass");

  return NextResponse.json({
    debug: true,
    requestUrl: request.url,
    hasBypassSecret: !!bypassSecret,
    bypassSecretLength: bypassSecret?.length,
    hasDevUserId: !!devUserId,
    devUserId,
    urlBypassParam: urlBypass,
    urlBypassLength: urlBypass?.length,
    paramsMatch: urlBypass === bypassSecret,
  });
}
