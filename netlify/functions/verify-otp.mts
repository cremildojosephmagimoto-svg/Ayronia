import type { Context, Config } from "@netlify/functions";

interface OTPStore {
  [phone: string]: {
    code: string;
    expires: number;
  };
}

const otpStore: OTPStore = {};

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { phone, code } = body;

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Phone number and OTP code are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const storedOTP = otpStore[phone];

    if (!storedOTP) {
      return new Response(
        JSON.stringify({ error: "No OTP found for this phone number" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (Date.now() > storedOTP.expires) {
      delete otpStore[phone];
      return new Response(
        JSON.stringify({ error: "OTP has expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (storedOTP.code !== code) {
      return new Response(
        JSON.stringify({ error: "Invalid OTP code" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    delete otpStore[phone];

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "OTP verified successfully" 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify OTP" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/verify-otp"
};

export { otpStore };
