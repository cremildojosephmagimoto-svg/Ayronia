import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface VerifyOTPData {
  email: string;
  code: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  verified: boolean;
  createdAt: string;
}

interface OTPData {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

interface Session {
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data: VerifyOTPData = await req.json();

    if (!data.email || !data.code) {
      return new Response(
        JSON.stringify({ error: "Email e código são obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const usersStore = getStore("users");
    const otpStore = getStore("otp-codes");
    const sessionsStore = getStore("sessions");

    const normalizedEmail = data.email.toLowerCase().trim();
    const otpData: OTPData | null = await otpStore.get(
      `otp:${normalizedEmail}`,
      { type: "json" }
    );

    if (!otpData) {
      return new Response(
        JSON.stringify({
          error:
            "Código de verificação não encontrado. Por favor, solicite um novo código.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (otpData.attempts >= 5) {
      await otpStore.delete(`otp:${normalizedEmail}`);
      return new Response(
        JSON.stringify({
          error:
            "Demasiadas tentativas. Por favor, solicite um novo código de verificação.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (Date.now() > otpData.expiresAt) {
      await otpStore.delete(`otp:${normalizedEmail}`);
      return new Response(
        JSON.stringify({
          error: "Código expirado. Por favor, solicite um novo código.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (otpData.code !== data.code.trim()) {
      otpData.attempts += 1;
      await otpStore.setJSON(`otp:${normalizedEmail}`, otpData);
      return new Response(
        JSON.stringify({
          error: `Código inválido. Tentativas restantes: ${5 - otpData.attempts}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const user: User | null = await usersStore.get(`user:${normalizedEmail}`, {
      type: "json",
    });

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Utilizador não encontrado. Por favor, registe-se novamente.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    user.verified = true;
    await usersStore.setJSON(`user:${normalizedEmail}`, user);

    await otpStore.delete(`otp:${normalizedEmail}`);

    const sessionToken = generateSessionToken();
    const session: Session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    await sessionsStore.setJSON(`session:${sessionToken}`, session);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email verificado com sucesso! Bem-vindo à Ayronia.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        sessionToken,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during OTP verification:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao verificar o código",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/auth/verify-otp",
};
