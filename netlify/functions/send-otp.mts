import type { Context, Config } from "@netlify/functions";

interface OTPStore {
  [phone: string]: {
    code: string;
    expires: number;
  };
}

const otpStore: OTPStore = {};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const otp = generateOTP();
    const expires = Date.now() + 5 * 60 * 1000;

    otpStore[phone] = { code: otp, expires };

    console.log(`OTP for ${phone}: ${otp}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "OTP sent successfully",
        otp: otp
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending OTP:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send OTP" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/send-otp"
};

export { otpStore };
