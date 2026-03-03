import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://www.ugc.gov.in/universitydetails/Getuniversity_details?unitypeID=0",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.ugc.gov.in/universitydetails/university",
          "Origin": "https://www.ugc.gov.in",
          "X-Requested-With": "XMLHttpRequest",
        },
        // In Next.js, we can control caching
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `UGC API returned status: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("UGC Proxy Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during UGC fetch" },
      { status: 500 }
    );
  }
}
